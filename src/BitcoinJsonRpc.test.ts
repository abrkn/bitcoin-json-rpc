import { jsonRpcCmd } from './json-rpc';
import BitcoinJsonRpc from './BitcoinJsonRpc';

jest.mock('delay');

jest.mock('./json-rpc', () => ({
  jsonRpcCmd: jest.fn(),
}));

describe('bitcoin-json-rpc', () => {
  const rpc = new BitcoinJsonRpc('https://localhost');

  // When there's not enough funds there's no reason to retry
  it('should not retry insufficient funds', () => {
    expect.assertions(5);

    (jsonRpcCmd as jest.Mock).mockImplementationOnce(async (url: string, method: string, params: any) => {
      expect(method).toBe('sendtoaddress');
      expect(params).toEqual(['1Bitcoin', '1.2']);

      throw new Error('Insufficient funds');
    });

    return rpc.sendToAddress('1Bitcoin', '1.2').catch((error) => {
      const { bitcoinJsonRpc } = error.data;
      expect(bitcoinJsonRpc.methodIsPure).toBe(false);
      expect(bitcoinJsonRpc.attempts).toBe(1);
      expect(error.executed).toBe(false);
    });
  });

  it('should retry getRawMempool', () => {
    expect.assertions(3);

    (jsonRpcCmd as jest.Mock)
      .mockImplementationOnce(async (url: string, method: string, params: any) => {
        expect(method).toBe('getrawmempool');

        throw new Error();
      })
      .mockImplementationOnce(async (url: string, method: string, params: any) => {
        expect(method).toBe('getrawmempool');

        return ['one', 'two'];
      });

    return rpc.getRawMempool().then((result) => {
      expect(result).toEqual(['one', 'two']);
    });
  });

  it('should retry send on ECONNREFUSED', () => {
    expect.assertions(5);

    (jsonRpcCmd as jest.Mock)
      .mockImplementationOnce(async (url: string, method: string, params: any) => {
        expect(method).toBe('sendtoaddress');
        expect(params).toEqual(['1Bitcoin', '1.2']);

        throw new Error('ECONNREFUSED');
      })
      .mockImplementationOnce(async (url: string, method: string, params: any) => {
        expect(method).toBe('sendtoaddress');
        expect(params).toEqual(['1Bitcoin', '1.2']);

        return 'hash';
      });

    return rpc.sendToAddress('1Bitcoin', '1.2').then((result) => {
      expect(result).toEqual('hash');
    });
  });

  it('throw if getBalance returns an object', () => {
    // expect.assertions(5);

    (jsonRpcCmd as jest.Mock).mockImplementationOnce(async (url: string, method: string, params: any) => {
      expect(url).toBe('https://localhost');
      expect(method).toBe('getbalance');
      expect(params).toEqual([]);

      return { balance: 1 };
    });

    return rpc.getBalance().catch((error) => {
      expect(error.executed).toBe(true);
    });
  });

  describe('sendToAddress', () => {
    it('should fall back to defaults', async () => {
      (jsonRpcCmd as jest.Mock).mockImplementationOnce(async (url: string, method: string, params: any) => {
        expect(url).toBe('https://localhost');
        expect(method).toBe('sendtoaddress');
        expect(params).toEqual(['1address', '1.01', '', '', false, true]);

        return 'hash';
      });

      const result = await rpc.sendToAddress('1address', '1.01', undefined, undefined, undefined, true);
      expect(result).toBe('hash');
    });
  });
});
