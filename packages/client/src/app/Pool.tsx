import { AuthGate } from "../auth/AuthGate";
import { SolanaPool } from "./amalgema-ui/SolanaPool";

export function Pool() {
  return (
    <AuthGate>
      <div className="h-screen overflow-y-auto bg-ss-bg-0 text-ss-text-default">
        <SolanaPool />
      </div>
    </AuthGate>
  );
}
