import { useCallback, useEffect, useState } from "react";
import { Button } from "../ui/Theme/SkyStrife/Button";
import { useAuth } from "../../auth/AuthContext";
import {
  StakeMatch,
  StakeEntry,
  cancelStakeMatch,
  createStakeMatch,
  finishStakeMatch,
  getEscrow,
  getEscrowBalance,
  getMatch,
  joinStakeMatch,
  listMatches,
} from "../../auth/stakeApi";
import { sendSolToEscrow } from "../../auth/solana";

const lamportsToSol = (l: number) => (l / 1_000_000_000).toFixed(4);

function truncate(s: string, n = 6) {
  if (s.length <= n * 2 + 3) return s;
  return `${s.slice(0, n)}…${s.slice(-n)}`;
}

function StakeRow({
  m,
  refresh,
  myDiscordId,
  myWallet,
  isAdmin,
}: {
  m: StakeMatch;
  refresh: () => Promise<void>;
  myDiscordId: string | null;
  myWallet: string | null;
  isAdmin: boolean;
}) {
  const [entries, setEntries] = useState<StakeEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    try {
      const r = await getMatch(m.id);
      setEntries(r.entries);
    } catch (e) {
      console.error("[pool] getMatch failed", e);
    }
  }, [m.id]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries, m.updated_at]);

  const alreadyJoined = entries.some((e) => e.discord_id === myDiscordId);
  const canJoin = m.status === "open" && myDiscordId && myWallet && !alreadyJoined;

  const onJoin = async () => {
    if (!myWallet) return;
    setBusy(true);
    setErr(null);
    try {
      const { signature } = await sendSolToEscrow({
        fromPubkey: myWallet,
        toPubkey: m.escrow_pubkey,
        lamports: m.stake_lamports,
        cluster: "devnet",
      });
      await joinStakeMatch(m.id, signature);
      await loadEntries();
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onFinish = async (winnerDiscordId: string) => {
    setBusy(true);
    setErr(null);
    try {
      await finishStakeMatch(m.id, winnerDiscordId);
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onCancel = async () => {
    if (!confirm("Cancel match and refund all stakers?")) return;
    setBusy(true);
    setErr(null);
    try {
      await cancelStakeMatch(m.id);
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const totalLamports = entries.reduce((acc, e) => acc + e.lamports, 0);

  return (
    <div className="border border-ss-stroke rounded p-4 bg-ss-bg-2 mb-3">
      <div className="flex items-center justify-between">
        <div className="font-mono text-sm">match {truncate(m.id, 4)}</div>
        <div className="flex items-center gap-3">
          <span
            className={
              m.status === "paid"
                ? "text-green-600 uppercase text-xs"
                : m.status === "cancelled"
                ? "text-ss-text-light uppercase text-xs"
                : m.status === "open"
                ? "text-ss-text-link uppercase text-xs"
                : "text-ss-gold uppercase text-xs"
            }
          >
            {m.status}
          </span>
          <span className="text-sm">
            stake <b>{lamportsToSol(m.stake_lamports)} SOL</b>
          </span>
          <span className="text-xs text-ss-text-light">
            pool {lamportsToSol(totalLamports)} SOL
          </span>
        </div>
      </div>

      <div className="h-2" />

      <div className="text-xs text-ss-text-light">
        Players ({entries.length}):
      </div>
      {entries.length === 0 ? (
        <div className="text-sm text-ss-text-x-light">— no one has staked yet —</div>
      ) : (
        <ul className="text-sm font-mono space-y-1">
          {entries.map((e) => (
            <li key={e.discord_id} className="flex justify-between items-center">
              <span>
                {truncate(e.wallet_pubkey, 6)}{" "}
                <span className="text-ss-text-light">
                  ({e.discord_id === myDiscordId ? "you" : "discord:" + e.discord_id.slice(-4)})
                </span>
              </span>
              <span className="text-ss-text-light">{lamportsToSol(e.lamports)} SOL</span>
            </li>
          ))}
        </ul>
      )}

      {m.status === "paid" && m.payout_signature && (
        <div className="mt-2 text-sm">
          Winner paid <b>{lamportsToSol(m.payout_lamports ?? 0)} SOL</b>.{" "}
          <a
            href={`https://explorer.solana.com/tx/${m.payout_signature}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
            className="text-ss-text-link underline"
          >
            tx
          </a>
        </div>
      )}

      {err && <div className="mt-2 text-sm text-red-600">{err}</div>}

      <div className="h-3" />

      <div className="flex flex-wrap gap-2">
        {canJoin && (
          <Button buttonType="primary" onClick={onJoin} disabled={busy}>
            {busy ? "…signing" : `stake ${lamportsToSol(m.stake_lamports)} SOL & join`}
          </Button>
        )}
        {alreadyJoined && m.status === "open" && (
          <span className="text-xs text-ss-gold uppercase self-center">already staked</span>
        )}
        {isAdmin && m.status === "open" && entries.length >= 2 && (
          <>
            <span className="text-xs text-ss-text-light uppercase self-center">finish & pay:</span>
            {entries.map((e) => (
              <Button
                key={e.discord_id}
                buttonType="secondary"
                onClick={() => onFinish(e.discord_id)}
                disabled={busy}
              >
                {e.discord_id === myDiscordId ? "me" : truncate(e.wallet_pubkey, 4)}
              </Button>
            ))}
          </>
        )}
        {isAdmin && (m.status === "open" || m.status === "live") && (
          <Button buttonType="danger" onClick={onCancel} disabled={busy}>
            cancel & refund
          </Button>
        )}
      </div>
    </div>
  );
}

export function SolanaPool() {
  const { user, isAdmin } = useAuth();
  const [matches, setMatches] = useState<StakeMatch[]>([]);
  const [escrow, setEscrow] = useState<{ cluster: string; pubkey: string } | null>(null);
  const [balanceLamports, setBalanceLamports] = useState<number | null>(null);
  const [newStake, setNewStake] = useState("0.01");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [m, e, b] = await Promise.all([
        listMatches(),
        getEscrow(),
        getEscrowBalance().catch(() => ({ lamports: 0 })),
      ]);
      setMatches(m.matches);
      setEscrow(e);
      setBalanceLamports(b.lamports);
    } catch (e) {
      console.error("[pool] refresh failed", e);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  const onCreate = async () => {
    const s = parseFloat(newStake);
    if (!Number.isFinite(s) || s <= 0) {
      setErr("Enter a stake amount > 0");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await createStakeMatch(s);
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h2 className="text-3xl font-bold uppercase mb-2">Solana Stake Pool</h2>
      <p className="text-ss-text-light">
        Players stake SOL into the escrow before a match. Winner takes the
        whole pool. Loser loses their stake. All on Solana devnet.
      </p>

      <div className="h-6" />

      <div className="border border-ss-stroke rounded p-4 bg-ss-bg-2 flex flex-col gap-1">
        <div className="flex justify-between items-center">
          <span className="text-xs uppercase text-ss-text-light">Escrow ({escrow?.cluster ?? "devnet"})</span>
          {escrow && (
            <a
              className="text-xs text-ss-text-link underline"
              href={`https://explorer.solana.com/address/${escrow.pubkey}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
            >
              explorer
            </a>
          )}
        </div>
        <div className="font-mono text-sm">{escrow?.pubkey ?? "—"}</div>
        <div className="text-xs text-ss-text-light">
          Balance:{" "}
          {balanceLamports === null
            ? "…"
            : `${lamportsToSol(balanceLamports)} SOL`}
        </div>
      </div>

      <div className="h-6" />

      {isAdmin && (
        <div className="border border-ss-stroke rounded p-4 bg-ss-bg-1">
          <div className="text-xs uppercase text-ss-text-light mb-2">Admin: create new stake match</div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.001"
              min="0"
              className="bg-ss-bg-0 border border-ss-stroke rounded px-2 py-1 w-32"
              value={newStake}
              onChange={(e) => setNewStake(e.target.value)}
            />
            <span className="text-ss-text-light">SOL</span>
            <Button buttonType="primary" onClick={onCreate} disabled={busy}>
              {busy ? "…creating" : "create match"}
            </Button>
          </div>
          {err && <div className="mt-2 text-sm text-red-600">{err}</div>}
        </div>
      )}

      {!isAdmin && (
        <div className="text-sm text-ss-text-light">
          Only admin can create new matches. Wait for one to appear below, then click <b>stake & join</b>.
        </div>
      )}

      <div className="h-6" />

      <h3 className="text-xl font-bold uppercase mb-2">Open matches</h3>
      {matches.length === 0 ? (
        <div className="text-sm text-ss-text-light">— no open matches —</div>
      ) : (
        matches.map((m) => (
          <StakeRow
            key={m.id}
            m={m}
            refresh={refresh}
            myDiscordId={user?.id ?? null}
            myWallet={user?.wallet_pubkey ?? null}
            isAdmin={isAdmin}
          />
        ))
      )}
    </div>
  );
}
