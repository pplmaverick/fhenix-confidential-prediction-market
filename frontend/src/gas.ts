import type { PublicClient } from 'viem'

/**
 * Estimate EIP-1559 gas fees via the chain's actual fee history, with a 3x
 * buffer on maxFeePerGas to reduce the chance of a stuck tx during spikes.
 * A 2x buffer was observed to be insufficient on Arbitrum Sepolia — a
 * placeBet tx was rejected with maxFeePerGas 244944000 < baseFee 306538000,
 * meaning baseFee had moved to ~2.5x the pre-buffer estimate by inclusion time.
 * No hardcoded fallback: if the chain doesn't return a field, it's omitted
 * so viem/the wallet can fall back to its own estimation instead of a guess.
 */
export async function estimateGasFees(publicClient: PublicClient) {
  const feeData = await publicClient.estimateFeesPerGas()
  return {
    maxFeePerGas: feeData.maxFeePerGas ? feeData.maxFeePerGas * 3n : undefined,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? undefined,
  }
}
