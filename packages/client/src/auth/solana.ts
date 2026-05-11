import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  clusterApiUrl,
  type Cluster,
} from "@solana/web3.js";
import { getPhantom } from "./phantom";

export const SOL_PER_LAMPORT = 1 / LAMPORTS_PER_SOL;

export function solToLamports(sol: number): number {
  return Math.round(sol * LAMPORTS_PER_SOL);
}

export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

let cachedConn: { cluster: Cluster; conn: Connection } | null = null;
export function getConnection(cluster: Cluster = "devnet"): Connection {
  if (cachedConn && cachedConn.cluster === cluster) return cachedConn.conn;
  const conn = new Connection(clusterApiUrl(cluster), "confirmed");
  cachedConn = { cluster, conn };
  return conn;
}

type SignAndSendCapableProvider = {
  publicKey: { toString(): string } | null;
  signAndSendTransaction(tx: Transaction): Promise<{ signature: string }>;
};

export async function sendSolToEscrow(args: {
  fromPubkey: string;
  toPubkey: string;
  lamports: number;
  cluster?: Cluster;
}): Promise<{ signature: string }> {
  const phantom = getPhantom() as SignAndSendCapableProvider | null;
  if (!phantom) throw new Error("Phantom not connected");
  if (!phantom.publicKey) throw new Error("Phantom not connected (no publicKey)");
  if (phantom.publicKey.toString() !== args.fromPubkey) {
    throw new Error(
      `Phantom wallet (${phantom.publicKey.toString()}) does not match bound wallet (${args.fromPubkey})`,
    );
  }

  const conn = getConnection(args.cluster ?? "devnet");
  const from = new PublicKey(args.fromPubkey);
  const to = new PublicKey(args.toPubkey);
  const { blockhash } = await conn.getLatestBlockhash("confirmed");

  const tx = new Transaction({ feePayer: from, recentBlockhash: blockhash }).add(
    SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports: args.lamports }),
  );

  const { signature } = await phantom.signAndSendTransaction(tx);
  await conn.confirmTransaction(signature, "confirmed");
  return { signature };
}
