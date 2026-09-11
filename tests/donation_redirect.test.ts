import { describe, expect, it } from 'vitest';
import { donationRedirectLocation } from '../server/donation_redirect';

describe('donation redirect', () => {
  it('targets the configured Solana account instead of the Solscan home page', () => {
    const address = '7XS54bGgDR7gAB2qvF5kqJzTfKCLo8GjJrYPQn2yA5Md';
    expect(donationRedirectLocation(address)).toBe(`https://solscan.io/account/${address}`);
  });

  it('fails closed when the runtime wallet is missing or malformed', () => {
    expect(donationRedirectLocation(undefined)).toBeNull();
    expect(donationRedirectLocation('not-a-wallet')).toBeNull();
  });

  it('uses the existing test treasury when no dedicated donation wallet is configured', () => {
    const treasury = '7XS54bGgDR7gAB2qvF5kqJzTfKCLo8GjJrYPQn2yA5Md';
    expect(donationRedirectLocation(undefined, treasury)).toBe(
      `https://solscan.io/account/${treasury}`,
    );
  });
});
