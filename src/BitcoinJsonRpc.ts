import delay from 'delay';
import createDebug from 'debug';
import {CreateBitcoinJsonRpcOptions, BitcoinFeeEstimateMode, AddressTypes} from './types';
import { jsonRpcCmd } from './json-rpc';
import { PURE_METHODS, getWasExecutedFromError, getShouldRetry, iotsDecode } from './utils';
import { BitcoinJsonRpcError } from './BitcoinJsonRpcError';
import * as decoders from './decoders';
import * as t from 'io-ts';
import {GetImportWalletsResultDecoder} from "./decoders";

const MAX_ATTEMPTS = 5;
const DELAY_BETWEEN_ATTEMPTS = 5000;

const debug = createDebug('bitcoin-json-rpc');

export default class BitcoinJsonRpc {
  constructor(readonly url: string, readonly options: CreateBitcoinJsonRpcOptions = {}) {
    this.url = url;
    this.options = options;
  }

  private cmd(method: string, ...params: any[]): Promise<any> {
    return jsonRpcCmd(this.url, method, params);
  }

  private cmdWithRetry(method: string, ...params: any[]): Promise<any> {
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
      } catch (error) {
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

  private async cmdWithRetryAndDecode<A, I = unknown>(
    decoder: t.Decoder<I, A>,
    method: string,
    ...params: any[]
  ): Promise<A> {
    const result = await this.cmdWithRetry(method, ...params);

    try {
      const decoded = iotsDecode(decoder, result);

      return decoded;
    } catch (error) {
      throw Object.assign(error, { executed: true });
    }
  }

  public async sendRawTransaction(hex: string) {
    return this.cmdWithRetryAndDecode(decoders.SendRawTransactionResultDecoder, 'sendrawtransaction', hex);
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

    return this.cmdWithRetryAndDecode(decoders.SendToAddressResultDecoder, 'sendtoaddress', ...params);
  }

  public async signRawTransactionWithWallet(hex: string) {
    return this.cmdWithRetryAndDecode(
      decoders.SignRawTransactionWithWalletResultDecoder,
      'signrawtransactionwithwallet',
      hex
    );
  }

  public async lockUnspent(unlock: boolean, transactions: { txid: string; vout: number }[]) {
    return this.cmdWithRetryAndDecode(decoders.LockUnspentResultDecoder, 'lockunspent', unlock, transactions);
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
    return this.cmdWithRetryAndDecode(
      decoders.CreateRawTransactionResultDecoder,
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
    return this.cmdWithRetryAndDecode(
      decoders.FundRawTransactionResultDecoder, 'fundrawtransaction', hex, options
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
  // 9. "assetlabel"               (string, optional) Hex asset id or asset label for balance.
  public async liquidSendToAddress(
    address: string,
    amount: string,
    comment: string | null,
    commentTo: string | null,
    subtractFeeFromAmount: boolean | null,
    replaceable: boolean | null,
    confTarget: number | null,
    estimateMode: BitcoinFeeEstimateMode | null,
    asset: string | null
  ) {
    return this.cmdWithRetryAndDecode(
      decoders.SendToAddressResultDecoder,
      'sendtoaddress',
      address,
      amount,
      comment,
      commentTo,
      subtractFeeFromAmount,
      replaceable,
      confTarget,
      estimateMode,
      asset
    );
  }

  public async getTransaction(txhash: string) {
    return this.cmdWithRetryAndDecode(decoders.GetTransactionResultDecoder, 'gettransaction', txhash);
  }

  public async liquidGetTransaction(txhash: string) {
    return this.cmdWithRetryAndDecode(decoders.LiquidGetTransactionResultDecoder, 'gettransaction', txhash);
  }

  public async getInfo() {
    return this.cmdWithRetryAndDecode(decoders.GetInfoResultDecoder, 'getinfo');
  }

  public async getBlockchainInfo() {
    return this.cmdWithRetryAndDecode(decoders.GetBlockchainInfoResultDecoder, 'getblockchaininfo');
  }

  public async getRawTransactionAsObject(txhash: string) {
    return this.cmdWithRetryAndDecode(decoders.GetRawTransactionAsObjectResultDecoder, 'getrawtransaction', txhash, 1);
  }

  public async getBlockHashFromHeight(height: number) {
    return this.cmdWithRetryAndDecode(decoders.GetBlockHashFromHeightResultDecoder, 'getblockhash', height);
  }

  public async getBlockFromHash(blockHash: string) {
    return this.cmdWithRetryAndDecode(decoders.GetBlockFromHashResultDecoder, 'getblock', blockHash);
  }

  public async getRawMempool() {
    return this.cmdWithRetryAndDecode(decoders.GetRawMempoolResultDecoder, 'getrawmempool');
  }

  public async validateAddress(address: string) {
    return this.cmdWithRetryAndDecode(decoders.ValidateAddressResultDecoder, 'validateaddress', address);
  }

  public async liquidValidateAddress(address: string) {
    return this.cmdWithRetryAndDecode(decoders.LiquidValidateAddressResultDecoder, 'validateaddress', address);
  }

  public async getNewAddress(options: {
    label?: string,
    type?: AddressTypes
  } = {}) {
    const args: any[] = [options.label, options.type];
    return this.cmdWithRetryAndDecode(decoders.GetNewAddressResultDecoder, 'getnewaddress', ...args);
  }

  public async getBalance() {
    return this.cmdWithRetryAndDecode(decoders.GetBalanceResultDecoder, 'getbalance');
  }

  public async getBalances() {
    return this.cmdWithRetryAndDecode(decoders.GetBalancesResultDecoder, 'getbalances');
  }

  public async listLabels() {
    return this.cmdWithRetryAndDecode(decoders.GetListLabelsResultDecoder, 'listlabels');
  }

  public async listWallets() {
    return this.cmdWithRetryAndDecode(decoders.GetListWalletsResultDecoder, 'listwallets');
  }

  // Arguments:
  // 1. wallet_name             (string, required) The name for the new wallet. If this is a path, the wallet will be created at the path location.
  // 2. disable_private_keys    (boolean, optional, default=false) Disable the possibility of private keys (only watchonlys are possible in this mode).
  // 3. blank                   (boolean, optional, default=false) Create a blank wallet. A blank wallet has no keys or HD seed. One can be set using sethdseed.
  // 4. passphrase              (string, optional) Encrypt the wallet with this passphrase.
  // 5. avoid_reuse             (boolean, optional, default=false) Keep track of coin reuse, and treat dirty and clean coins differently with privacy considerations in mind.
  // 6. descriptors             (boolean, optional, default=false) Create a native descriptor wallet. The wallet will use descriptors internally to handle address creation
  // 7. load_on_startup         (boolean, optional) Save wallet name to persistent settings and load on startup. True to add wallet to startup list, false to remove, null to leave unchanged.
  // 8. external_signer         (boolean, optional, default=false) Use an external signer such as a hardware wallet. Requires -signer to be configured. Wallet creation will fail if keys cannot be fetched. Requires disable_private_keys and descriptors set to true.
  public async createWallet(
      wallet_name:string,
      options: {
        disable_private_keys?: boolean | false,
        blank?: boolean | false,
        passphrase?: string | null,
        avoid_reuse?: boolean | false,
        descriptors?: boolean | false,
        load_on_startup?: boolean | false,
        external_signer?: boolean | false
      } = {}
  ) {
    const args: any[] = [wallet_name];
    args.push(options.disable_private_keys)
    args.push(options.blank)
    args.push(options.passphrase)
    args.push(options.avoid_reuse)
    args.push(options.descriptors)
    args.push(options.load_on_startup)
    args.push(options.external_signer)

    return this.cmdWithRetryAndDecode(decoders.GetCreateWalletsResultDecoder, 'createwallet', ...args);
  }

  public async walletPassphrase(passphrase:string, timeout:number) {
    return this.cmdWithRetryAndDecode(decoders.GetWalletPassphraseResultDecoder, 'walletpassphrase', passphrase, timeout);
  }

  // https://developer.bitcoin.org/reference/rpc/loadwallet.html
  public async loadWallet(filename:string, load_on_startup:boolean | null = null) {
    return this.cmdWithRetryAndDecode(decoders.GetLoadWalletsResultDecoder, 'loadwallet', filename, load_on_startup);
  }

  // https://developer.bitcoin.org/reference/rpc/unloadwallet.html
  public async unloadWallet(wallet_name:string, load_on_startup:boolean | null = null) {
    return this.cmdWithRetryAndDecode(decoders.GetUnLoadWalletsResultDecoder, 'unloadwallet', wallet_name, load_on_startup);
  }

  // https://developer.bitcoin.org/reference/rpc/backupwallet.html
  public async backupWallet(destination:string) {
    return this.cmdWithRetryAndDecode(decoders.GetBackupWalletResultDecoder, 'backupwallet', destination);
  }

  // https://developer.bitcoin.org/reference/rpc/dumpwallet.html
  public async dumpWallet(filename:string) {
    return this.cmdWithRetryAndDecode(decoders.GetDumpWalletsResultDecoder, 'dumpwallet', filename);
  }

  // https://developer.bitcoin.org/reference/rpc/encryptwallet.html
  public async encryptWallet(passphrase:string) {
    return this.cmdWithRetryAndDecode(decoders.GetEncryptWalletsResultDecoder, 'encryptwallet', passphrase);
  }

  // https://developer.bitcoin.org/reference/rpc/importwallet.html
  public async importWallet(passphrase:string) {
    return this.cmdWithRetryAndDecode(decoders.GetImportWalletsResultDecoder, 'importwallet', passphrase);
  }

  public async generateToAddress(nblocks: number, address:string) {
    return this.cmdWithRetryAndDecode(decoders.GenerateToAddressResultDecoder, 'generatetoaddress', nblocks, address);
  }

  public async getLiquidBalanceForAsset(
    minConf: number | null = null,
    includeWatchOnly: boolean | null = null,
    assetLabel: string
  ) {
    return this.cmdWithRetryAndDecode(
      decoders.GetLiquidBalanceForAssetResultDecoder,
      'getbalance',
      '*',
      minConf,
      includeWatchOnly,
      assetLabel
    );
  }

  public async getLiquidBalance(
    minConf: number | null = null,
    includeWatchOnly: boolean | null = null,
    assetLabel: string
  ) {
    return this.cmdWithRetryAndDecode(
      decoders.GetLiquidBalanceResultDecoder,
      'getbalance',
      '*',
      minConf,
      includeWatchOnly
    );
  }

  public async omniGetWalletAddressBalances() {
    return this.cmdWithRetryAndDecode(
      decoders.OmniGetWalletAddressBalancesResultDecoder,
      'omni_getwalletaddressbalances'
    );
  }

  public async ancientGetInfo() {
    return this.cmdWithRetryAndDecode(decoders.AncientGetInfoResultDecoder, 'getinfo');
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
    return this.cmdWithRetryAndDecode(
      decoders.OmniFundedSendResultDecoder,
      'omni_funded_send',
      fromAddress,
      toAddress,
      propertyId,
      amount,
      feeAddress
    );
  }

  public async omniFundedSendAll(fromAddress: string, toAddress: string, ecosystem: 1 | 2, feeAddress: string) {
    return this.cmdWithRetryAndDecode(
      decoders.OmniFundedSendAllResultDecoder,
      'omni_funded_sendall',
      fromAddress,
      toAddress,
      ecosystem,
      feeAddress
    );
  }

  public async omniGetTransaction(txid: string) {
    return this.cmdWithRetryAndDecode(decoders.OmniGetTransactionResultDecoder, 'omni_gettransaction', txid);
  }

  public async omniListPendingTransactions() {
    return this.cmdWithRetryAndDecode(decoders.OmniListPendingTransactionsDecoder, 'omni_listpendingtransactions');
  }

  public async zcashGetOperationResult(operationIds: string[]) {
    return this.cmdWithRetryAndDecode(decoders.ZcashGetOperationResultDecoder, 'z_getoperationresult', operationIds);
  }

  public async zcashGetBalanceForAddress(address: string) {
    return this.cmdWithRetryAndDecode(decoders.ZcashGetBalanceForAddressDecoder, 'z_getbalance', address);
  }

  public async zcashSendMany(
    fromAddress: string,
    amounts: {
      address: string;
      amount: number;
      memo?: string;
    }[],
    minConf?: number,
    fee?: number
  ) {
    const args: any[] = [fromAddress, amounts];

    if (minConf !== undefined) {
      args.push(minConf);

      if (fee !== undefined) {
        args.push(fee);
      }
    } else if (fee !== undefined) {
      throw new Error('Cannot specify fee without specifying minConf');
    }

    return this.cmdWithRetryAndDecode(decoders.ZcashSendManyDecoder, 'z_sendmany', ...args);
  }

  public async zcashValidateAddress(address: string) {
    return this.cmdWithRetryAndDecode(decoders.ZcashValidateAddressDecoder, 'z_validateaddress', address);
  }

  // Arguments:
  // 1. fromaddress          (string, required) the address to send from
  // 2. toaddress            (string, required) the address of the receiver
  // 3. propertyid           (number, required) the identifier of the tokens to send
  // 4. amount               (string, required) the amount to send
  // 5. redeemaddress        (string, optional) an address that can spend the transaction dust (sender by default)
  // 6. referenceamount      (string, optional) a bitcoin amount that is sent to the receiver (minimal by default)
  public async omniSend(fromAddress: string, toAddress: string, propertyId: number, amount: string) {
    return this.cmdWithRetryAndDecode(
      decoders.OmniSendDecoder,
      'omni_send',
      fromAddress,
      toAddress,
      propertyId,
      amount
    );
  }

  public async zcashGetNewAddress(type?: string) {
    const args: any[] = type === undefined ? [] : [type];

    return this.cmdWithRetryAndDecode(decoders.ZcashGetNewAddressDecoder, 'z_getnewaddress', ...args);
  }

  public async zcashListUnspent(minConf?: number) {
    const args: any[] = minConf === undefined ? [] : [minConf];

    return this.cmdWithRetryAndDecode(decoders.ZcashListUnspentDecoder, 'z_listunspent', ...args);
  }

  public async listUnspent(minConf?: number) {
    const args: any[] = minConf === undefined ? [] : [minConf];

    return this.cmdWithRetryAndDecode(decoders.ListUnspentDecoder, 'listunspent', ...args);
  }

  public async dumpPrivateKey(address: string) {
    return this.cmdWithRetryAndDecode(decoders.DumpPrivateKeyDecoder, 'dumpprivkey', address);
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
