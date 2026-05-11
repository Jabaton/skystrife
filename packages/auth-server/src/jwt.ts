import jwt from "jsonwebtoken";
import { env } from "./env.js";

export type SessionPayload = {
  sub: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
  wallet_pubkey: string | null;
  is_admin: boolean;
};

export function sign(payload: SessionPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: `${env.JWT_TTL_DAYS}d`,
  });
}

export function verify(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
    if (typeof decoded === "string") return null;
    return decoded as SessionPayload;
  } catch {
    return null;
  }
}
