import nacl from "tweetnacl";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";

export type WalletProofInput = {
  pubkey: string;
  signatureBase58: string;
  message: string;
};

export function verifyWalletProof({
  pubkey,
  signatureBase58,
  message,
}: WalletProofInput): boolean {
  try {
    const pk = new PublicKey(pubkey);
    const messageBytes = new TextEncoder().encode(message);
    const sigBytes = bs58.decode(signatureBase58);
    return nacl.sign.detached.verify(messageBytes, sigBytes, pk.toBytes());
  } catch {
    return false;
  }
}

export function buildSiwsMessage(opts: {
  nonce: string;
  pubkey: string;
  issuedAt: string;
}): string {
  return [
    "Sky Strife wants you to sign in with your Solana account:",
    opts.pubkey,
    "",
    "I accept connecting this wallet to my Sky Strife account.",
    "",
    `URI: ${opts.pubkey}`,
    `Nonce: ${opts.nonce}`,
    `Issued At: ${opts.issuedAt}`,
  ].join("\n");
}
