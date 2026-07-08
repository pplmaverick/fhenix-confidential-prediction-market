import type { PublicClient } from 'viem'

/**
 * Estimate EIP-1559 gas fees via the chain's actual fee history, with a 2x
 * buffer on maxFeePerGas to reduce the chance of a stuck tx during spikes.
 * No hardcoded fallback: if the chain doesn't return a field, it's omitted
 * so viem/the wallet can fall back to its own estimation instead of a guess.
 */
export async function estimateGasFees(publicClient: PublicClient) {
  const feeData = await publicClient.estimateFeesPerGas()
  return {
    maxFeePerGas: feeData.maxFeePerGas ? feeData.maxFeePerGas * 2n : undefined,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? undefined,
  }
}
