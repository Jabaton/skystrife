import { useAuth } from "./AuthContext";
import { LoginScreen } from "./LoginScreen";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading, user, hasWallet } = useAuth();
  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#f4f3f1]">
        <div className="text-2xl font-mono">Loading Sky Strife...</div>
      </div>
    );
  }
  if (!user || !hasWallet) return <LoginScreen />;
  return <>{children}</>;
}
