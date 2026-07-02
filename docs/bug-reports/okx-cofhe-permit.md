# OKX Wallet overrides window.ethereum and breaks CoFHE permit signing

## Environment

- **@cofhe/sdk**: `0.6.0`
- **@cofhe/hardhat-plugin**: `0.6.0`
- **@fhenixprotocol/cofhe-contracts**: `0.1.4`
- **Wallet connector**: wagmi `injected()` (two instances: default target for MetaMask, custom target for OKX Wallet via `window.okxwallet`)
- **Browser**: Chrome, with both MetaMask and OKX Wallet extensions installed simultaneously
- **Frontend build tested**: production build served via `vite preview` on `localhost:4173`
- **Chain**: Arbitrum Sepolia

## Symptom

When a user has both MetaMask and OKX Wallet installed, connecting the wallet and initializing CoFHE (`cofheClient.connect()` followed by `cofheClient.permits.getOrCreateSelfPermit()`) results in the `eth_signTypedData_v4` permit signing request failing or being routed to the wrong wallet extension. The user intends to sign with MetaMask, but the request is intercepted by the OKX Wallet provider instead, and the CoFHE permit flow does not complete as expected.

## Root Cause

OKX Wallet overrides `window.ethereum` (an EIP-1193 provider injection race condition). On top of that, OKX Wallet sets `isMetaMask: true` on its injected provider, disguising itself as MetaMask.

When both wallets are installed:
1. OKX Wallet wins the race to claim `window.ethereum` and impersonates MetaMask by setting `isMetaMask: true`.
2. wagmi's default `injected()` connector (intended for MetaMask, matched via `window.ethereum`) actually resolves to the OKX Wallet provider instead of the real MetaMask provider.
3. The CoFHE SDK's `eth_signTypedData_v4` permit signing call is issued against this OKX-controlled `window.ethereum`, where it fails.
4. `window.ethereum.providers` is `undefined`, confirming that OKX Wallet does not implement EIP-5749 (the multi-injected-provider discovery array). Without this array, there is no standard mechanism to enumerate and select the real MetaMask provider — MetaMask is fully shadowed by OKX Wallet.

## Debug Evidence

Captured via debug logging added to `wagmiConfig.ts` / `Navbar.tsx` (OKX connector `provider(window)`) while attempting to connect **MetaMask**, with both wallets installed:

```
[DEBUG] window.ethereum: Proxy(Object) { isOKExWallet: true, isOkxWallet: true, ... }
[DEBUG] window.ethereum.isMetaMask: true
[DEBUG] window.ethereum.isOKExWallet: undefined
[DEBUG] window.okxwallet: Proxy(Object) { isOKExWallet: true, isOkxWallet: true, ... }
[DEBUG] providers list: undefined
```

Key observations:
- `window.ethereum` reports `isOKExWallet: true` / `isOkxWallet: true` — it is objectively the OKX Wallet provider, not MetaMask.
- `window.ethereum.isMetaMask` is `true` despite `window.ethereum` being the OKX provider — this is the impersonation flag.
- Reading `isOKExWallet` directly off `window.ethereum` (as opposed to logging the whole object) returns `undefined`, suggesting inconsistent/partial property exposure through the `Proxy` wrapper depending on access pattern.
- `window.okxwallet` independently exposes the same OKX provider, confirming OKX Wallet also honors the legacy `window.okxwallet` convention.
- `providers.length` is `undefined` — no EIP-5749 `providers` array is present, so there is no standards-based way to distinguish/select between multiple injected wallets from `window.ethereum` alone.

## Reproduction Steps

1. Install both the MetaMask and OKX Wallet browser extensions in Chrome, both unlocked and enabled.
2. Serve the frontend production build (`npm run build && npm run preview`, `localhost:4173`).
3. Open the app and click **Connect Wallet**, selecting the MetaMask option (default `injected()` connector, matched via `window.ethereum`).
4. Approve the connection in the extension popup that appears (this popup may be OKX Wallet rather than MetaMask, depending on injection order).
5. Wait for CoFHE initialization (`cofheClient.connect()` then `cofheClient.permits.getOrCreateSelfPermit()`) to trigger the permit `eth_signTypedData_v4` request.
6. Observe that the signing prompt / result comes from OKX Wallet rather than MetaMask, and/or the permit signing request fails.

## Expected vs Actual Behavior

**Expected**: When the user selects "MetaMask" in the wallet connection UI, the app connects to the actual MetaMask provider, and the CoFHE permit `eth_signTypedData_v4` request is signed via MetaMask.

**Actual**: `window.ethereum` is claimed by OKX Wallet, which also sets `isMetaMask: true`. The "MetaMask" connector (which selects a provider via `window.ethereum` with no further disambiguation) silently binds to the OKX Wallet provider instead. The CoFHE permit signing request is issued against this OKX provider, where it fails.

## Suggested Fix Direction

- **Option A**: In `wagmiConfig.ts`, change the OKX connector's `target.provider(window)` to explicitly resolve `window.okxwallet` (already done for the OKX-labeled connector), and additionally harden the MetaMask connector to explicitly filter for `provider.isMetaMask === true && provider.isOKExWallet !== true && provider.isOkxWallet !== true` rather than trusting `window.ethereum` + `isMetaMask` alone, so OKX's impersonation flag can't win the MetaMask slot.
- **Option B**: Request that the CoFHE SDK (`@cofhe/sdk`) support explicit provider injection (e.g. accepting an EIP-1193 provider instance directly) rather than implicitly relying on `window.ethereum` internally, so the app can pass the exact provider object the user selected instead of whatever the SDK resolves from the global object.
- **Option C**: Add wallet-conflict detection in the frontend: when both `window.okxwallet` and an `isMetaMask`-flagged `window.ethereum` are present simultaneously, and `window.ethereum` also carries OKX identity flags, surface a warning to the user (e.g. "Multiple wallets detected — please disable one of MetaMask/OKX Wallet to avoid signing issues") before attempting to connect.
