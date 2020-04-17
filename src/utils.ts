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
