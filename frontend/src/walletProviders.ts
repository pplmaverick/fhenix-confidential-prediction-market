// OKX Wallet claims window.ethereum and sets isMetaMask: true to impersonate
// MetaMask (see docs/bug-reports/okx-cofhe-permit.md on debug/okx-permit-logging).
// OKX does not implement EIP-5749's `providers` array, so when both wallets are
// installed, wagmi's default injected() connector (matched via window.ethereum)
// silently binds to OKX's provider instead of the real MetaMask one.
//
// A direct property read (`provider.isOkxWallet`) is NOT reliable to detect this:
// the bug report found OKX's injected object returns `undefined` for that read
// while still showing `isOkxWallet: true` when the whole object is enumerated
// (e.g. console.log's object preview, `{...provider}`, `JSON.stringify`). This
// points to a Proxy whose `get` trap behaves differently from its
// `ownKeys`/`getOwnPropertyDescriptor` traps. So identity + enumerated-read
// checks are used instead of a plain property access.

function isOkxFlagged(provider: any): boolean {
  if (!provider) return false
  // Enumerate rather than read directly — mirrors how console.log's object
  // preview (which does show the OKX flags) resolves properties, unlike a
  // direct `provider.isOkxWallet` access (which reportedly does not).
  try {
    const enumerated = { ...provider }
    return !!(enumerated.isOkxWallet || enumerated.isOKExWallet)
  } catch {
    return false
  }
}

/** Resolves the genuine MetaMask provider, rejecting any OKX impersonator. */
export function pickMetaMaskProvider(window: any): any {
  const eth = window?.ethereum
  const okx = window?.okxwallet
  if (!eth) return undefined

  // Some multi-wallet setups expose an EIP-5749 `providers` array; prefer it
  // when present so a real MetaMask sitting alongside other wallets is found.
  const candidates = Array.isArray(eth.providers) && eth.providers.length > 0 ? eth.providers : [eth]

  return candidates.find((p: any) => {
    if (!p?.isMetaMask) return false
    // Identity check: if window.ethereum IS the same object as window.okxwallet,
    // it's OKX impersonating MetaMask, regardless of what its own flags claim —
    // this doesn't depend on trusting a Proxy's flaky property reads at all.
    if (okx && p === okx) return false
    return !isOkxFlagged(p)
  })
}

/** Resolves the OKX Wallet provider via the non-impersonatable window.okxwallet slot. */
export function pickOkxProvider(window: any): any {
  return window?.okxwallet
}
