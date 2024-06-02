export class BitcoinJsonRpcError extends Error {
  /**
   * Whether the command executed. true is definiyely yes, false if definitely no, else null
   */
  public readonly executed: boolean | null;

  public data: any;

  constructor(inner: Error & { data?: any }, executed: boolean | null, data?: any) {
    super(inner.message);

    this.executed = executed;
    this.data = Object.assign(
      {},
      inner.data,
      {
        bitcoinJsonRpc: {
          executed,
        },
      },
      data
    );
  }
}
