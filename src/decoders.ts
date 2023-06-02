import * as t from 'io-ts';

export const SignRawTransactionWithWalletResultDecoder = t.type({
  hex: t.string,
  complete: t.boolean,
  // TODO: errors field
});

export type SignRawTransactionWithWalletResult = t.TypeOf<
  typeof SignRawTransactionWithWalletResultDecoder
>;

export const SendToAddressResultDecoder = t.string;

export type SendToAddressResult = t.TypeOf<typeof SendToAddressResultDecoder>;

export const LockUnspentResultDecoder = t.boolean;

export type LockUnspentResult = t.TypeOf<typeof LockUnspentResultDecoder>;

export const SendRawTransactionResultDecoder = t.string;

export type SendRawTransactionResult = t.TypeOf<
  typeof SendRawTransactionResultDecoder
>;

export const FundRawTransactionResultDecoder = t.type({
  hex: t.string,
  fee: t.number,
  changepos: t.number,
});

export type FundRawTransactionResultDecoder = t.TypeOf<
  typeof FundRawTransactionResultDecoder
>;

export const CreateRawTransactionResultDecoder = t.string;

export type CreateRawTransactionResult = t.TypeOf<
  typeof CreateRawTransactionResultDecoder
>;

export const GetTransactionResultDecoder = t.type({
  fee: t.union([t.number, t.undefined]),
  blockhash: t.union([t.string, t.undefined]),
});

export type GetTransactionResult = t.TypeOf<typeof GetTransactionResultDecoder>;

export const LiquidGetTransactionResultDecoder = t.type({
  amount: t.record(t.string, t.number),
  fee: t.union([t.undefined, t.record(t.string, t.number)]),
  confirmations: t.union([t.number, t.undefined]),
  blockhash: t.union([t.string, t.undefined]),
  txid: t.string,
  details: t.array(
    t.type({
      // Address can be undefined when issuing
      address: t.union([t.string, t.undefined]),
      category: t.union([t.literal('send'), t.literal('receive')]),
      amount: t.number,
      asset: t.string,
      vout: t.number,
      fee: t.union([t.number, t.undefined]),
    }),
  ),
});

export type LiquidGetTransactionResult = t.TypeOf<
  typeof LiquidGetTransactionResultDecoder
>;

export const GetInfoResultDecoder = t.type({
  blocks: t.number,
});

export type GetInfoResult = t.TypeOf<typeof GetInfoResultDecoder>;

export const GetBlockchainInfoResultDecoder = t.type({
  blocks: t.number,
  headers: t.union([t.number, t.undefined]),
  initial_block_download_complete: t.union([t.boolean, t.undefined]),
});

export type GetBlockchainInfoResult = t.TypeOf<
  typeof GetBlockchainInfoResultDecoder
>;

export const GetRawTransactionAsObjectResultOutputDecoder = t.type({
  // NOTE: Can be `undefined` on Litecoin with Mimblewimble
  n: t.union([t.number, t.undefined]),
  // NOTE: Can be undefined Liquid
  value: t.union([t.number, t.undefined]),
  // NOTE: Can be `undefined` on Litecoin with Mimblewimble
  scriptPubKey: t.union([
    t.type({
      hex: t.string,
      addresses: t.union([t.array(t.string), t.undefined]),
      address: t.union([t.string, t.undefined]),
      type: t.union([t.literal('scripthash'), t.string]),
      reqSigs: t.union([t.number, t.undefined]),
    }),
    t.undefined,
  ]),
});

export type GetRawTransactionAsObjectResultOutput = t.TypeOf<
  typeof GetRawTransactionAsObjectResultOutputDecoder
>;

export const GetRawTransactionAsObjectResultDecoder = t.type({
  txid: t.string,
  hash: t.union([t.string, t.undefined]),
  blockhash: t.union([t.string, t.undefined]),
  vout: t.array(GetRawTransactionAsObjectResultOutputDecoder),
  vin: t.array(
    t.type({
      // NOTE: txid is undefined for coinbase tx
      txid: t.union([t.string, t.undefined]),
      // NOTE: vout is undefined for coinbase tx
      vout: t.union([t.number, t.undefined]),
    }),
  ),
});

export type GetRawTransactionAsObjectResult = t.TypeOf<
  typeof GetRawTransactionAsObjectResultDecoder
>;

export const GetBlockHashFromHeightResultDecoder = t.string;

export type GetBlockHashFromHeightResult = t.TypeOf<
  typeof GetBlockHashFromHeightResultDecoder
>;

// If verbosity is 0, returns a string that is serialized, hex-encoded data for block 'hash'.
// If verbosity is 1, returns an Object with information about block <hash>.
// If verbosity is 2, returns an Object with information about block <hash> and information about each transaction.
// NOTE: This is for verbosity equals 1
export const GetBlockFromHashResultDecoder = t.type({
  tx: t.array(t.string),
  height: t.number,
});

export type GetBlockFromHashResult = t.TypeOf<
  typeof GetBlockFromHashResultDecoder
>;

export const GetBlockCountResultDecoder = t.number;

export type GetBlockCountResult = t.TypeOf<typeof GetBlockCountResultDecoder>;

export const GetRawMempoolResultDecoder = t.array(t.string);

export type GetRawMempoolResult = t.TypeOf<typeof GetRawMempoolResultDecoder>;

export const GetNewAddressResultDecoder = t.string;

export type GetNewAddressResult = t.TypeOf<typeof GetNewAddressResultDecoder>;

export const ValidateAddressResultDecoder = t.type({
  isvalid: t.boolean,
  address: t.union([t.string, t.undefined]),
  ismweb: t.union([t.boolean, t.undefined])
});

export type ValidateAddressResult = t.TypeOf<
  typeof ValidateAddressResultDecoder
>;

export const LiquidValidateAddressResultDecoder = t.type({
  ...ValidateAddressResultDecoder.props,
  unconfidential: t.string,
  address: t.string,
});

export type LiquidValidateAddressResult = t.TypeOf<
  typeof LiquidValidateAddressResultDecoder
>;

export const GetBalanceResultDecoder = t.number;

export type GetBalanceResult = t.TypeOf<typeof GetBalanceResultDecoder>;

export const GenerateToAddressResultDecoder = t.array(t.string);

export type GenerateToAddressResult = t.TypeOf<
  typeof GenerateToAddressResultDecoder
>;

export const GetLiquidBalanceResultDecoder = t.record(t.string, t.number);

export const GetLiquidBalanceForAssetResultDecoder = t.number;

export type GetLiquidBalanceResult = t.TypeOf<
  typeof GetLiquidBalanceResultDecoder
>;

export const OmniGetWalletAddressBalancesResultDecoder = t.array(
  t.type({
    address: t.string,
    balances: t.array(
      t.type({
        propertyid: t.number,
        name: t.string,
        balance: t.string,
        reserved: t.string,
        frozen: t.string,
      }),
    ),
  }),
);

export type OmniGetWalletAddressBalancesResult = t.TypeOf<
  typeof OmniGetWalletAddressBalancesResultDecoder
>;

export const GetGetBlockchainInfoResultDecoder = t.array(
  t.type({
    blocks: t.number,
    headers: t.union([t.number, t.undefined]),
  }),
);

export type GetGetBlockchainInfoResult = t.TypeOf<
  typeof GetGetBlockchainInfoResultDecoder
>;

export const AncientGetInfoResultDecoder = t.type({
  blocks: t.number,
});

export type AncientGetInfoResult = t.TypeOf<typeof AncientGetInfoResultDecoder>;

export const OmniFundedSendResultDecoder = t.string;

export const OmniFundedSendAllResultDecoder = t.string;

export type OmniFundedSendResult = t.TypeOf<typeof OmniFundedSendResultDecoder>;

// {
//   "txid" : "hash",                  (string) the hex-encoded hash of the transaction
//   "sendingaddress" : "address",     (string) the Bitcoin address of the sender
//   "referenceaddress" : "address",   (string) a Bitcoin address used as reference (if any)
//   "ismine" : true|false,            (boolean) whether the transaction involes an address in the wallet
//   "confirmations" : nnnnnnnnnn,     (number) the number of transaction confirmations
//   "fee" : "n.nnnnnnnn",             (string) the transaction fee in bitcoins
//   "blocktime" : nnnnnnnnnn,         (number) the timestamp of the block that contains the transaction
//   "valid" : true|false,             (boolean) whether the transaction is valid
//   "invalidreason" : "reason",     (string) if a transaction is invalid, the reason
//   "version" : n,                    (number) the transaction version
//   "type_int" : n,                   (number) the transaction type as number
//   "type" : "type",                  (string) the transaction type as string
//   [...]                             (mixed) other transaction type specific properties
// }
export const OmniGetTransactionResultDecoder = t.type({
  txid: t.string,
  amount: t.union([t.string, t.undefined]),
  propertyid: t.union([t.number, t.undefined]),
  valid: t.union([t.boolean, t.undefined]),
  invalidreason: t.union([t.string, t.undefined]),
  type: t.string,
  type_int: t.number,
  version: t.number,
  referenceaddress: t.union([t.string, t.undefined]),
});

export type OmniGetTransactionResult = t.TypeOf<
  typeof OmniGetTransactionResultDecoder
>;

export const OmniListPendingTransactionsDecoder = t.array(
  t.type({
    txid: t.string,
    amount: t.union([t.string, t.undefined]),
    propertyid: t.union([t.number, t.undefined]),
    type_int: t.number,
    type: t.string,
    version: t.number,
    referenceaddress: t.union([t.string, t.undefined]),
  }),
);

export type OmniListPendingTransactionsResult = t.TypeOf<
  typeof OmniListPendingTransactionsDecoder
>;

export const ZcashGetOperationResultDecoder = t.array(t.any);

export type ZcashGetOperationResultResult = t.TypeOf<
  typeof ZcashGetOperationResultDecoder
>;

export const ZcashGetBalanceForAddressDecoder = t.number;

export type ZcashGetBalanceForAddressResult = t.TypeOf<
  typeof ZcashGetBalanceForAddressDecoder
>;

export const ZcashSendManyDecoder = t.string;

export type ZcashSendManyResult = t.TypeOf<typeof ZcashSendManyDecoder>;

export const ZcashValidateAddressDecoder = t.type({
  isvalid: t.boolean,
  adddress: t.union([t.string, t.undefined]),
  type: t.union([t.string, t.undefined]),
});

export type ZcashValidateAddressResult = t.TypeOf<
  typeof ZcashValidateAddressDecoder
>;

export const OmniSendDecoder = t.string;

export type OmniSendResult = t.TypeOf<typeof OmniSendDecoder>;

export const ZcashGetNewAddressDecoder = t.string;

export type ZcashGetNewAddressResult = t.TypeOf<
  typeof ZcashGetNewAddressDecoder
>;

export const ZcashListUnspentDecoder = t.array(
  t.type({
    txid: t.string,
    address: t.string,
    change: t.boolean,
    amount: t.number,
    outindex: t.union([t.number, t.undefined]),
  }),
);

export type ZcashListUnspentResult = t.TypeOf<typeof ZcashListUnspentDecoder>;

export const ListUnspentDecoder = t.array(
  t.type({
    txid: t.string,
    vout: t.number,
    address: t.string,
    amount: t.number,
    confirmations: t.number,
    spendable: t.boolean,
    solvable: t.union([t.boolean, t.undefined]),
    safe: t.union([t.boolean, t.undefined]),
  }),
);

export type ListUnspentResult = t.TypeOf<typeof ListUnspentDecoder>;

export const DumpPrivateKeyDecoder = t.string;
