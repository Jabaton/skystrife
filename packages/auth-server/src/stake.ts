import { Router, type Request, type Response, type NextFunction } from "express";
import { randomBytes } from "node:crypto";

import { db, getUser } from "./db.js";
import { env } from "./env.js";
import {
  getBalanceLamports,
  getEscrowAddress,
  payout,
  verifyIncomingTransfer,
} from "./solana.js";

db.exec(`
  CREATE TABLE IF NOT EXISTS stake_matches (
    id TEXT PRIMARY KEY,
    chain_match_entity TEXT,
    stake_lamports INTEGER NOT NULL,
    escrow_pubkey TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    winner_discord_id TEXT,
    payout_signature TEXT,
    payout_lamports INTEGER,
    created_by_discord_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS stake_entries (
    match_id TEXT NOT NULL,
    discord_id TEXT NOT NULL,
    wallet_pubkey TEXT NOT NULL,
    deposit_signature TEXT NOT NULL,
    lamports INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (match_id, discord_id)
  );
`);

type StakeMatchRow = {
  id: string;
  chain_match_entity: string | null;
  stake_lamports: number;
  escrow_pubkey: string;
  status: "open" | "live" | "finished" | "paid" | "cancelled";
  winner_discord_id: string | null;
  payout_signature: string | null;
  payout_lamports: number | null;
  created_by_discord_id: string;
  created_at: number;
  updated_at: number;
};

type StakeEntryRow = {
  match_id: string;
  discord_id: string;
  wallet_pubkey: string;
  deposit_signature: string;
  lamports: number;
  created_at: number;
};

function getMatch(id: string): StakeMatchRow | undefined {
  return db.prepare(`SELECT * FROM stake_matches WHERE id = ?`).get(id) as
    | StakeMatchRow
    | undefined;
}

function listEntries(matchId: string): StakeEntryRow[] {
  return db
    .prepare(`SELECT * FROM stake_entries WHERE match_id = ? ORDER BY created_at ASC`)
    .all(matchId) as StakeEntryRow[];
}

export const stakeRouter = Router();

function requireSession(req: Request, res: Response, next: NextFunction) {
  if (!req.session) return res.status(401).json({ error: "unauthorized" });
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session) return res.status(401).json({ error: "unauthorized" });
  if (req.session.sub !== env.DISCORD_ADMIN_USER_ID) {
    return res.status(403).json({ error: "admin only" });
  }
  next();
}

stakeRouter.get("/escrow", (_req, res) => {
  return res.json({
    cluster: env.SOLANA_CLUSTER,
    pubkey: getEscrowAddress(),
  });
});

stakeRouter.get("/escrow/balance", async (_req, res) => {
  try {
    const lamports = await getBalanceLamports(getEscrowAddress());
    return res.json({ lamports });
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
});

stakeRouter.post("/match", requireAdmin, (req, res) => {
  const body = req.body as { stake_sol?: number; chain_match_entity?: string };
  const stakeSol = Number(body.stake_sol);
  if (!Number.isFinite(stakeSol) || stakeSol <= 0) {
    return res.status(400).json({ error: "stake_sol must be > 0" });
  }
  const lamports = Math.round(stakeSol * 1_000_000_000);
  const id = randomBytes(8).toString("hex");
  const now = Date.now();
  db.prepare(
    `INSERT INTO stake_matches
       (id, chain_match_entity, stake_lamports, escrow_pubkey, status,
        created_by_discord_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'open', ?, ?, ?)`,
  ).run(id, body.chain_match_entity ?? null, lamports, getEscrowAddress(), req.session!.sub, now, now);
  return res.json({ match: getMatch(id), escrow_pubkey: getEscrowAddress() });
});

stakeRouter.get("/match/:id", (req, res) => {
  const m = getMatch(req.params.id);
  if (!m) return res.status(404).json({ error: "not found" });
  return res.json({ match: m, entries: listEntries(m.id) });
});

stakeRouter.get("/matches", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT * FROM stake_matches WHERE status IN ('open','live') ORDER BY created_at DESC LIMIT 50`,
    )
    .all() as StakeMatchRow[];
  return res.json({ matches: rows });
});

stakeRouter.post("/match/:id/join", requireSession, async (req, res) => {
  const m = getMatch(req.params.id);
  if (!m) return res.status(404).json({ error: "match not found" });
  if (m.status !== "open") return res.status(400).json({ error: `match status is ${m.status}` });
  const user = getUser(req.session!.sub);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  if (!user.wallet_pubkey) return res.status(400).json({ error: "wallet not connected" });

  const body = req.body as { signature?: string };
  if (!body.signature) return res.status(400).json({ error: "signature required" });

  const existing = db
    .prepare(`SELECT 1 FROM stake_entries WHERE match_id = ? AND discord_id = ?`)
    .get(m.id, user.discord_id);
  if (existing) return res.status(400).json({ error: "already joined" });

  const verification = await verifyIncomingTransfer({
    signature: body.signature,
    fromPubkey: user.wallet_pubkey,
    toPubkey: m.escrow_pubkey,
    minLamports: m.stake_lamports,
  });
  if (!verification.ok) {
    return res.status(400).json({ error: verification.error ?? "transfer verification failed" });
  }

  const now = Date.now();
  db.prepare(
    `INSERT INTO stake_entries
       (match_id, discord_id, wallet_pubkey, deposit_signature, lamports, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(m.id, user.discord_id, user.wallet_pubkey, body.signature, verification.lamports, now);

  return res.json({ ok: true, entries: listEntries(m.id) });
});

stakeRouter.post("/match/:id/start", requireAdmin, (req, res) => {
  const m = getMatch(req.params.id);
  if (!m) return res.status(404).json({ error: "match not found" });
  if (m.status !== "open") return res.status(400).json({ error: `match status is ${m.status}` });
  db.prepare(`UPDATE stake_matches SET status='live', updated_at=? WHERE id=?`).run(Date.now(), m.id);
  return res.json({ match: getMatch(m.id) });
});

stakeRouter.post("/match/:id/finish", requireAdmin, async (req, res) => {
  const m = getMatch(req.params.id);
  if (!m) return res.status(404).json({ error: "match not found" });
  if (m.status === "paid") return res.status(400).json({ error: "already paid" });
  if (m.status === "cancelled") return res.status(400).json({ error: "match was cancelled" });

  const body = req.body as { winner_discord_id?: string };
  if (!body.winner_discord_id) {
    return res.status(400).json({ error: "winner_discord_id required" });
  }
  const entries = listEntries(m.id);
  const winnerEntry = entries.find((e) => e.discord_id === body.winner_discord_id);
  if (!winnerEntry) return res.status(400).json({ error: "winner did not stake into this match" });

  const totalLamports = entries.reduce((acc, e) => acc + e.lamports, 0);
  if (totalLamports <= 0) {
    return res.status(400).json({ error: "no funds to pay out" });
  }

  try {
    const { signature } = await payout({
      toPubkey: winnerEntry.wallet_pubkey,
      lamports: totalLamports,
    });
    db.prepare(
      `UPDATE stake_matches SET status='paid', winner_discord_id=?, payout_signature=?,
         payout_lamports=?, updated_at=? WHERE id=?`,
    ).run(body.winner_discord_id, signature, totalLamports, Date.now(), m.id);
    return res.json({ ok: true, signature, lamports: totalLamports, match: getMatch(m.id) });
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
});

stakeRouter.post("/match/:id/cancel", requireAdmin, async (req, res) => {
  const m = getMatch(req.params.id);
  if (!m) return res.status(404).json({ error: "match not found" });
  if (m.status === "paid" || m.status === "cancelled") {
    return res.status(400).json({ error: `match status is ${m.status}` });
  }
  const entries = listEntries(m.id);
  const refunds: { discord_id: string; signature: string; lamports: number }[] = [];
  for (const e of entries) {
    try {
      const { signature } = await payout({ toPubkey: e.wallet_pubkey, lamports: e.lamports });
      refunds.push({ discord_id: e.discord_id, signature, lamports: e.lamports });
    } catch (err) {
      return res.status(500).json({ error: `refund for ${e.discord_id} failed: ${(err as Error).message}`, refunds });
    }
  }
  db.prepare(`UPDATE stake_matches SET status='cancelled', updated_at=? WHERE id=?`).run(
    Date.now(),
    m.id,
  );
  return res.json({ ok: true, refunds });
});
