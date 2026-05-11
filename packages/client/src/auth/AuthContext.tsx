import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  type AuthUser,
  fetchAuthConfig,
  fetchMe,
  logout as apiLogout,
  startDiscordLogin,
  getWalletNonce,
  bindWallet,
  unbindWallet as apiUnbindWallet,
} from "./api";
import {
  connectPhantom,
  disconnectPhantom,
  isPhantomInstalled,
  PHANTOM_INSTALL_URL,
  signMessage,
} from "./phantom";

export type AuthState = {
  loading: boolean;
  user: AuthUser | null;
  solanaCluster: "devnet" | "mainnet-beta" | "testnet" | null;
  isAdmin: boolean;
  hasDiscord: boolean;
  hasWallet: boolean;
  loginWithDiscord: () => Promise<void>;
  connectWallet: () => Promise<string>;
  disconnectWallet: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  phantomInstalled: boolean;
  phantomInstallUrl: string;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [cluster, setCluster] = useState<AuthState["solanaCluster"]>(null);

  const refresh = useCallback(async () => {
    const me = await fetchMe();
    setUser(me);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [me, cfg] = await Promise.all([fetchMe(), fetchAuthConfig().catch(() => null)]);
        setUser(me);
        if (cfg) setCluster(cfg.solanaCluster);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loginWithDiscord = useCallback(async () => {
    const url = await startDiscordLogin(window.location.origin + window.location.pathname);
    window.location.href = url;
  }, []);

  const connectWallet = useCallback(async () => {
    if (!isPhantomInstalled()) {
      window.open(PHANTOM_INSTALL_URL, "_blank", "noreferrer");
      throw new Error("Phantom wallet is not installed");
    }
    const pubkey = await connectPhantom();
    const { message } = await getWalletNonce(pubkey);
    const signatureBase58 = await signMessage(message);
    await bindWallet({ pubkey, signatureBase58, message });
    await refresh();
    return pubkey;
  }, [refresh]);

  const disconnectWallet = useCallback(async () => {
    try {
      await disconnectPhantom();
    } finally {
      await apiUnbindWallet();
      await refresh();
    }
  }, [refresh]);

  const logout = useCallback(async () => {
    await apiLogout();
    try {
      await disconnectPhantom();
    } catch {
      // noop
    }
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      user,
      solanaCluster: cluster,
      isAdmin: !!user?.is_admin,
      hasDiscord: !!user,
      hasWallet: !!user?.wallet_pubkey,
      loginWithDiscord,
      connectWallet,
      disconnectWallet,
      logout,
      refresh,
      phantomInstalled: typeof window !== "undefined" ? isPhantomInstalled() : false,
      phantomInstallUrl: PHANTOM_INSTALL_URL,
    }),
    [loading, user, cluster, loginWithDiscord, connectWallet, disconnectWallet, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
