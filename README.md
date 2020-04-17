# bitcoin-json-rpc

Bitcoin JSON RPC for TypeScript with Response Type Enforcement

## Installing

`npm install bitcoin-json-rpc`

## Example usage

```typescript
import BitcoinJsonRpc from 'bitcoin-json-rpc';

const rpc = new BitcoinJsonRpc('http://localhost:8332');

const balance = await rpc.getBalance();
console.log(balance);
```

## Non-standard methods

Methods not exposed by Bitcoin Core, such as `omni_getwalletaddressbalances`
or Liquid's `getbalance` are prefixed i.e. `getLiquidBalanceForAsset`.

## Motivation

There are plenty of Bitcoin forks, including Omni, Zcash, and Blockstream Liquid.
These forks often introduce breaking changes to the JSON RPC responses that
are not reflected in their documentation.

This library provides TypeScript types for RPC commands and validates the responses
using `io-ts`. If the response does not match the schema, an error is thrown.

## Author

Andreas Brekken

## License

MIT
