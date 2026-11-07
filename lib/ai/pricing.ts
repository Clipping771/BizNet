/** Per-token prices of the configured provider. Budget reservations and actual costs must use the same numbers. */
export function aiPricesPerToken(): { in: number; out: number } {
  if (process.env.AI_PROVIDER === "anthropic") {
    // Claude Opus 5.5: $4 / $20 per million tokens
    return { in: 0.000004, out: 0.00002 };
  }
  // Mock provider's nominal prices
  return { in: 0.00000015, out: 0.0000006 };
}

/** Output ceilings. Thinking counts toward them, so they must leave room for the answer too. */
export const AI_MAX_OUTPUT_TOKENS = 2500;
export const AI_INPUT_TOKENS_UPPER_BOUND = 4000;
