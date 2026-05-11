import { env } from "./env.js";

const DISCORD_API = "https://discord.com/api/v10";

export type DiscordUser = {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
  email?: string | null;
};

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: env.DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify guilds.join",
    state,
    prompt: "consent",
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: env.DISCORD_REDIRECT_URI,
  });
  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Discord token exchange failed: ${res.status} ${txt}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Discord /users/@me failed: ${res.status}`);
  return (await res.json()) as DiscordUser;
}

export async function addUserToGuild(
  userId: string,
  userAccessToken: string,
): Promise<{ added: boolean; status: number }> {
  const res = await fetch(
    `${DISCORD_API}/guilds/${env.DISCORD_GUILD_ID}/members/${userId}`,
    {
      method: "PUT",
      headers: {
        authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ access_token: userAccessToken }),
    },
  );
  return { added: res.status === 201, status: res.status };
}

export function discordChannelInviteUrl(): string {
  return `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${env.DISCORD_CHANNEL_ID}`;
}
