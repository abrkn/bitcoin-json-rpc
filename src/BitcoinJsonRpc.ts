import { z } from 'zod';
import delay from 'delay';
import createDebug from 'debug';
import { CreateBitcoinJsonRpcOptions, BitcoinFeeEstimateMode } from './types';
import { jsonRpcCmd } from './json-rpc';
import { PURE_METHODS, getWasExecutedFromError, getShouldRetry } from './utils';
import { BitcoinJsonRpcError } from './BitcoinJsonRpcError';
import * as schemas from './schemas';

const MAX_ATTEMPTS = 5;
const DELAY_BETWEEN_ATTEMPTS = 5000;

const debug = createDebug('bitcoin-json-rpc');

export default class BitcoinJsonRpc {
  constructor(readonly url: string, readonly options: CreateBitcoinJsonRpcOptions = {}) {
    this.url = url;
    this.options = options;
  }

  public cmd(method: string, ...params: any[]): Promise<any> {
    return jsonRpcCmd(this.url, method, params);
  }

  public cmdWithRetry(method: string, ...params: any[]): Promise<any> {
    const methodIsPure = PURE_METHODS.includes(method);
    const maxAttempts = MAX_ATTEMPTS;

    const attempt: (attemptN?: number) => any = async (attemptN = 1) => {
      const getErrrorData = () => ({
        bitcoinJsonRpc: {
          method,
          params,
          methodIsPure,
          maxAttempts,
          attempts: attemptN,
        },
      });

      try {
        const result = await this.cmd(method, ...params);
        return result;
      } catch (error: any) {

        const executed = getWasExecutedFromError(method, error);
        const hadEffects = !methodIsPure && executed !== false;
        const shouldRetry = !hadEffects && getShouldRetry(method, error);

        debug(`Command failed: ${error.message}`, {
          method,
          methodIsPure,
          params,
          executed,
          attemptN,
          maxAttempts,
          hadEffects,
          shouldRetry,
        });

        if (attemptN === maxAttempts) {
          throw new BitcoinJsonRpcError(error, executed, getErrrorData());
        }

        if (shouldRetry) {
          await delay(DELAY_BETWEEN_ATTEMPTS);

          // NOTE: Stack deepening
          return attempt(attemptN + 1);
        }

        debug(`Cannot retry`, {
          method,
          methodIsPure,
          executed,
          attemptN,
          maxAttempts,
        });

        throw new BitcoinJsonRpcError(error, executed, getErrrorData());
      }
    };

    return attempt();
  }

  private async cmdWithRetryAndParse<T>(
    schema: z.ZodSchema<T>,
    method: string,
    ...params: any[]
  ): Promise<T> {
    const unsafe = await this.cmdWithRetry(method, ...params);

    try {
      const parsed = schema.parse(unsafe);

      return parsed;
    } catch (error: any) {
      throw Object.assign(error, { executed: true });
    }
  }

  public async sendRawTransaction(hex: string) {
    return this.cmdWithRetryAndParse(schemas.sendRawTransactionResultSchema, 'sendrawtransaction', hex);
  }

  // https://bitcoin-rpc.github.io/en/doc/0.17.99/rpc/wallet/sendtoaddress/
  public async sendToAddress(address: string, amount: string, comment?: string, commentTo?: string, subtractFeeFromAmount?: boolean, replaceable?: boolean) {
    const params: any[] = [address, amount];

    if (replaceable !== undefined) {
      // Argument #6
      params.push(comment ?? '', commentTo ?? '', subtractFeeFromAmount ?? false, replaceable);
    } else if (subtractFeeFromAmount !== undefined) {
      // Argument #5
      params.push(comment ?? '', commentTo ?? '', subtractFeeFromAmount);
    } else if (commentTo !== undefined) {
      // Argument #4
      params.push(comment ?? '', commentTo);
    } else if (commentTo) {
      // Argument #3
      params.push(comment);
    }

    return this.cmdWithRetryAndParse(schemas.sendToAddressResultSchema, 'sendtoaddress', ...params);
  }

  public async signRawTransactionWithWallet(hex: string) {
    return this.cmdWithRetryAndParse(
      schemas.signRawTransactionWithWalletResultSchema,
      'signrawtransactionwithwallet',
      hex
    );
  }

  public async lockUnspent(unlock: boolean, transactions: { txid: string; vout: number }[]) {
    return this.cmdWithRetryAndParse(schemas.lockUnspentResultSchema, 'lockunspent', unlock, transactions);
  }

  // Arguments:
  // 1. "inputs"                (array, required) A json array of json objects
  //      [
  //        {
  //          "txid":"id",      (string, required) The transaction id
  //          "vout":n,         (numeric, required) The output number
  //          "sequence":n      (numeric, optional) The sequence number
  //        }
  //        ,...
  //      ]
  // 2. "outputs"               (array, required) a json array with outputs (key-value pairs)
  //    [
  //     {
  //       "address": x.xxx,    (obj, optional) A key-value pair. The key (string) is the bitcoin address, the value (float or string) is the amount in BCH
  //     },
  //     {
  //       "data": "hex"        (obj, optional) A key-value pair. The key must be "data", the value is hex encoded data
  //     }
  //     ,...                     More key-value pairs of the above form. For compatibility reasons, a dictionary, which holds the key-value pairs directly, is also
  //                              accepted as second parameter.
  //    ]
  // 3. locktime                  (numeric, optional, default=0) Raw locktime. Non-0 value also locktime-activates inputs
  // Result:
  // "transaction"              (string) hex string of the transaction
  public async createRawTransaction(
    inputs: { txid: string; vout: number; sequence?: number }[],
    outputs: Record<string, string>,
    lockTime?: number
  ) {
    return this.cmdWithRetryAndParse(
      schemas.createRawTransactionResultSchema,
      'createrawtransaction',
      inputs,
      outputs,
      lockTime
    );
  }

  // Arguments:
  // 1. hexstring                          (string, required) The hex string of the raw transaction
  // 2. options                            (json object, optional) for backward compatibility: passing in a true instead of an object will result in {"includeWatching":true}
  //      {
  //        "changeAddress": "str",        (string, optional, default=pool address) The bitcoin address to receive the change
  //        "changePosition": n,           (numeric, optional, default=random) The index of the change output
  //        "change_type": "str",          (string, optional, default=set by -changetype) The output type to use. Only valid if changeAddress is not specified. Options are "legacy", "p2sh-segwit", and "bech32".
  //        "includeWatching": bool,       (boolean, optional, default=true for watch-only wallets, otherwise false) Also select inputs which are watch only.
  //                                       Only solvable inputs can be used. Watch-only destinations are solvable if the public key and/or output script was imported,
  //                                       e.g. with 'importpubkey' or 'importmulti' with the 'pubkeys' or 'desc' field.
  //        "lockUnspents": bool,          (boolean, optional, default=false) Lock selected unspent outputs
  //        "feeRate": amount,             (numeric or string, optional, default=not set: makes wallet determine the fee) Set a specific fee rate in BTC/kB
  //        "subtractFeeFromOutputs": [    (json array, optional, default=empty array) A json array of integers.
  //                                       The fee will be equally deducted from the amount of each specified output.
  //                                       Those recipients will receive less bitcoins than you enter in their corresponding amount field.
  //                                       If no outputs are specified here, the sender pays the fee.
  //          vout_index,                  (numeric) The zero-based output index, before a change output is added.
  //          ...
  //        ],
  //        "replaceable": bool,           (boolean, optional, default=wallet default) Marks this transaction as BIP125 replaceable.
  //                                       Allows this transaction to be replaced by a transaction with higher fees
  //        "conf_target": n,              (numeric, optional, default=wallet default) Confirmation target (in blocks)
  //        "estimate_mode": "str",        (string, optional, default=UNSET) The fee estimate mode, must be one of:
  //                                       "UNSET"
  //                                       "ECONOMICAL"
  //                                       "CONSERVATIVE"
  //      }
  // 3. iswitness                          (boolean, optional, default=depends on heuristic tests) Whether the transaction hex is a serialized witness transaction.
  //                                       If iswitness is not present, heuristic tests will be used in decoding.
  //                                       If true, only witness deserialization will be tried.
  //                                       If false, only non-witness deserialization will be tried.
  //                                       This boolean should reflect whether the transaction has inputs
  //                                       (e.g. fully valid, or on-chain transactions), if known by the caller.
  // Result:
  // {
  //   "hex":       "value", (string)  The resulting raw transaction (hex-encoded string)
  //   "fee":       n,         (numeric) Fee in BTC the resulting transaction pays
  //   "changepos": n          (numeric) The position of the added change output, or -1
  // }
  public async fundRawTransaction(
    hex: string,
    options: {
      changeAddress?: string,
      changePosition?: number,
      change_type?: string,
      includeWatching?: boolean,
      lockUnspents?: boolean,
      feeRate?: number,
      subtractFeeFromOutputs?: number[],
      replaceable?: boolean,
      conf_target?: number,
      estimate_mode?: BitcoinFeeEstimateMode
    },
    iswitness?: boolean
  ) {
    //@todo impl with iswitness option
    return this.cmdWithRetryAndParse(
      schemas.fundRawTransactionResultSchema,
      'fundrawtransaction',
      hex,
      options
    );
  }

  // Arguments:
  // 1. "address"            (string, required) The bitcoin address to send to.
  // 2. "amount"             (numeric or string, required) The amount in BTC to send. eg 0.1
  // 3. "comment"            (string, optional) A comment used to store what the transaction is for.
  //                              This is not part of the transaction, just kept in your wallet.
  // 4. "comment_to"         (string, optional) A comment to store the name of the person or organization
  //                              to which you're sending the transaction. This is not part of the
  //                              transaction, just kept in your wallet.
  // 5. subtractfeefromamount  (boolean, optional, default=false) The fee will be deducted from the amount being sent.
  //                              The recipient will receive less bitcoins than you enter in the amount field.
  // 6. replaceable            (boolean, optional) Allow this transaction to be replaced by a transaction with higher fees via BIP 125
  // 7. conf_target            (numeric, optional) Confirmation target (in blocks)
  // 8. "estimate_mode"      (string, optional, default=UNSET) The fee estimate mode, must be one of:
  //        "UNSET"
  //        "ECONOMICAL"
  //        "CONSERVATIVE"
  // 9. avoid_reuse              (boolean, optional, default=true) (only available if avoid_reuse wallet flag is set)
  // Avoid spending from dirty addresses; addresses are considered
  //                             dirty if they have previously been used in a transaction.
  //                              If true, this also activates avoidpartialspends, grouping outputs by their addresses.
  // 10. assetlabel              (string, optional) Hex asset id or asset label for balance.
  public async liquidSendToAddress(
    address: string,
    amount: string,
    comment: string | null,
    commentTo: string | null,
    subtractFeeFromAmount: boolean | null,
    replaceable: boolean | null,
    confTarget: number | null,
    estimateMode: BitcoinFeeEstimateMode | null,
    avoidReuse: boolean | null,
    asset: string | null
  ) {
    return this.cmdWithRetryAndParse(
      schemas.sendToAddressResultSchema,
      'sendtoaddress',
      address,
      amount,
      comment,
      commentTo,
      subtractFeeFromAmount,
      replaceable,
      confTarget,
      estimateMode,
      avoidReuse,
      asset
    );
  }

  public async getTransaction(txhash: string) {
    return this.cmdWithRetryAndParse(schemas.getTransactionResultSchema, 'gettransaction', txhash);
  }

  public async liquidGetTransaction(txhash: string) {
    return this.cmdWithRetryAndParse(schemas.liquidGetTransactionResultSchema, 'gettransaction', txhash);
  }

  public async getInfo() {
    return this.cmdWithRetryAndParse(schemas.getInfoResultSchema, 'getinfo');
  }

  public async getBlockchainInfo() {
    return this.cmdWithRetryAndParse(schemas.getBlockchainInfoResultSchema, 'getblockchaininfo');
  }

  public async getRawTransactionAsObject(txhash: string) {
    return this.cmdWithRetryAndParse(schemas.getRawTransactionAsObjectResultSchema, 'getrawtransaction', txhash, 1);
  }

  public async getBlockHashFromHeight(height: number) {
    return this.cmdWithRetryAndParse(schemas.getBlockHashFromHeightResultSchema, 'getblockhash', height);
  }

  public async getBlockFromHash(blockHash: string) {
    return this.cmdWithRetryAndParse(schemas.getBlockFromHashResultSchema, 'getblock', blockHash);
  }

  public async getBlockCount() {
    return this.cmdWithRetryAndParse(schemas.getBlockCountResultSchema, 'getblockcount');
  }

  public async getRawMempool() {
    return this.cmdWithRetryAndParse(schemas.getRawMempoolResultSchema, 'getrawmempool');
  }

  public async validateAddress(address: string) {
    return this.cmdWithRetryAndParse(schemas.validateAddressResultSchema, 'validateaddress', address);
  }

  public async liquidValidateAddress(address: string) {
    return this.cmdWithRetryAndParse(schemas.liquidValidateAddressResultSchema, 'validateaddress', address);
  }

  public async getNewAddress() {
    return this.cmdWithRetryAndParse(schemas.getNewAddressResultSchema, 'getnewaddress');
  }

  public async getBalance(minConf = 0) {
    return this.cmdWithRetryAndParse(schemas.getBalanceResultSchema, 'getbalance', '*', minConf);
  }

  public async generateToAddress(nblocks: number, address:string) {
    return this.cmdWithRetryAndParse(schemas.generateToAddressResultSchema, 'generatetoaddress', nblocks, address);
  }

  public async getLiquidBalanceForAsset(
    minConf: number | null = null,
    includeWatchOnly: boolean | null = null,
    avoidReuse: boolean | null = null,
    assetLabel: string
  ) {
    return this.cmdWithRetryAndParse(
      schemas.getLiquidBalanceForAssetResultSchema,
      'getbalance',
      '*',
      minConf,
      includeWatchOnly,
      avoidReuse,
      assetLabel
    );
  }

  public async getLiquidBalance(
    minConf: number | null = null,
    includeWatchOnly: boolean | null = null,
    assetLabel: string
  ) {
    return this.cmdWithRetryAndParse(
      schemas.getLiquidBalanceResultSchema,
      'getbalance',
      '*',
      minConf,
      includeWatchOnly
    );
  }

  public async omniGetWalletAddressBalances() {
    return this.cmdWithRetryAndParse(
      schemas.omniGetWalletAddressBalancesResultSchema,
      'omni_getwalletaddressbalances'
    );
  }

  public async ancientGetInfo() {
    return this.cmdWithRetryAndParse(schemas.ancientGetInfoResultSchema, 'getinfo');
  }

  // Arguments:
  // 1. fromaddress          (string, required) the address to send the tokens from
  // 2. toaddress            (string, required) the address of the receiver
  // 3. propertyid           (number, required) the identifier of the tokens to send
  // 4. amount               (string, required) the amount to send
  // 5. feeaddress           (string, required) the address that is used for change and to pay for fees, if needed

  // Result:
  // "hash"                  (string) the hex-encoded transaction hash
  public async omniFundedSend(
    fromAddress: string,
    toAddress: string,
    propertyId: number,
    amount: string,
    feeAddress: string
  ) {
    return this.cmdWithRetryAndParse(
      schemas.omniFundedSendResultSchema,
      'omni_funded_send',
      fromAddress,
      toAddress,
      propertyId,
      amount,
      feeAddress
    );
  }

  public async omniFundedSendAll(fromAddress: string, toAddress: string, ecosystem: 1 | 2, feeAddress: string) {
    return this.cmdWithRetryAndParse(
      schemas.omniFundedSendAllResultSchema,
      'omni_funded_sendall',
      fromAddress,
      toAddress,
      ecosystem,
      feeAddress
    );
  }

  public async omniGetTransaction(txid: string) {
    return this.cmdWithRetryAndParse(schemas.omniGetTransactionResultSchema, 'omni_gettransaction', txid);
  }

  public async omniListPendingTransactions() {
    return this.cmdWithRetryAndParse(schemas.omniListPendingTransactionsSchema, 'omni_listpendingtransactions');
  }

  public async zcashGetOperationResult(operationIds: string[]) {
    return this.cmdWithRetryAndParse(schemas.zcashGetOperationResultSchema, 'z_getoperationresult', operationIds);
  }

  public async zcashGetBalanceForAddress(address: string) {
    return this.cmdWithRetryAndParse(schemas.zcashGetBalanceForAddressSchema, 'z_getbalance', address);
  }

  public async zcashSendMany(
    fromAddress: string,
    amounts: {
      address: string;
      amount: number;
      memo?: string;
    }[],
    minConf?: number,
    fee?: number,
    privacyPolicy?: string
  ) {
    const args: any[] = [fromAddress, amounts];

    if (minConf !== undefined) {
      args.push(minConf);

      if (fee !== undefined) {
        args.push(fee);

        if (privacyPolicy !== undefined) {
          args.push(privacyPolicy);
        }
      }
    } else if (fee !== undefined) {
      throw new Error('Cannot specify fee without specifying minConf');
    }

    return this.cmdWithRetryAndParse(schemas.zcashSendManySchema, 'z_sendmany', ...args);
  }

  public async zcashValidateAddress(address: string) {
    return this.cmdWithRetryAndParse(schemas.zcashValidateAddressSchema, 'z_validateaddress', address);
  }

  // Arguments:
  // 1. fromaddress          (string, required) the address to send from
  // 2. toaddress            (string, required) the address of the receiver
  // 3. propertyid           (number, required) the identifier of the tokens to send
  // 4. amount               (string, required) the amount to send
  // 5. redeemaddress        (string, optional) an address that can spend the transaction dust (sender by default)
  // 6. referenceamount      (string, optional) a bitcoin amount that is sent to the receiver (minimal by default)
  public async omniSend(fromAddress: string, toAddress: string, propertyId: number, amount: string) {
    return this.cmdWithRetryAndParse(
      schemas.omniSendSchema,
      'omni_send',
      fromAddress,
      toAddress,
      propertyId,
      amount
    );
  }

  public async zcashGetNewAddress(type?: string) {
    const args: any[] = type === undefined ? [] : [type];

    return this.cmdWithRetryAndParse(schemas.zcashGetNewAddressSchema, 'z_getnewaddress', ...args);
  }

  public async zcashListUnspent(minConf?: number) {
    const args: any[] = minConf === undefined ? [] : [minConf];

    return this.cmdWithRetryAndParse(schemas.zcashListUnspentSchema, 'z_listunspent', ...args);
  }

  public async listUnspent(minConf?: number) {
    const args: any[] = minConf === undefined ? [] : [minConf];

    return this.cmdWithRetryAndParse(schemas.listUnspentSchema, 'listunspent', ...args);
  }

  public async dumpPrivateKey(address: string) {
    return this.cmdWithRetryAndParse(schemas.dumpPrivateKeySchema, 'dumpprivkey', address);
  }

  public async ecashIsFinalTransaction(txid: string, blockhash?: string) {
    return this.cmdWithRetryAndParse(schemas.ecashIsFinalTransactionSchema, 'isfinaltransaction', txid, blockhash);
  }

  public async isReady() {
    try {
      if (this.options.ancient === true) {
        await this.ancientGetInfo();
      } else {
        await this.getBlockchainInfo();
      }

      return true;
    } catch (error) {
      return false;
    }
  }
}
