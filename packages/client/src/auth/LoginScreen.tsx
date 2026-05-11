import { useState } from "react";
import { useAuth } from "./AuthContext";

const CARD: React.CSSProperties = {
  background: "#FAF7EF",
  border: "1px solid #ddd6c1",
  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
  borderRadius: 8,
};

const BG: React.CSSProperties = {
  background:
    "linear-gradient(152deg, rgba(244,243,241,0.55) 0%, rgba(244,243,241,0.45) 100%), url(/assets/ship-background.jpeg)",
  backgroundSize: "cover",
  backgroundPosition: "right",
};

export function LoginScreen() {
  const { user, hasWallet, loginWithDiscord, connectWallet, logout, phantomInstalled, phantomInstallUrl, solanaCluster } =
    useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"discord" | "phantom" | null>(null);

  const handleDiscord = async () => {
    setBusy("discord");
    setError(null);
    try {
      await loginWithDiscord();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handlePhantom = async () => {
    setBusy("phantom");
    setError(null);
    try {
      await connectWallet();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const step: "discord" | "wallet" | "done" = !user ? "discord" : !hasWallet ? "wallet" : "done";

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center" style={BG}>
      <div style={CARD} className="w-[520px] max-w-[92vw] p-10 flex flex-col items-center">
        <div
          className="text-center"
          style={{
            fontFamily: "monospace",
            fontSize: 64,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1,
            color: "#1a1a1a",
          }}
        >
          Sky Strife
        </div>

        <div className="h-6" />

        {step === "discord" && (
          <>
            <div className="text-center text-sm text-neutral-700 max-w-[400px]">
              Sign in with Discord to play. Your in-game name will be taken from your Discord
              display name and stays the same across matches.
            </div>
            <div className="h-6" />
            <button
              onClick={handleDiscord}
              disabled={busy === "discord"}
              className="w-full"
              style={{
                padding: "14px 18px",
                fontSize: 16,
                fontWeight: 700,
                color: "white",
                background: "#5865F2",
                borderRadius: 6,
                border: "1px solid #4752C4",
                cursor: busy ? "wait" : "pointer",
              }}
            >
              {busy === "discord" ? "Opening Discord..." : "Sign in with Discord"}
            </button>
          </>
        )}

        {step === "wallet" && (
          <>
            <div className="text-center text-sm text-neutral-700">
              Hi, <b>{user!.global_name ?? user!.username}</b>!
            </div>
            <div className="h-2" />
            <div className="text-center text-sm text-neutral-700 max-w-[420px]">
              Now connect your Phantom wallet — match winnings will be paid to it and your
              stakes will be charged from it. Network: <b>{solanaCluster ?? "devnet"}</b>.
            </div>
            <div className="h-6" />
            {phantomInstalled ? (
              <button
                onClick={handlePhantom}
                disabled={busy === "phantom"}
                className="w-full"
                style={{
                  padding: "14px 18px",
                  fontSize: 16,
                  fontWeight: 700,
                  color: "white",
                  background: "#AB9FF2",
                  borderRadius: 6,
                  border: "1px solid #8E80E8",
                  cursor: busy ? "wait" : "pointer",
                }}
              >
                {busy === "phantom" ? "Waiting for Phantom signature..." : "Connect Phantom Wallet"}
              </button>
            ) : (
              <a
                href={phantomInstallUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full text-center block"
                style={{
                  padding: "14px 18px",
                  fontSize: 16,
                  fontWeight: 700,
                  color: "white",
                  background: "#AB9FF2",
                  borderRadius: 6,
                  border: "1px solid #8E80E8",
                  textDecoration: "none",
                }}
              >
                Install Phantom Wallet
              </a>
            )}

            <div className="h-3" />
            <button
              onClick={() => logout()}
              className="text-xs text-neutral-500 underline"
              type="button"
            >
              Not me — sign out
            </button>
          </>
        )}

        {error && (
          <div
            className="mt-4 w-full text-center text-sm"
            style={{ color: "#9b1c1c", background: "#fee2e2", border: "1px solid #fca5a5", padding: 8, borderRadius: 4 }}
          >
            {error}
          </div>
        )}

        <div className="h-6" />
        <div className="text-xs text-neutral-500 text-center">
          By signing in you agree to the <a href="/terms.pdf" className="underline">Terms of Service</a>{" "}
          and <a href="/privacy-policy" className="underline">Privacy Policy</a>.
        </div>
      </div>
    </div>
  );
}
