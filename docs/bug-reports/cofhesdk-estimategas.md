# Draft GitHub Issue — FhenixProtocol/cofhesdk

Status: draft, not yet submitted.
Target repo: https://github.com/FhenixProtocol/cofhesdk (new issue)

Pre-submission duplicate check (GitHub Search API, `repo:FhenixProtocol/cofhesdk`):
- `estimateGas` → 0 results
- `gas precompile` → 0 results
- `gas limit` → 0 results
- Sanity check (`is:issue`, no keyword filter) → 2 results total in the repo, neither related (#276 OKX/window.ethereum, #272 permit expiry). No duplicate found.

---

## Title

estimateGas underestimates gas for FHE precompile calls

## Body

**Environment**
- `@cofhe/sdk`: `0.6.0` → `0.6.1` (reproduced on both)
- Client: viem `publicClient.estimateGas()` / wagmi `walletClient.writeContract()`
- Chain: Arbitrum Sepolia (421614)
- Contract: Solidity 0.8.28, `@fhenixprotocol/cofhe-contracts`

**Symptom**

For contract functions that perform actual FHE computation (encryption, comparison, selection, addition) via the CoFHE precompile, `publicClient.estimateGas()` returns a gas figure that is too low — transactions built from that estimate revert out-of-gas, even with a generous safety margin on top of the estimate. We originally applied a **+30% buffer** on the `estimateGas()` result and still hit out-of-gas failures; only a **hardcoded 5,000,000 gas limit** made these calls reliable.

**Affected functions (this contract)**

We found a consistent pattern once we compared which functions actually needed the hardcoded override against what each one calls internally:

| Function | FHE calls | Needs 5,000,000 gas override? |
|---|---|---|
| `placeBet` | `FHE.asEuint64`, `FHE.asEbool`, `FHE.allowThis` ×2, `FHE.allowSender` ×2 | Yes |
| `claimWinnings` | `FHE.asEbool`, `FHE.eq`, `FHE.select`, `FHE.allowPublic`, `FHE.allowSender` | Yes |
| `revealWinnerPool` | loop of `FHE.eq` + `FHE.select` + `FHE.add` per bet in the market | Yes (worst case — scales with bet count) |
| `submitWinnerPool` | `FHE.publishDecryptResult` only | No — 500,000 is enough |
| `settleNoWinners` | `FHE.publishDecryptResult` only | No — 500,000 is enough |
| `withdraw` | `FHE.publishDecryptResult` only | No — 500,000 is enough |

The functions that only call `FHE.publishDecryptResult` (verifying a threshold-network signature over an already-decrypted value — no new FHE circuit evaluation) estimate and execute fine. The functions that trigger real FHE computation (`FHE.eq`, `FHE.select`, `FHE.add`, `FHE.asEuint64`/`FHE.asEbool` on fresh inputs) are exactly the ones where `estimateGas()` falls short. This strongly suggests `eth_estimateGas` (or the node/precompile combination it runs against) is not accounting for the actual cost of FHE precompile execution, as opposed to a plain state-changing call of similar EVM-only complexity.

**Why this looks like an SDK/precompile-layer issue, not a contract-layer issue**

- The contract logic itself is unremarkable Solidity — no unbounded loops beyond `revealWinnerPool`'s bet-count scan (which is a separate, known cost driver, not the root cause here), no unusual opcodes outside the FHE library calls.
- The underestimate is specifically correlated with FHE precompile invocations that perform computation (`eq`/`select`/`add`/`asEuint64`/`asEbool`), not increased calldata size, storage writes, or general EVM complexity — functions with equivalent storage-write cost but no FHE computation (`lockMarket`, `submitResult`) estimate correctly with no override needed at all.
- A 30% buffer over the reported estimate — which is normally more than enough headroom for estimation noise on ordinary EVM calls — was still insufficient, implying the estimate itself is off by a large, non-marginal factor rather than being merely conservative.

**Workaround**

We hardcode `gas: 5_000_000n` on `writeContract()` calls for functions that perform FHE computation, and `gas: 500_000n` for functions that only call `FHE.publishDecryptResult`, instead of using `estimateGas()` for either. This is documented in our commit history (`fix: use fixed 5M gas limit for FHE ops (estimateGas underestimates precompile cost)`).

This works, but it means every dApp built on CoFHE has to empirically rediscover this number (or a number like it) per function shape, rather than getting a usable estimate from the standard `eth_estimateGas` flow.

**Suggested improvements**

1. If this is a known limitation of the current precompile/estimation stack, documenting it explicitly (e.g. "do not rely on `estimateGas()` for FHE precompile calls; use a fixed gas limit of at least N per FHE op type") would save other integrators from independently rediscovering this the hard way.
2. Longer term, it would be ideal if `eth_estimateGas` accounted for FHE precompile cost correctly, so callers don't need a hardcoded fallback at all.
3. In the meantime, the SDK could expose a small helper/constant with recommended gas buffers per FHE operation category (e.g. "computation" vs "decrypt-proof-only"), so integrators have an official number to reach for instead of guessing and hardcoding their own.

---

I'm happy to share the specific contract and transaction traces on Arbitrum Sepolia if useful for reproducing this.
