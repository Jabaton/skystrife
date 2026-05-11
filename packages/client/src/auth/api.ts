export type AuthUser = {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
  wallet_pubkey: string | null;
  is_admin: boolean;
};

const j = { "content-type": "application/json" } as const;

export async function fetchMe(): Promise<AuthUser | null> {
  const r = await fetch("/api/auth/me", { credentials: "include" });
  if (!r.ok) return null;
  const data = (await r.json()) as { user: AuthUser | null };
  return data.user;
}

export async function startDiscordLogin(redirectTo?: string): Promise<string> {
  const qs = redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : "";
  const r = await fetch(`/api/auth/discord/start${qs}`, { credentials: "include" });
  if (!r.ok) throw new Error(`discord/start ${r.status}`);
  const { url } = (await r.json()) as { url: string };
  return url;
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
}

export async function getWalletNonce(pubkey: string): Promise<{
  nonce: string;
  issuedAt: string;
  message: string;
}> {
  const r = await fetch(
    `/api/auth/wallet/nonce?pubkey=${encodeURIComponent(pubkey)}`,
    { credentials: "include" },
  );
  if (!r.ok) throw new Error(`wallet/nonce ${r.status}`);
  return (await r.json()) as { nonce: string; issuedAt: string; message: string };
}

export async function bindWallet(args: {
  pubkey: string;
  signatureBase58: string;
  message: string;
}): Promise<{ wallet_pubkey: string }> {
  const r = await fetch("/api/auth/wallet/bind", {
    method: "POST",
    headers: j,
    credentials: "include",
    body: JSON.stringify(args),
  });
  if (!r.ok) {
    const err = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `wallet/bind ${r.status}`);
  }
  return (await r.json()) as { wallet_pubkey: string };
}

export async function unbindWallet(): Promise<void> {
  await fetch("/api/auth/wallet/unbind", { method: "POST", credentials: "include" });
}

export type AuthServerConfig = {
  solanaCluster: "devnet" | "mainnet-beta" | "testnet";
  discordGuildId: string;
  discordChannelId: string;
};

export async function fetchAuthConfig(): Promise<AuthServerConfig> {
  const r = await fetch("/api/auth/config", { credentials: "include" });
  if (!r.ok) throw new Error(`auth/config ${r.status}`);
  return (await r.json()) as AuthServerConfig;
}
