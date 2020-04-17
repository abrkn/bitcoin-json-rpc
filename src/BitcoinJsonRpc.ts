import delay from 'delay';
import createDebug from 'debug';
import { CreateBitcoinJsonRpcOptions, LiquidSendToAddressEstimateMode } from './types';
import { jsonRpcCmd } from './json-rpc';
import { PURE_METHODS, getWasExecutedFromError, getShouldRetry, iotsDecode } from './utils';
import { BitcoinJsonRpcError } from './BitcoinJsonRpcError';
import * as decoders from './decoders';
import * as t from 'io-ts';

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

  public async sendToAddress(address: string, amount: string) {
    return this.cmdWithRetryAndDecode(decoders.SendToAddressResultDecoder, 'sendtoaddress', address, amount);
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
    estimateMode: LiquidSendToAddressEstimateMode | null,
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

  public async getNewAddress() {
    return this.cmdWithRetryAndDecode(decoders.GetNewAddressResultDecoder, 'getnewaddress');
  }

  public async getBalance() {
    return this.cmdWithRetryAndDecode(decoders.GetBalanceResultDecoder, 'getbalance');
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
