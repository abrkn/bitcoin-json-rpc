import { merge } from 'lodash';
import createDebug from 'debug';
import * as t from 'io-ts';
import { ActuallyThrowReporter } from './ActuallyThrowReporter';

const MAX_ERROR_MESSAGE_LENGTH = 150;

const debug = createDebug('bitcoin-json-rpc');

export const maybeShortenErrorMessage = (value: string) => value.substr(0, MAX_ERROR_MESSAGE_LENGTH);

export function iotsDecode<A, I = unknown>(decoder: t.Decoder<I, A>, value: any) {
  const decoded = decoder.decode(value);

  try {
    ActuallyThrowReporter.report(decoded);
  } catch (error) {
    throw Object.assign(error, {
      data: {
        ...error.data,
        value,
      },
    });
  }

  // eslint-disable-next-line no-underscore-dangle
  if (decoded._tag === 'Left') {
    throw new Error('TypeScript guard');
  }

  return decoded.right as A;
}

export const mergeErrorStacks = (error: Error, prevError: Error) =>
  prevError
    ? Object.assign(error, {
        stack: [error.stack, prevError.stack].join('\n'),
      })
    : error;

export const throwIfErrorInResponseData = (data: any, prevError?: any) => {
  if (data === undefined) {
    throw mergeErrorStacks(new Error('data is undefined'), prevError);
  }

  if (typeof data === 'string') {
    throw mergeErrorStacks(
      Object.assign(new Error(maybeShortenErrorMessage(data)), {
        data: { jsonRpcResponse: data },
      }),
      prevError
    );
  }

  if (data.error === undefined || data.error === null) {
    return;
  }

  if (data.error.message) {
    debug(`<-- ERR`, data.error.message);
    throw Object.assign(new Error(maybeShortenErrorMessage(data.error.message)), {
      data: { jsonRpcResponse: data },
    });
  }

  throw Object.assign(new Error(maybeShortenErrorMessage(JSON.stringify(data))), {
    data: { jsonRpcResponse: data },
  });
};

export const throwIfErrorInResponseDataWithExtraProps = (data: any, prevError: Error | undefined, props: any) => {
  try {
    throwIfErrorInResponseData(data, prevError);
  } catch (error) {
    const mergedError = prevError ? mergeErrorStacks(error, prevError) : error;
    throw merge(mergedError, props);
  }
};

export const PURE_METHODS = [
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
];

export const getWasExecutedFromError = (method: string, error: Error) => {
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
    /^Error committing transaction/,
  ];

  if (notExecutedErrorMessages.some((_) => error.message.match(_) !== null)) {
    return false;
  }

  return null;
};

// NOTE: Assumes there were no effects
export const getShouldRetry = (method: string, error: Error) => {
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
