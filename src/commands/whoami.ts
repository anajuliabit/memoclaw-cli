/**
 * whoami command: display the wallet address for the current config
 */

import type { ParsedArgs } from '../args.js';
import { getAccount } from '../auth.js';
import { outputJson, out, outputWrite } from '../output.js';

export async function cmdWhoami(opts: ParsedArgs) {
  const account = getAccount();
  if (outputJson) {
    out({ address: account.address });
  } else {
    outputWrite(account.address);
  }
}
