const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Resolve the operator wallet at request time so local/tunnel builds never bake a stale fallback. */
export function donationRedirectLocation(
  address: string | undefined,
  treasuryFallback?: string,
): string | null {
  const normalized = String(address || treasuryFallback || '').trim();
  return SOLANA_ADDRESS.test(normalized) ? `https://solscan.io/account/${normalized}` : null;
}
