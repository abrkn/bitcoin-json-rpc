import axios, { AxiosResponse } from 'axios';
import createDebug from 'debug';
import { throwIfErrorInResponseDataWithExtraProps, maybeShortenErrorMessage } from './utils';

const debug = createDebug('bitcoin-json-rpc');

const MAX_LOG_LENGTH = 250;

export const jsonRpcCmd: (url: string, method: string, params?: any) => Promise<any> = async (
  url: string,
  method: string,
  params: any[],
  _options: object | undefined = {}
) => {
  const payload = {
    jsonrpc: '2.0',
    id: 1,
    method,
    params,
  };

  debug(`--> REQ`, payload);

  let response: AxiosResponse;

  try {
    response = await axios.post(url, payload);
  } catch (error) {
    const errorAsAny = error as any;

    if (errorAsAny.response && errorAsAny.response.data) {
      throwIfErrorInResponseDataWithExtraProps(errorAsAny.response.data, errorAsAny, {
        data: {
          jsonRpcRequest: {
            url,
            method,
            params,
          },
        },
      });
    }

    throw error;
  }

  const { data } = response;
  const contentTypeIsJson = response.headers['content-type'] === 'application/json';

  // NOTE: Incorrect if the response is actually a JSON string?
  const dataStrict = contentTypeIsJson && typeof data === 'string' ? JSON.parse(data) : data;

  if (dataStrict !== undefined) {
    throwIfErrorInResponseDataWithExtraProps(dataStrict, undefined, {
      data: {
        jsonRpcRequest: {
          url,
          method,
          params,
        },
      },
    });
  }

  const { result } = dataStrict;

  if (result === undefined) {
    const dataAsText = typeof dataStrict === 'string' ? dataStrict : JSON.stringify(dataStrict);

    throw Object.assign(new Error(maybeShortenErrorMessage(`Result missing from ${dataAsText}`)), {
      data: {
        jsonRpcRequest: {
          url,
          method,
          params,
        },
      },
    });
  }

  const resultForLogging = JSON.stringify(result).substr(0, MAX_LOG_LENGTH);

  debug(`<-- RES`, resultForLogging);

  return result;
};
