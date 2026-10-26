import type { NetworkId } from "./networks";
export type ChainStatus = "PENDING" | "CONFIRMED" | "FAILED";

export interface DeploymentRow {
  id: string; network: NetworkId; name: string; symbol: string; decimals: number;
  initialSupply: string; mintable: boolean; cap: string; description: string | null;
  website: string | null; logoUrl: string | null; txHash: string; contractAddress: string | null;
  status: ChainStatus; energyUsed: string | null; feeSun: string | null; blockNumber: string | null;
  failureReason: string | null; createdAt: string; confirmedAt: string | null;
}

export interface TxRow {
  id: string; network: NetworkId; txHash: string; kind: string; fromAddress: string; toAddress: string;
  tokenAddress: string | null; amount: string; symbol: string | null; status: ChainStatus;
  feeSun: string | null; failureReason: string | null; createdAt: string;
}

export interface ChainTransfer {
  txHash: string; from: string; to: string; value: string; timestamp: number;
  token: { address: string; symbol: string; name: string; decimals: number };
}
