import BitcoinJsonRpc from './../../src/BitcoinJsonRpc';
require('dotenv').config()
import tempy from 'tempy';
const randomstring = require("randomstring");

describe('bitcoin-json-rpc-integration', () => {
    const url = process.env.RPC_PROTOCOL+'://'+process.env.RPC_USERNAME
        +':'+process.env.RPC_PASSWORD
        +'@'+process.env.RPC_HOST
        +':'+process.env.RPC_REGTEST_PORT;
    const rpc = new BitcoinJsonRpc(url);

    describe('getNewAddress', () => {
        it('test_label_bech32', () => {
            rpc.getNewAddress({label: "test_label", type: 'bech32'}).then((result) => {
                expect(result).toHaveLength(44)
            })
        });
        it('bech32', () => {
            rpc.getNewAddress({type: "bech32"}).then((result) => {
                expect(result).toHaveLength(44)
            })
        });
        it('p2sh-segwit', () => {
            rpc.getNewAddress({type: "p2sh-segwit"}).then((result) => {
                expect(result).toHaveLength(35)
            })
        });
        it('legacy', () => {
            rpc.getNewAddress({type: "legacy"}).then((result) => {
                expect(result).toHaveLength(34)
            })
        });
        it('test_label', () => {
            rpc.getNewAddress({label: "test_label"}).then((result) => {
                expect(result).toHaveLength(44)
            })
        });
        it('default arguments: label="" type=bech32', () => {
            rpc.getNewAddress().then((result) => {
                expect(result).toHaveLength(44)
            })
        });
    })

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

  it('check loadWallet', () => {
    const wallet_name = randomstring.generate(10)
    rpc.createWallet(wallet_name).then((result) => {
        rpc.unloadWallet(result.name, null).then((result) => {
            expect(result.warning).toBe("");
        }).then(() => {
            rpc.loadWallet(result.name, null).then((result) => {
                expect(result.name).toBe(wallet_name);
                expect(result.warning).toBe("");
            })
        })
    })
  });

    describe('Create Wallet', () => {
        const options = {
            disable_private_keys: false,
            blank: false,
            passphrase: null,
            avoid_reuse: true,
            descriptors: false,
            load_on_startup: true,
            external_signer: false
        }

        it('default', () => {
            const wallet_name = randomstring.generate(10)
            rpc.createWallet(wallet_name).then((result) => {
                expect(result.name).toBe(wallet_name);
                expect(result.warning).toBe("");
            })
        });
    })
});
