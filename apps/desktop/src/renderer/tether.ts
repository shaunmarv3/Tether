import type { TetherApi } from '../shared/api'

export const tether = (window as unknown as { tether: TetherApi }).tether
