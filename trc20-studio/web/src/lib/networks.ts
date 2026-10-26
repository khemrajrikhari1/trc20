export type NetworkId = "mainnet" | "nile" | "shasta";

export interface NetworkInfo {
  id: NetworkId;
  label: string;
  fullHost: string;
  explorer: string;
  isTestnet: boolean;
  faucet?: string;
}

export const NETWORKS: Record<NetworkId, NetworkInfo> = {
  mainnet: {
    id: "mainnet",
    label: "TRON Mainnet",
    fullHost: "https://api.trongrid.io",
    explorer: "https://tronscan.org/#",
    isTestnet: false,
  },
  nile: {
    id: "nile",
    label: "Nile Testnet",
    fullHost: "https://nile.trongrid.io",
    explorer: "https://nile.tronscan.org/#",
    isTestnet: true,
    faucet: "https://nileex.io/join/getJoinPage",
  },
  shasta: {
    id: "shasta",
    label: "Shasta Testnet",
    fullHost: "https://api.shasta.trongrid.io",
    explorer: "https://shasta.tronscan.org/#",
    isTestnet: true,
    faucet: "https://shasta.tronex.io",
  },
};

/** Tether's official USDT contract on TRON mainnet. Anything else called "USDT" is not Tether's. */
export const OFFICIAL_USDT_MAINNET = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

export function enabledNetworks(): NetworkId[] {
  const raw = process.env.NEXT_PUBLIC_ENABLED_NETWORKS || "nile,shasta";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is NetworkId => s in NETWORKS);
}

/** Map the node URL TronLink is connected to onto one of our networks. */
export function networkFromHost(host: string | undefined | null): NetworkId | null {
  if (!host) return null;
  const h = host.toLowerCase();
  if (h.includes("nile")) return "nile";
  if (h.includes("shasta")) return "shasta";
  if (h.includes("api.trongrid.io") || h.includes("api.tronstack.io") || h.includes("tronscan.org")) return "mainnet";
  return null;
}

export const txUrl = (n: NetworkId, hash: string) => `${NETWORKS[n].explorer}/transaction/${hash}`;
export const contractUrl = (n: NetworkId, addr: string) => `${NETWORKS[n].explorer}/contract/${addr}`;
export const addressUrl = (n: NetworkId, addr: string) => `${NETWORKS[n].explorer}/address/${addr}`;
