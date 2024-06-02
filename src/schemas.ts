import { z } from 'zod';

export const signRawTransactionWithWalletResultSchema = z.object({
  hex: z.string(),
  complete: z.boolean(),
  // TODO: errors field
});

export type SignRawTransactionWithWalletResult = z.infer<
  typeof signRawTransactionWithWalletResultSchema
>;

export const sendToAddressResultSchema = z.string();

export type SendToAddressResult = z.infer<typeof sendToAddressResultSchema>;

export const lockUnspentResultSchema = z.boolean();

export type LockUnspentResult = z.infer<typeof lockUnspentResultSchema>;

export const sendRawTransactionResultSchema = z.string();

export type SendRawTransactionResult = z.infer<
  typeof sendRawTransactionResultSchema
>;

export const fundRawTransactionResultSchema = z.object({
  hex: z.string(),
  fee: z.number(),
  changepos: z.number(),
});

export type FundRawTransactionResult = z.infer<
  typeof fundRawTransactionResultSchema
>;

export const createRawTransactionResultSchema = z.string();

export type CreateRawTransactionResult = z.infer<
  typeof createRawTransactionResultSchema
>;

export const getTransactionResultSchema = z.object({
  fee: z.union([z.number(), z.undefined()]),
  blockhash: z.union([z.string(), z.undefined()]),
});

export type GetTransactionResult = z.infer<typeof getTransactionResultSchema>;

export const liquidGetTransactionResultSchema = z.object({
  amount: z.record(z.string(), z.number()),
  fee: z.union([z.undefined(), z.record(z.string(), z.number())]),
  confirmations: z.union([z.number(), z.undefined()]),
  blockhash: z.union([z.string(), z.undefined()]),
  txid: z.string(),
  details: z.array(
    z.object({
      // Address can be undefined when issuing
      address: z.union([z.string(), z.undefined()]),
      category: z.union([z.literal('send'), z.literal('receive')]),
      amount: z.number(),
      asset: z.string(),
      vout: z.number(),
      fee: z.union([z.number(), z.undefined()]),
    }),
  ),
});

export type LiquidGetTransactionResult = z.infer<
  typeof liquidGetTransactionResultSchema
>;

export const getInfoResultSchema = z.object({
  blocks: z.number(),
});

export type GetInfoResult = z.infer<typeof getInfoResultSchema>;

export const getBlockchainInfoResultSchema = z.object({
  blocks: z.number(),
  headers: z.union([z.number(), z.undefined()]),
  initial_block_download_complete: z.union([z.boolean(), z.undefined()]),
});

export type GetBlockchainInfoResult = z.infer<
  typeof getBlockchainInfoResultSchema
>;

export const getRawTransactionAsObjectResultOutputSchema = z.object({
  // NOTE: Can be `undefined` on Litecoin with Mimblewimble
  n: z.union([z.number(), z.undefined()]),
  // NOTE: Can be undefined Liquid
  value: z.union([z.number(), z.undefined()]),
  // NOTE: Can be `undefined` on Litecoin with Mimblewimble
  scriptPubKey: z.union([
    z.object({
      hex: z.string(),
      addresses: z.union([z.array(z.string()), z.undefined()]),
      address: z.union([z.string(), z.undefined()]),
      type: z.union([z.literal('scripthash'), z.string()]),
      reqSigs: z.union([z.number(), z.undefined()]),
    }),
    z.undefined(),
  ]),
});

export type GetRawTransactionAsObjectResultOutput = z.infer<
  typeof getRawTransactionAsObjectResultOutputSchema
>;

export const getRawTransactionAsObjectResultSchema = z.object({
  txid: z.string(),
  hash: z.union([z.string(), z.undefined()]),
  blockhash: z.union([z.string(), z.undefined()]),
  vout: z.array(getRawTransactionAsObjectResultOutputSchema),
  vin: z.array(
    z.object({
      // NOTE: txid is undefined for coinbase tx
      txid: z.union([z.string(), z.undefined()]),
      // NOTE: vout is undefined for coinbase tx
      vout: z.union([z.number(), z.undefined()]),
    }),
  ),
});

export type GetRawTransactionAsObjectResult = z.infer<
  typeof getRawTransactionAsObjectResultSchema
>;

export const getBlockHashFromHeightResultSchema = z.string();

export type GetBlockHashFromHeightResult = z.infer<
  typeof getBlockHashFromHeightResultSchema
>;

// If verbosity is 0, returns a string that is serialized, hex-encoded data for block 'hash'.
// If verbosity is 1, returns an Object with information about block <hash>.
// If verbosity is 2, returns an Object with information about block <hash> and information about each transaction.
// NOTE: This is for verbosity equals 1
export const getBlockFromHashResultSchema = z.object({
  tx: z.array(z.string()),
  height: z.number(),
});

export type GetBlockFromHashResult = z.infer<
  typeof getBlockFromHashResultSchema
>;

export const getBlockCountResultSchema = z.number();

export type GetBlockCountResult = z.infer<typeof getBlockCountResultSchema>;

export const getRawMempoolResultSchema = z.array(z.string());

export type GetRawMempoolResult = z.infer<typeof getRawMempoolResultSchema>;

export const getNewAddressResultSchema = z.string();

export type GetNewAddressResult = z.infer<typeof getNewAddressResultSchema>;

export const validateAddressResultSchema = z.object({
  isvalid: z.boolean(),
  address: z.union([z.string(), z.undefined()]),
  ismweb: z.union([z.boolean(), z.undefined()]),
});

export type ValidateAddressResult = z.infer<
  typeof validateAddressResultSchema
>;

export const liquidValidateAddressResultSchema = validateAddressResultSchema.extend({
    unconfidential: z.string(),
    address: z.string(),
  });

export type LiquidValidateAddressResult = z.infer<
  typeof liquidValidateAddressResultSchema
>;

export const getBalanceResultSchema = z.number();

export type GetBalanceResult = z.infer<typeof getBalanceResultSchema>;

export const generateToAddressResultSchema = z.array(z.string());

export type GenerateToAddressResult = z.infer<
  typeof generateToAddressResultSchema
>;

export const getLiquidBalanceResultSchema = z.record(z.string(), z.number());

export const getLiquidBalanceForAssetResultSchema = z.number();

export type GetLiquidBalanceResult = z.infer<
  typeof getLiquidBalanceResultSchema
>;

export const omniGetWalletAddressBalancesResultSchema = z.array(
  z.object({
    address: z.string(),
    balances: z.array(
      z.object({
        propertyid: z.number(),
        name: z.string(),
        balance: z.string(),
        reserved: z.string(),
        frozen: z.string(),
      }),
    ),
  }),
);

export type OmniGetWalletAddressBalancesResult = z.infer<
  typeof omniGetWalletAddressBalancesResultSchema
>;

export const getGetBlockchainInfoResultSchema = z.array(
  z.object({
    blocks: z.number(),
    headers: z.union([z.number(), z.undefined()]),
  }),
);

export type GetGetBlockchainInfoResult = z.infer<
  typeof getGetBlockchainInfoResultSchema
>;

export const ancientGetInfoResultSchema = z.object({
  blocks: z.number(),
});

export type AncientGetInfoResult = z.infer<typeof ancientGetInfoResultSchema>;

export const omniFundedSendResultSchema = z.string();

export const omniFundedSendAllResultSchema = z.string();

export type OmniFundedSendResult = z.infer<typeof omniFundedSendResultSchema>;

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
export const omniGetTransactionResultSchema = z.object({
  txid: z.string(),
  amount: z.union([z.string(), z.undefined()]),
  propertyid: z.union([z.number(), z.undefined()]),
  valid: z.union([z.boolean(), z.undefined()]),
  invalidreason: z.union([z.string(), z.undefined()]),
  type: z.string(),
  type_int: z.number(),
  version: z.number(),
  referenceaddress: z.union([z.string(), z.undefined()]),
});

export type OmniGetTransactionResult = z.infer<
  typeof omniGetTransactionResultSchema
>;

export const omniListPendingTransactionsSchema = z.array(
  z.object({
    txid: z.string(),
    amount: z.union([z.string(), z.undefined()]),
    propertyid: z.union([z.number(), z.undefined()]),
    type_int: z.number(),
    type: z.string(),
    version: z.number(),
    referenceaddress: z.union([z.string(), z.undefined()]),
  }),
);

export type OmniListPendingTransactionsResult = z.infer<
  typeof omniListPendingTransactionsSchema
>;

export const zcashGetOperationResultSchema = z.array(z.any());

export type ZcashGetOperationResultResult = z.infer<
  typeof zcashGetOperationResultSchema
>;

export const zcashGetBalanceForAddressSchema = z.number();

export type ZcashGetBalanceForAddressResult = z.infer<
  typeof zcashGetBalanceForAddressSchema
>;

export const zcashSendManySchema = z.string();

export type ZcashSendManyResult = z.infer<typeof zcashSendManySchema>;

export const zcashValidateAddressSchema = z.object({
  isvalid: z.boolean(),
  adddress: z.union([z.string(), z.undefined()]),
  type: z.union([z.string(), z.undefined()]),
});

export type ZcashValidateAddressResult = z.infer<
  typeof zcashValidateAddressSchema
>;

export const omniSendSchema = z.string();

export type OmniSendResult = z.infer<typeof omniSendSchema>;

export const zcashGetNewAddressSchema = z.string();

export type ZcashGetNewAddressResult = z.infer<
  typeof zcashGetNewAddressSchema
>;

export const zcashListUnspentSchema = z.array(
  z.object({
    txid: z.string(),
    address: z.string(),
    change: z.boolean(),
    amount: z.number(),
    outindex: z.union([z.number(), z.undefined()]),
  }),
);

export type ZcashListUnspentResult = z.infer<typeof zcashListUnspentSchema>;

export const listUnspentSchema = z.array(
  z.object({
    txid: z.string(),
    vout: z.number(),
    address: z.string(),
    amount: z.number(),
    confirmations: z.number(),
    spendable: z.boolean(),
    solvable: z.union([z.boolean(), z.undefined()]),
    safe: z.union([z.boolean(), z.undefined()]),
  }),
);

export type ListUnspentResult = z.infer<typeof listUnspentSchema>;

export const dumpPrivateKeySchema = z.string();

export const ecashIsFinalTransactionSchema = z.boolean();
