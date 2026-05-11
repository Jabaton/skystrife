import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  clusterApiUrl,
  sendAndConfirmTransaction,
  type Cluster,
} from "@solana/web3.js";
import bs58 from "bs58";
import "dotenv/config";

import { env } from "./env.js";

const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL ?? clusterApiUrl(env.SOLANA_CLUSTER as Cluster);

export const connection = new Connection(SOLANA_RPC_URL, "confirmed");

let escrowKeypair: Keypair | null = null;

export function getEscrowKeypair(): Keypair {
  if (escrowKeypair) return escrowKeypair;
  const secret = process.env.SOLANA_ESCROW_PRIVATE_KEY;
  if (!secret) {
    throw new Error("SOLANA_ESCROW_PRIVATE_KEY is not set. Run scripts/gen-escrow.ts to create one.");
  }
  const secretBytes = bs58.decode(secret);
  escrowKeypair = Keypair.fromSecretKey(secretBytes);
  return escrowKeypair;
}

export function getEscrowAddress(): string {
  const expected = process.env.SOLANA_ESCROW_PUBKEY;
  if (expected) return expected;
  return getEscrowKeypair().publicKey.toBase58();
}

export const lamportsToSol = (lamports: bigint | number) =>
  Number(lamports) / LAMPORTS_PER_SOL;

export const solToLamports = (sol: number) => Math.round(sol * LAMPORTS_PER_SOL);

export async function getBalanceLamports(address: string): Promise<number> {
  const pk = new PublicKey(address);
  return connection.getBalance(pk, "confirmed");
}

export async function verifyIncomingTransfer(args: {
  signature: string;
  fromPubkey: string;
  toPubkey: string;
  minLamports: number;
}): Promise<{ ok: boolean; lamports: number; error?: string }> {
  const tx = await connection.getParsedTransaction(args.signature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });
  if (!tx) return { ok: false, lamports: 0, error: "tx not found yet (try again in a few seconds)" };
  if (tx.meta?.err) return { ok: false, lamports: 0, error: `tx failed: ${JSON.stringify(tx.meta.err)}` };

  const ixs = tx.transaction.message.instructions;
  let observed = 0;
  for (const ix of ixs) {
    if ("parsed" in ix && ix.program === "system" && ix.parsed?.type === "transfer") {
      const info = ix.parsed.info as { source: string; destination: string; lamports: number };
      if (info.source === args.fromPubkey && info.destination === args.toPubkey) {
        observed += info.lamports;
      }
    }
  }
  if (observed < args.minLamports) {
    return {
      ok: false,
      lamports: observed,
      error: `tx transferred ${observed} lamports, expected >= ${args.minLamports}`,
    };
  }
  return { ok: true, lamports: observed };
}

export async function payout(args: {
  toPubkey: string;
  lamports: number;
}): Promise<{ signature: string }> {
  const kp = getEscrowKeypair();
  const to = new PublicKey(args.toPubkey);
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: kp.publicKey,
      toPubkey: to,
      lamports: args.lamports,
    }),
  );
  const signature = await sendAndConfirmTransaction(connection, tx, [kp], {
    commitment: "confirmed",
  });
  return { signature };
}
