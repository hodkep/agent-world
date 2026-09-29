import type { AwApi } from '../shared/api'

declare global {
  interface Window {
    aw: AwApi
  }
}
