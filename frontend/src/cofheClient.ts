import { createCofheClient, createCofheConfig } from '@cofhe/sdk/web'
import { arbSepolia } from '@cofhe/sdk/chains'

const config = createCofheConfig({
  supportedChains: [arbSepolia],
})

export const cofheClient = createCofheClient(config)
