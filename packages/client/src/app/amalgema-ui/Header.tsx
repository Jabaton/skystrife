import { twMerge } from "tailwind-merge";
import { OverlineLarge } from "../ui/Theme/SkyStrife/Typography";

export function Header() {
  return (
    <div
      className={twMerge(
        "bg-ss-bg-1 border-b border-ss-stroke z-20 px-8 py-4 flex flex-row justify-between items-center",
      )}
    >
      <div className="flex flex-row justify-between w-full h-full items-center">
        <div className="flex flex-row items-center">
          <OverlineLarge className="normal-case h-[32px]" style={{ fontSize: "32px" }}>
            Sky Strife
          </OverlineLarge>
        </div>
      </div>
    </div>
  );
}
