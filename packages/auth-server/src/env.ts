import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(3002),
  PUBLIC_BASE_URL: z.string().default("http://localhost:1337"),
  AUTH_BASE_URL: z.string().default("http://localhost:1337"),

  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_CLIENT_SECRET: z.string().min(1),
  DISCORD_BOT_TOKEN: z.string().min(1),
  DISCORD_GUILD_ID: z.string().min(1),
  DISCORD_CHANNEL_ID: z.string().min(1),
  DISCORD_ADMIN_USER_ID: z.string().min(1),

  DISCORD_REDIRECT_URI: z
    .string()
    .default("http://localhost:1337/api/auth/discord/callback"),

  JWT_SECRET: z.string().min(32),
  JWT_COOKIE_NAME: z.string().default("skystrife_session"),
  JWT_TTL_DAYS: z.coerce.number().default(30),

  DB_PATH: z.string().default("./.auth-data/auth.db"),

  SOLANA_CLUSTER: z.enum(["devnet", "mainnet-beta", "testnet"]).default("devnet"),

  CORS_ORIGIN: z.string().default("http://localhost:1337"),
});

export const env = schema.parse(process.env);

export type Env = typeof env;
