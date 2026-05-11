import { IconButton } from "../ui/Theme/SkyStrife/IconButton";
import { Discord } from "../ui/Theme/SkyStrife/Icons/Discord";
import { Twitter } from "../ui/Theme/SkyStrife/Icons/Twitter";
import { Tutorial } from "../ui/Theme/SkyStrife/Icons/Tutorial";
import { DISCORD_URL, HOW_TO_PLAY_URL, TWITTER_URL } from "../links";
import { Link } from "../ui/Theme/SkyStrife/Typography";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../ui/Theme/SkyStrife/Button";

function truncate(s: string, n = 10) {
  if (s.length <= n * 2 + 3) return s;
  return `${s.slice(0, n)}…${s.slice(-n)}`;
}

function discordAvatarUrl(id: string, avatar: string | null) {
  if (!avatar) return null;
  const ext = avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${id}/${avatar}.${ext}?size=128`;
}

function ProfileCard() {
  const { user, solanaCluster, disconnectWallet, logout } = useAuth();
  if (!user) return null;
  const displayName = user.global_name ?? user.username;
  const avatar = discordAvatarUrl(user.id, user.avatar);

  return (
    <div className="rounded border border-ss-stroke bg-ss-bg-2 p-4 flex flex-col items-stretch">
      <div className="flex items-center gap-3">
        {avatar ? (
          <img
            src={avatar}
            alt={displayName}
            className="w-12 h-12 rounded-full border border-ss-stroke"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-ss-bg-1 border border-ss-stroke flex items-center justify-center font-bold text-xl">
            {displayName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="flex flex-col min-w-0">
          <div className="text-lg font-semibold truncate">{displayName}</div>
          <div className="text-xs text-ss-text-light truncate">@{user.username}</div>
          {user.is_admin && (
            <div className="text-xs text-ss-gold font-bold">ADMIN</div>
          )}
        </div>
      </div>

      <div className="h-3" />

      <div className="text-xs uppercase text-ss-text-light tracking-wider">Solana wallet</div>
      <div className="flex items-center justify-between gap-2 mt-1">
        <div className="text-sm font-mono truncate">
          {user.wallet_pubkey ? truncate(user.wallet_pubkey, 6) : "—"}
        </div>
        <div className="text-xs text-ss-text-light">
          {solanaCluster ?? "devnet"}
        </div>
      </div>

      <div className="h-3" />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => disconnectWallet()}
          className="text-xs text-ss-text-light underline"
        >
          unbind wallet
        </button>
        <div className="grow" />
        <button
          type="button"
          onClick={() => logout()}
          className="text-xs text-ss-text-light underline"
        >
          logout
        </button>
      </div>
    </div>
  );
}

export function InventorySidebar() {
  return (
    <div className="flex flex-col bg-ss-bg-1 border-l border-ss-stroke h-screen overflow-y-auto p-8 pt-4 items-stretch w-[420px] shrink-0">
      <ProfileCard />

      <div className="h-4" />

      <a href="/pool" className="block">
        <Button buttonType="secondary" className="w-full">
          SOL Stake Pool →
        </Button>
      </a>

      <div className="h-[100%]" />

      <div className="flex h-fit justify-around mb-4">
        <a href={DISCORD_URL} target="_blank" rel="noreferrer">
          <IconButton>
            <Discord />
          </IconButton>
        </a>

        <a href={TWITTER_URL} target="_blank" rel="noreferrer">
          <IconButton>
            <Twitter />
          </IconButton>
        </a>

        <a href={HOW_TO_PLAY_URL} target="_blank" rel="noreferrer">
          <IconButton>
            <Tutorial />
          </IconButton>
        </a>
      </div>

      <div className="h-6" />

      <div className="flex gap-x-3 items-center mx-auto">
        <Link className="uppercase text-ss-text-x-light underline" href={"/privacy-policy"}>
          privacy policy
        </Link>

        <div className="w-6 text-center text-ss-text-x-light">|</div>

        <Link className="uppercase text-ss-text-x-light underline" href={"/terms.pdf"}>
          terms of service
        </Link>
      </div>
    </div>
  );
}
