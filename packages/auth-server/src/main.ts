import express, { type Request, type Response, type NextFunction } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { randomBytes } from "node:crypto";

import { env } from "./env.js";
import {
  addUserToGuild,
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchDiscordUser,
} from "./discord.js";
import {
  consumeOAuthState,
  getUser,
  saveOAuthState,
  setUserWallet,
  upsertUser,
} from "./db.js";
import { sign, verify, type SessionPayload } from "./jwt.js";
import { buildSiwsMessage, verifyWalletProof } from "./phantom.js";
import { stakeRouter } from "./stake.js";

const app = express();

app.use(
  cors({
    origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: "64kb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

declare module "express-serve-static-core" {
  interface Request {
    session?: SessionPayload;
  }
}

function attachSession(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[env.JWT_COOKIE_NAME];
  if (token) {
    const payload = verify(token);
    if (payload) req.session = payload;
  }
  next();
}

function requireSession(req: Request, res: Response, next: NextFunction) {
  if (!req.session) return res.status(401).json({ error: "unauthorized" });
  next();
}

app.use(attachSession);

function setSessionCookie(res: Response, payload: SessionPayload) {
  const token = sign(payload);
  res.cookie(env.JWT_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: env.JWT_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

function userToSession(u: NonNullable<ReturnType<typeof getUser>>): SessionPayload {
  return {
    sub: u.discord_id,
    username: u.username,
    global_name: u.global_name,
    avatar: u.avatar,
    wallet_pubkey: u.wallet_pubkey,
    is_admin: u.discord_id === env.DISCORD_ADMIN_USER_ID,
  };
}

app.get("/api/auth/discord/start", (req, res) => {
  const state = randomBytes(24).toString("base64url");
  const redirect_to = typeof req.query.redirect === "string" ? req.query.redirect : null;
  saveOAuthState(state, redirect_to);
  return res.json({ url: buildAuthorizeUrl(state) });
});

app.get("/api/auth/discord/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : null;
  const state = typeof req.query.state === "string" ? req.query.state : null;
  if (!code || !state) return res.status(400).send("Missing code or state");

  const saved = consumeOAuthState(state);
  if (!saved) return res.status(400).send("Invalid or expired state");

  try {
    const accessToken = await exchangeCodeForToken(code);
    const discordUser = await fetchDiscordUser(accessToken);

    const dbUser = upsertUser({
      discord_id: discordUser.id,
      username: discordUser.username,
      global_name: discordUser.global_name ?? null,
      avatar: discordUser.avatar ?? null,
      email: discordUser.email ?? null,
    });

    void addUserToGuild(discordUser.id, accessToken).catch((e) =>
      console.warn("[auth] addUserToGuild failed:", (e as Error).message),
    );

    setSessionCookie(res, userToSession(dbUser));

    const redirect = saved.redirect_to ?? env.PUBLIC_BASE_URL;
    return res.redirect(redirect);
  } catch (e) {
    console.error("[auth] callback failed:", e);
    return res
      .status(500)
      .send("Discord login failed. Please try again or contact admin.");
  }
});

app.get("/api/auth/me", (req, res) => {
  if (!req.session) return res.json({ user: null });
  const fresh = getUser(req.session.sub);
  if (!fresh) return res.json({ user: null });
  const session = userToSession(fresh);
  return res.json({
    user: {
      id: session.sub,
      username: session.username,
      global_name: session.global_name,
      avatar: session.avatar,
      wallet_pubkey: session.wallet_pubkey,
      is_admin: session.is_admin,
    },
  });
});

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie(env.JWT_COOKIE_NAME, { path: "/" });
  return res.json({ ok: true });
});

app.get("/api/auth/wallet/nonce", requireSession, (req, res) => {
  const pubkey = typeof req.query.pubkey === "string" ? req.query.pubkey : "";
  if (!pubkey) return res.status(400).json({ error: "pubkey required" });
  const nonce = randomBytes(16).toString("base64url");
  const issuedAt = new Date().toISOString();
  const message = buildSiwsMessage({ nonce, pubkey, issuedAt });
  return res.json({ nonce, issuedAt, message });
});

app.post("/api/auth/wallet/bind", requireSession, (req, res) => {
  const body = req.body as {
    pubkey?: string;
    signatureBase58?: string;
    message?: string;
  };
  if (!body.pubkey || !body.signatureBase58 || !body.message) {
    return res.status(400).json({ error: "pubkey, signatureBase58, message required" });
  }
  if (!body.message.includes(body.pubkey)) {
    return res.status(400).json({ error: "message must include pubkey" });
  }
  const ok = verifyWalletProof({
    pubkey: body.pubkey,
    signatureBase58: body.signatureBase58,
    message: body.message,
  });
  if (!ok) return res.status(400).json({ error: "bad signature" });

  setUserWallet(req.session!.sub, body.pubkey);
  const fresh = getUser(req.session!.sub)!;
  setSessionCookie(res, userToSession(fresh));
  return res.json({ ok: true, wallet_pubkey: body.pubkey });
});

app.post("/api/auth/wallet/unbind", requireSession, (req, res) => {
  setUserWallet(req.session!.sub, null);
  const fresh = getUser(req.session!.sub)!;
  setSessionCookie(res, userToSession(fresh));
  return res.json({ ok: true });
});

app.get("/api/auth/config", (_req, res) => {
  return res.json({
    solanaCluster: env.SOLANA_CLUSTER,
    discordGuildId: env.DISCORD_GUILD_ID,
    discordChannelId: env.DISCORD_CHANNEL_ID,
  });
});

app.use("/api/stake", stakeRouter);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[auth] unhandled:", err);
  res.status(500).json({ error: "internal" });
});

const port = env.PORT;
app.listen(port, () => {
  console.log(`[auth] listening on http://localhost:${port}`);
  console.log(`[auth] Discord redirect URI: ${env.DISCORD_REDIRECT_URI}`);
  console.log(`[auth] Solana cluster: ${env.SOLANA_CLUSTER}`);
});
