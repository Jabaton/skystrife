type PhantomProvider = {
  isPhantom?: boolean;
  publicKey: { toString(): string } | null;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>;
  disconnect(): Promise<void>;
  signMessage(message: Uint8Array, encoding?: "utf8"): Promise<{ signature: Uint8Array }>;
  on(event: "connect" | "disconnect" | "accountChanged", cb: (...a: unknown[]) => void): void;
};

declare global {
  interface Window {
    solana?: PhantomProvider;
    phantom?: { solana?: PhantomProvider };
  }
}

export function getPhantom(): PhantomProvider | null {
  const w = window as Window;
  if (w.phantom?.solana?.isPhantom) return w.phantom.solana;
  if (w.solana?.isPhantom) return w.solana;
  return null;
}

export function isPhantomInstalled(): boolean {
  return getPhantom() != null;
}

export const PHANTOM_INSTALL_URL = "https://phantom.app/download";

export async function connectPhantom(opts?: { onlyIfTrusted?: boolean }): Promise<string> {
  const p = getPhantom();
  if (!p) throw new Error("Phantom wallet not installed");
  const res = await p.connect(opts);
  return res.publicKey.toString();
}

export async function disconnectPhantom(): Promise<void> {
  const p = getPhantom();
  if (!p) return;
  try {
    await p.disconnect();
  } catch {
    // noop
  }
}

export async function signMessage(message: string): Promise<string> {
  const p = getPhantom();
  if (!p) throw new Error("Phantom wallet not installed");
  const bytes = new TextEncoder().encode(message);
  const { signature } = await p.signMessage(bytes, "utf8");
  return toBase58(signature);
}

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function toBase58(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const out: number[] = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < out.length; j++) {
      carry += out[j] << 8;
      out[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      out.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let result = "";
  for (let i = 0; i < zeros; i++) result += "1";
  for (let i = out.length - 1; i >= 0; i--) result += ALPHABET[out[i]];
  return result;
}
