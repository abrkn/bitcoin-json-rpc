/* eslint-disable @typescript-eslint/camelcase */
import delay from 'delay';
import createDebug from 'debug';
import { iotsDecode } from './utils';
import { jsonRpcCmd } from './json-rpc';
import { CreateBitcoinJsonRpcOptions, LiquidSendToAddressEstimateMode } from './types';
import { BitcoinJsonRpcError } from './BitcoinJsonRpcError';
import * as decoders from './decoders';

const debug = createDebug('bitcoin-json-rpc');

const getWasExecutedFromError = (method: string, error: Error) => {
  const notExecutedErrorMessages = [
    /^Work queue depth exceeded$/,
    /^Loading block index/,
    /^Rewinding blocks/,
    /^Error creating transaction/,
    /^Loading P2P addresses/,
    /^Insufficient funds$/,
    /^Error with selected inputs/,
    /^Sender has insufficient balance/,
    /^Insufficient funds/,
    /^ECONNREFUSED$/, // TODO: Move to jsonRpcCmd
    /^Verifying blocks/,
    /^Loading wallet/,
    /fees may not be sufficient/,
    /Error choosing inputs for the send transaction/,
    /Rewinding blocks/,
    /Invalid amount/,
    /^Activating best chain/,
    /^Parsing Omni Layer transactions/,
    /^Upgrading/,
  ];

  if (notExecutedErrorMessages.some((_) => error.message.match(_) !== null)) {
    return false;
  }

  return null;
};

// NOTE: Assumes there were no effects
const getShouldRetry = (method: string, error: Error) => {
  if (error.message.match(/^Insufficient funds$/)) {
    return false;
  }

  if (method === 'gettransaction' && error.message.match(/Invalid or non-wallet transaction id/)) {
    return false;
  }

  if (method.match(/^omni_/) && error.message.match(/Error creating transaction/)) {
    return false;
  }

  if (method.match(/^omni_/) && error.message.match(/Error choosing inputs/)) {
    return false;
  }

  // Transaction has dropped out of mempool (and is unlikely to resurface from retrying)
  if (method === 'getrawtransaction' && error.message.match(/No such mempool/)) {
    return false;
  }

  return true;
};

export const createBitcoinJsonRpc = (url: string, options: CreateBitcoinJsonRpcOptions = {}) => {
  if (url === undefined) {
    throw new Error(`url is required`);
  }

  const jsonRpcCmdWithUrl = (method: string, ...params: any[]) => jsonRpcCmd(url, method, params);

  const jsonRpcCmdWithUrlAndRetry = (method: string, ...params: any[]) => {
    const maxAttempts = 5;
    const delayBetweenAttemptsMs = 5000;

    const methodIsPure = [
      'getinfo',
      'getblockchaininfo',
      'getrawtransaction',
      'getblockhash',
      'getrawmempool',
      'validateaddress',
      'getbalance',
      'omni_getwalletaddressbalances',
      'omni_gettransaction',
      'omni_listpendingtransactions',
      'z_getoperationresult',
      'z_getbalance',
      'z_validateaddress',
      'z_listunspent',
      'listunspent',
      'dumpprivkey',
      'gettransaction',
    ].includes(method);

    const attempt: (attemptN?: number) => any = async (attemptN = 1) => {
      const getErrrorData = () => ({
        bitcoinJsonRpc: {
          method,
          params,
          methodIsPure,
          maxAttempts,
          attempts: attemptN,
          url, // TODO: Censor credentials
        },
      });

      try {
        const result = await jsonRpcCmdWithUrl(method, ...params);
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
          await delay(delayBetweenAttemptsMs);

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
  };

  const sendRawTransaction = async (hex: string) => {
    const response = await jsonRpcCmdWithUrlAndRetry('sendrawtransaction', hex);
    return iotsDecode(decoders.SendRawTransactionResultDecoder, response);
  };

  const sendToAddress = async (address: string, amount: string) => {
    const response = await jsonRpcCmdWithUrlAndRetry('sendtoaddress', address, amount);
    return iotsDecode(decoders.SendToAddressResultDecoder, response);
  };

  const signRawTransactionWithWallet = async (hex: string) => {
    const response = await jsonRpcCmdWithUrlAndRetry('signrawtransactionwithwallet', hex);
    return iotsDecode(decoders.SignRawTransactionWithWalletResultDecoder, response);
  };

  const lockUnspent = async (unlock: boolean, transactions: { txid: string; vout: number }[]) => {
    const response = await jsonRpcCmdWithUrlAndRetry('lockunspent', unlock, transactions);
    return iotsDecode(decoders.LockUnspentResultDecoder, response);
  };

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
  const createRawTransaction = async (
    inputs: { txid: string; vout: number; sequence?: number }[],
    outputs: Record<string, string>,
    lockTime?: number
  ) => {
    const response = await jsonRpcCmdWithUrlAndRetry('createrawtransaction', inputs, outputs, lockTime);

    return iotsDecode(decoders.CreateRawTransactionResultDecoder, response);
  };

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
  const liquidSendToAddress = async (
    address: string,
    amount: string,
    comment: string | null,
    commentTo: string | null,
    subtractFeeFromAmount: boolean | null,
    replaceable: boolean | null,
    confTarget: number | null,
    estimateMode: LiquidSendToAddressEstimateMode | null,
    asset: string | null
  ) => {
    const response = await jsonRpcCmdWithUrlAndRetry(
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
    return iotsDecode(decoders.SendToAddressResultDecoder, response);
  };

  const getTransaction = async (txhash: string) => {
    const response = await jsonRpcCmdWithUrlAndRetry('gettransaction', txhash);
    return iotsDecode(decoders.GetTransactionResultDecoder, response);
  };

  const liquidGetTransaction = async (txhash: string) => {
    const response = await jsonRpcCmdWithUrlAndRetry('gettransaction', txhash);
    return iotsDecode(decoders.LiquidGetTransactionResultDecoder, response);
  };

  const getInfo = async () => {
    const response = await jsonRpcCmdWithUrlAndRetry('getinfo');
    return iotsDecode(decoders.GetInfoResultDecoder, response);
  };

  const getBlockchainInfo = async () => {
    const response = await jsonRpcCmdWithUrlAndRetry('getblockchaininfo');
    return iotsDecode(decoders.GetBlockchainInfoResultDecoder, response);
  };

  const getRawTransactionAsObject = async (txhash: string) => {
    const response = await jsonRpcCmdWithUrlAndRetry('getrawtransaction', txhash, 1);
    return iotsDecode(decoders.GetRawTransactionAsObjectResultDecoder, response);
  };

  const getBlockHashFromHeight = async (height: number) => {
    const response = await jsonRpcCmdWithUrlAndRetry('getblockhash', height);
    return iotsDecode(decoders.GetBlockHashFromHeightResultDecoder, response);
  };

  const getBlockFromHash = async (blockHash: string) => {
    const response = await jsonRpcCmdWithUrlAndRetry('getblock', blockHash);
    return iotsDecode(decoders.GetBlockFromHashResultDecoder, response);
  };

  const getRawMempool = async () => {
    const response = await jsonRpcCmdWithUrlAndRetry('getrawmempool');
    return iotsDecode(decoders.GetRawMempoolResultDecoder, response);
  };

  const validateAddress = async (address: string) => {
    const response = await jsonRpcCmdWithUrlAndRetry('validateaddress', address);
    return iotsDecode(decoders.ValidateAddressResultDecoder, response);
  };

  const liquidValidateAddress = async (address: string) => {
    const response = await jsonRpcCmdWithUrlAndRetry('validateaddress', address);
    return iotsDecode(decoders.LiquidValidateAddressResultDecoder, response);
  };

  const getNewAddress = async () => {
    const response = await jsonRpcCmdWithUrlAndRetry('getnewaddress');
    return iotsDecode(decoders.GetNewAddressResultDecoder, response);
  };

  const getBalance = async () => {
    const response = await jsonRpcCmdWithUrlAndRetry('getbalance');
    return iotsDecode(decoders.GetBalanceResultDecoder, response);
  };

  const getLiquidBalanceForAsset = async (
    minConf: number | null = null,
    includeWatchOnly: boolean | null = null,
    assetLabel: string
  ) => {
    const response = await jsonRpcCmdWithUrlAndRetry('getbalance', '*', minConf, includeWatchOnly, assetLabel);

    return iotsDecode(decoders.GetLiquidBalanceForAssetResultDecoder, response);
  };

  const getLiquidBalance = async (
    minConf: number | null = null,
    includeWatchOnly: boolean | null = null,
    assetLabel: string
  ) => {
    const response = await jsonRpcCmdWithUrlAndRetry('getbalance', '*', minConf, includeWatchOnly);

    return iotsDecode(decoders.GetLiquidBalanceResultDecoder, response);
  };

  const omniGetWalletAddressBalances = async () => {
    const response = await jsonRpcCmdWithUrlAndRetry('omni_getwalletaddressbalances');
    return iotsDecode(decoders.OmniGetWalletAddressBalancesResultDecoder, response);
  };

  const ancientGetInfo = async () => {
    const response = await jsonRpcCmdWithUrlAndRetry('getinfo');
    return iotsDecode(decoders.AncientGetInfoResultDecoder, response);
  };

  // Arguments:
  // 1. fromaddress          (string, required) the address to send the tokens from
  // 2. toaddress            (string, required) the address of the receiver
  // 3. propertyid           (number, required) the identifier of the tokens to send
  // 4. amount               (string, required) the amount to send
  // 5. feeaddress           (string, required) the address that is used for change and to pay for fees, if needed

  // Result:
  // "hash"                  (string) the hex-encoded transaction hash
  const omniFundedSend = async (
    fromAddress: string,
    toAddress: string,
    propertyId: number,
    amount: string,
    feeAddress: string
  ) => {
    const response = await jsonRpcCmdWithUrlAndRetry(
      'omni_funded_send',
      fromAddress,
      toAddress,
      propertyId,
      amount,
      feeAddress
    );

    return iotsDecode(decoders.OmniFundedSendResultDecoder, response);
  };

  const omniFundedSendAll = async (fromAddress: string, toAddress: string, ecosystem: 1 | 2, feeAddress: string) => {
    const response = await jsonRpcCmdWithUrlAndRetry(
      'omni_funded_sendall',
      fromAddress,
      toAddress,
      ecosystem,
      feeAddress
    );

    return iotsDecode(decoders.OmniFundedSendAllResultDecoder, response);
  };

  const omniGetTransaction = async (txid: string) => {
    const response = await jsonRpcCmdWithUrlAndRetry('omni_gettransaction', txid);
    return iotsDecode(decoders.OmniGetTransactionResultDecoder, response);
  };

  const omniListPendingTransactions = async () => {
    const response = await jsonRpcCmdWithUrlAndRetry('omni_listpendingtransactions');
    return iotsDecode(decoders.OmniListPendingTransactionsDecoder, response);
  };

  const zcashGetOperationResult = async (operationIds: string[]) => {
    const response = await jsonRpcCmdWithUrlAndRetry('z_getoperationresult', operationIds);
    return iotsDecode(decoders.ZcashGetOperationResultDecoder, response);
  };

  const zcashGetBalanceForAddress = async (address: string) => {
    const response = await jsonRpcCmdWithUrlAndRetry('z_getbalance', address);
    return iotsDecode(decoders.ZcashGetBalanceForAddressDecoder, response);
  };

  const zcashSendMany = async (
    fromAddress: string,
    amounts: {
      address: string;
      amount: number;
      memo?: string;
    }[],
    minConf?: number,
    fee?: number
  ) => {
    const args: any[] = [fromAddress, amounts];

    if (minConf !== undefined) {
      args.push(minConf);

      if (fee !== undefined) {
        args.push(fee);
      }
    } else if (fee !== undefined) {
      throw new Error('Cannot specify fee without specifying minConf');
    }

    const response = await jsonRpcCmdWithUrlAndRetry('z_sendmany', ...args);
    return iotsDecode(decoders.ZcashSendManyDecoder, response);
  };

  const zcashValidateAddress = async (address: string) => {
    const response = await jsonRpcCmdWithUrlAndRetry('z_validateaddress', address);
    return iotsDecode(decoders.ZcashValidateAddressDecoder, response);
  };

  // Arguments:
  // 1. fromaddress          (string, required) the address to send from
  // 2. toaddress            (string, required) the address of the receiver
  // 3. propertyid           (number, required) the identifier of the tokens to send
  // 4. amount               (string, required) the amount to send
  // 5. redeemaddress        (string, optional) an address that can spend the transaction dust (sender by default)
  // 6. referenceamount      (string, optional) a bitcoin amount that is sent to the receiver (minimal by default)
  const omniSend = async (fromAddress: string, toAddress: string, propertyId: number, amount: string) => {
    const response = await jsonRpcCmdWithUrlAndRetry('omni_send', fromAddress, toAddress, propertyId, amount);

    return iotsDecode(decoders.OmniSendDecoder, response);
  };

  const zcashGetNewAddress = async (type?: string) => {
    const args: any[] = type === undefined ? [] : [type];

    const response = await jsonRpcCmdWithUrlAndRetry('z_getnewaddress', ...args);

    return iotsDecode(decoders.ZcashGetNewAddressDecoder, response);
  };

  const zcashListUnspent = async (minConf?: number) => {
    const args: any[] = minConf === undefined ? [] : [minConf];

    const response = await jsonRpcCmdWithUrlAndRetry('z_listunspent', ...args);

    return iotsDecode(decoders.ZcashListUnspentDecoder, response);
  };

  const listUnspent = async (minConf?: number) => {
    const args: any[] = minConf === undefined ? [] : [minConf];

    const response = await jsonRpcCmdWithUrlAndRetry('listunspent', ...args);
    return iotsDecode(decoders.ListUnspentDecoder, response);
  };

  const dumpPrivateKey = async (address: string) => {
    const response = await jsonRpcCmdWithUrlAndRetry('dumpprivkey', address);
    return iotsDecode(decoders.DumpPrivateKeyDecoder, response);
  };

  const isReady = async () => {
    try {
      if (options.ancient === true) {
        await ancientGetInfo();
      } else {
        await getBlockchainInfo();
      }

      return true;
    } catch (error) {
      return false;
    }
  };

  return {
    lockUnspent,
    sendRawTransaction,
    signRawTransactionWithWallet,
    createRawTransaction,
    sendToAddress,
    getTransaction,
    getInfo,
    getBlockchainInfo,
    getRawTransactionAsObject,
    getBlockHashFromHeight,
    getBlockFromHash,
    getRawMempool,
    getNewAddress,
    validateAddress,
    getBalance,
    getLiquidBalance,
    getLiquidBalanceForAsset,
    omniGetWalletAddressBalances,
    ancientGetInfo,
    liquidValidateAddress,
    omniFundedSend,
    omniFundedSendAll,
    omniGetTransaction,
    omniListPendingTransactions,
    zcashGetOperationResult,
    zcashGetBalanceForAddress,
    zcashSendMany,
    zcashValidateAddress,
    omniSend,
    zcashGetNewAddress,
    zcashListUnspent,
    listUnspent,
    dumpPrivateKey,
    liquidGetTransaction,
    liquidSendToAddress,
    isReady,
  };
};

export type BitcoinJsonRpc = ReturnType<typeof createBitcoinJsonRpc>;

export * from './json-rpc';
export * from './types';
export * from './BitcoinJsonRpcError';
export * as decoders from './decoders';
