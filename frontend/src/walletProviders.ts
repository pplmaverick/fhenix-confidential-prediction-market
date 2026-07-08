// OKX Wallet claims window.ethereum and sets isMetaMask: true to impersonate
// MetaMask (see docs/bug-reports/okx-cofhe-permit.md on debug/okx-permit-logging).
// OKX does not implement EIP-5749's `providers` array, so when both wallets are
// installed, wagmi's default injected() connector (matched via window.ethereum)
// silently binds to OKX's provider instead of the real MetaMask one. These
// helpers explicitly reject any provider carrying an OKX identity flag.

function isOkxFlagged(provider: any): boolean {
  return !!(provider?.isOkxWallet || provider?.isOKExWallet)
}

/** Resolves the genuine MetaMask provider, rejecting any OKX impersonator. */
export function pickMetaMaskProvider(window: any): any {
  const eth = window?.ethereum
  if (!eth) return undefined
  // Some multi-wallet setups expose an EIP-5749 `providers` array; prefer it
  // when present so a real MetaMask sitting alongside other wallets is found.
  const candidates = Array.isArray(eth.providers) && eth.providers.length > 0 ? eth.providers : [eth]
  return candidates.find((p: any) => p?.isMetaMask && !isOkxFlagged(p))
}

/** Resolves the OKX Wallet provider via the non-impersonatable window.okxwallet slot. */
export function pickOkxProvider(window: any): any {
  return window?.okxwallet
}
