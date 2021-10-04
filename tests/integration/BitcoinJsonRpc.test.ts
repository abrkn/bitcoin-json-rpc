import BitcoinJsonRpc from './../../src/BitcoinJsonRpc';
require('dotenv').config();
const randomstring = require("randomstring");
const fs = require('fs');
const os = require('os');

describe('bitcoin-json-rpc-integration', () => {
    const url = process.env.RPC_PROTOCOL+'://'+process.env.RPC_USERNAME
        +':'+process.env.RPC_PASSWORD
        +'@'+process.env.RPC_HOST
        +':'+process.env.RPC_REGTEST_PORT;
    const rpc = new BitcoinJsonRpc(url);

    describe('Wallet', () => {
        const wallet_name = randomstring.generate(10)
        const options = {
            disable_private_keys: false,
            blank: false,
            passphrase: null,
            avoid_reuse: true,
            descriptors: false,
            load_on_startup: true,
            external_signer: false
        }
        const walletRPC = new BitcoinJsonRpc(url + '/wallet/' + wallet_name)

        it('createwallet: default', async () => {
            await walletRPC.createWallet(wallet_name).then(async (result) => {
                expect(result.name).toBe(wallet_name);
                expect(result.warning).toBe("");
            })
        });

        it('walletpassphrase/lock', async () => {
            const passphrase = randomstring.generate(10)
            const wallet_name = randomstring.generate(10)
            await rpc.createWallet(wallet_name, {passphrase}).then(async () => {
                const walletRPC = new BitcoinJsonRpc(url + '/wallet/' + wallet_name)
                await walletRPC.walletPassphrase(passphrase, 20)
                await walletRPC.walletlock()
            })
        });

        it('getbalances', async () => {
            await walletRPC.getBalances().then(async (result) => {
                expect(result.mine).toBeDefined()
                expect(result.mine.trusted).toBeDefined()
                expect(result.mine.immature).toBeDefined()
                expect(result.mine.untrusted_pending).toBeDefined()
                expect(result.mine.used).toBeUndefined()
                expect(result.watchonly).toBeUndefined()
            })
        });

        it('listwallets', async () => {
            await walletRPC.listWallets().then(async (result) => {
                expect(Array.isArray(result)).toBe(true);
            })
        });

        it('listlabels', async () => {
            await walletRPC.listLabels().then(async (result) => {
                expect(Array.isArray(result)).toBe(true);
            })
        });

        it('loadwallet', async () => {
            const wallet_name = randomstring.generate(10)
            await rpc.createWallet(wallet_name).then(async (result) => {
                await rpc.unloadWallet(result.name, null).then(async (result) => {
                    expect(result.warning).toBe("");
                }).then(async () => {
                    await rpc.loadWallet(result.name, null).then(async (result) => {
                        expect(result.name).toBe(wallet_name);
                        expect(result.warning).toBe("");
                    })
                })
            })
        });

        it('backupwallet', async () => {
            const backupWalletDestination = os.tmpdir() + '/wallet_backup_' + randomstring.generate(10)
            await walletRPC.backupWallet(backupWalletDestination).then(async () => {
                expect(fs.existsSync(backupWalletDestination)).toBe(true)
            })
        });

        it('dumpwallet', async () => {
            const dumpWalletPath = os.tmpdir() + '/wallet_dump_' + randomstring.generate(10)
            await walletRPC.dumpWallet(dumpWalletPath).then(async () => {
                expect(fs.existsSync(dumpWalletPath)).toBe(true)
            })
        });

        it('encryptwallet', async () => {
            const wallet_name = randomstring.generate(10)
            await rpc.createWallet(wallet_name).then(async () => {
                const walletRPC = new BitcoinJsonRpc(url + '/wallet/' + wallet_name)
                await walletRPC.encryptWallet("passphrase").then(async (result) => {
                    expect(result).toContain("wallet encrypted")
                })
            })
        });

        it('importwallet', async () => {
            const dumpWalletPath = os.tmpdir() + '/wallet_dump_' + randomstring.generate(10)
            await walletRPC.dumpWallet(dumpWalletPath)
            await walletRPC.importWallet(dumpWalletPath)
        });

        describe('getnewaddress', () => {
            it('test_label_bech32', async () => {
                await walletRPC.getNewAddress({label: "test_label", type: 'bech32'}).then(async (result) => {
                    expect(result).toHaveLength(44)
                })
            });
            it('bech32', async () => {
                await walletRPC.getNewAddress({type: "bech32"}).then(async (result) => {
                    expect(result).toHaveLength(44)
                })
            });
            it('p2sh-segwit', async () => {
                await walletRPC.getNewAddress({type: "p2sh-segwit"}).then(async (result) => {
                    expect(result).toHaveLength(35)
                })
            });
            it('legacy', async () => {
                await walletRPC.getNewAddress({type: "legacy"}).then(async (result) => {
                    expect(result).toHaveLength(34)
                })
            });
            it('test_label', async () => {
                await walletRPC.getNewAddress({label: "test_label"}).then(async (result) => {
                    expect(result).toHaveLength(44)
                })
            });
            it('default arguments: label="" type=bech32', async () => {
                await walletRPC.getNewAddress().then(async (result) => {
                    expect(result).toHaveLength(44)
                })
            });
        })
    })
});
