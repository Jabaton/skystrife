import { useStore } from "../useStore";
import { LoadingScreen } from "./amalgema-ui/LoadingScreen";
import { AdminUIRoot } from "./ui/AdminUIRoot";
import { AuthGate } from "../auth/AuthGate";

export const Admin = () => {
  const networkLayer = useStore((state) => state.networkLayer);

  return (
    <AuthGate>
      <LoadingScreen networkLayer={networkLayer} />
      <AdminUIRoot />
    </AuthGate>
  );
};
