export type StakeMatch = {
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

export type StakeEntry = {
  match_id: string;
  discord_id: string;
  wallet_pubkey: string;
  deposit_signature: string;
  lamports: number;
  created_at: number;
};

async function jsonOrThrow<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    let detail: string | undefined;
    try {
      const j = (await resp.json()) as { error?: string };
      detail = j.error;
    } catch {
      // noop
    }
    throw new Error(detail ?? `HTTP ${resp.status}`);
  }
  return resp.json() as Promise<T>;
}

export async function getEscrow(): Promise<{ cluster: string; pubkey: string }> {
  return jsonOrThrow(await fetch("/api/stake/escrow"));
}

export async function getEscrowBalance(): Promise<{ lamports: number }> {
  return jsonOrThrow(await fetch("/api/stake/escrow/balance"));
}

export async function listMatches(): Promise<{ matches: StakeMatch[] }> {
  return jsonOrThrow(await fetch("/api/stake/matches"));
}

export async function getMatch(id: string): Promise<{ match: StakeMatch; entries: StakeEntry[] }> {
  return jsonOrThrow(await fetch(`/api/stake/match/${id}`));
}

export async function createStakeMatch(stakeSol: number): Promise<{ match: StakeMatch }> {
  return jsonOrThrow(
    await fetch("/api/stake/match", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ stake_sol: stakeSol }),
    }),
  );
}

export async function joinStakeMatch(matchId: string, signature: string): Promise<{ ok: boolean; entries: StakeEntry[] }> {
  return jsonOrThrow(
    await fetch(`/api/stake/match/${matchId}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ signature }),
    }),
  );
}

export async function startStakeMatch(matchId: string): Promise<{ match: StakeMatch }> {
  return jsonOrThrow(
    await fetch(`/api/stake/match/${matchId}/start`, {
      method: "POST",
      credentials: "include",
    }),
  );
}

export async function finishStakeMatch(matchId: string, winnerDiscordId: string) {
  return jsonOrThrow<{ ok: boolean; signature: string; lamports: number; match: StakeMatch }>(
    await fetch(`/api/stake/match/${matchId}/finish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ winner_discord_id: winnerDiscordId }),
    }),
  );
}

export async function cancelStakeMatch(matchId: string) {
  return jsonOrThrow<{ ok: boolean; refunds: { discord_id: string; signature: string; lamports: number }[] }>(
    await fetch(`/api/stake/match/${matchId}/cancel`, {
      method: "POST",
      credentials: "include",
    }),
  );
}
