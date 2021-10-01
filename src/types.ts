export interface CreateBitcoinJsonRpcOptions {
  ancient?: boolean;
}

export type BitcoinFeeEstimateMode = 'UNSET' | 'ECONOMICAL' | 'CONSERVATIVE';
export type AddressTypes = "legacy" | "p2sh-segwit" | "bech32";
