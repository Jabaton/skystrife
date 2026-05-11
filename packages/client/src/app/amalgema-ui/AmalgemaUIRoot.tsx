import { Header } from "./Header";
import { useStore } from "../../useStore";
import { InventorySidebar } from "./InventorySidebar";
import { Transactions } from "./Transactions";
import { ComponentBrowser } from "./Admin/ComponentBrowser";
import { MatchTable } from "./MatchTable";
import { OngoingMatch } from "./OngoingMatch";

export const AmalgemaUIRoot = () => {
  const layers = useStore((state) => {
    return {
      networkLayer: state.networkLayer,
    };
  });

  if (!layers.networkLayer) return <></>;

  return (
    <div className="flex h-screen">
      <div className="h-screen flex flex-col grow">
        <Header />

        <div
          style={{
            background:
              "linear-gradient(152deg, rgba(244, 243, 241, 0.98) 0%, rgba(244, 243, 241, 0.88) 100%), url(/assets/ship-background.jpeg), lightgray -381.491px 0.145px / 126.42% 100% no-repeat",
            backgroundSize: "cover",
            backgroundPosition: "right",
            zIndex: -2,
          }}
          className="fixed top-0 left-0 h-screen w-screen bg-cover"
        />

        <div className="grow px-8 py-6 flex flex-col">
          <MatchTable />
        </div>
      </div>

      <InventorySidebar />

      <Transactions />

      {!import.meta.env.DEV && <OngoingMatch />}

      <ComponentBrowser />
    </div>
  );
};
