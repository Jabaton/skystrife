import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { env } from "./env.js";

mkdirSync(dirname(env.DB_PATH), { recursive: true });

export const db = new Database(env.DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    discord_id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    global_name TEXT,
    avatar TEXT,
    email TEXT,
    wallet_pubkey TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    redirect_to TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_pubkey);
`);

export type UserRow = {
  discord_id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
  email: string | null;
  wallet_pubkey: string | null;
  created_at: number;
  updated_at: number;
};

export function upsertUser(u: {
  discord_id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
  email: string | null;
}): UserRow {
  const now = Date.now();
  db.prepare(
    `INSERT INTO users (discord_id, username, global_name, avatar, email, created_at, updated_at)
     VALUES (@discord_id, @username, @global_name, @avatar, @email, @now, @now)
     ON CONFLICT(discord_id) DO UPDATE SET
       username = excluded.username,
       global_name = excluded.global_name,
       avatar = excluded.avatar,
       email = excluded.email,
       updated_at = excluded.updated_at`,
  ).run({ ...u, now });
  return getUser(u.discord_id)!;
}

export function getUser(discord_id: string): UserRow | undefined {
  return db
    .prepare(`SELECT * FROM users WHERE discord_id = ?`)
    .get(discord_id) as UserRow | undefined;
}

export function setUserWallet(discord_id: string, wallet_pubkey: string | null) {
  db.prepare(
    `UPDATE users SET wallet_pubkey = ?, updated_at = ? WHERE discord_id = ?`,
  ).run(wallet_pubkey, Date.now(), discord_id);
}

export function saveOAuthState(state: string, redirect_to: string | null) {
  db.prepare(
    `INSERT INTO oauth_states (state, created_at, redirect_to) VALUES (?, ?, ?)`,
  ).run(state, Date.now(), redirect_to);
  db.prepare(`DELETE FROM oauth_states WHERE created_at < ?`).run(
    Date.now() - 10 * 60 * 1000,
  );
}

export function consumeOAuthState(state: string): { redirect_to: string | null } | null {
  const row = db
    .prepare(`SELECT redirect_to FROM oauth_states WHERE state = ?`)
    .get(state) as { redirect_to: string | null } | undefined;
  if (!row) return null;
  db.prepare(`DELETE FROM oauth_states WHERE state = ?`).run(state);
  return row;
}
