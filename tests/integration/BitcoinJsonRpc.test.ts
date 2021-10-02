import BitcoinJsonRpc from './../../src/BitcoinJsonRpc';
require('dotenv').config()

describe('bitcoin-json-rpc-integration', () => {
    const url = process.env.RPC_PROTOCOL+'://'+process.env.RPC_USERNAME
        +':'+process.env.RPC_PASSWORD
        +'@'+process.env.RPC_HOST
        +':'+process.env.RPC_REGTEST_PORT;
    const rpc = new BitcoinJsonRpc(url);

  it('check getNewAddress', () => {
    rpc.getNewAddress({label:"test_label", type:'bech32'}).then((result) => {
        expect(result).toHaveLength(44)
    })
    rpc.getNewAddress({type:"bech32"}).then((result) => {
        expect(result).toHaveLength(44)
    })
    rpc.getNewAddress({type:"p2sh-segwit"}).then((result) => {
        expect(result).toHaveLength(35)
    })
    rpc.getNewAddress({type:"legacy"}).then((result) => {
        expect(result).toHaveLength(34)
    })
    rpc.getNewAddress({label:"test_label"}).then((result) => {
        expect(result).toHaveLength(44)
    })
    rpc.getNewAddress().then((result) => {
        expect(result).toHaveLength(44)
    })
  });

  it('check getBalances', () => {
    rpc.getBalances().then((result) => {
        expect(result.mine).toBeDefined()
        expect(result.mine.trusted).toBeDefined()
        expect(result.mine.immature).toBeDefined()
        expect(result.mine.untrusted_pending).toBeDefined()
        expect(result.mine.used).toBeUndefined()
        expect(result.watchonly).toBeUndefined()
    })
  });

  it('check listWallets', () => {
    rpc.listWallets().then((result) => {
        expect(Array.isArray(result)).toBe(true);
    })
  });

  it('check listLabels', () => {
    rpc.listLabels().then((result) => {
        expect(Array.isArray(result)).toBe(true);
    })
  });
});
