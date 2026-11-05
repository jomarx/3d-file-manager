import type { ThreeFmApi } from '@shared/api'

declare global {
  interface Window {
    api: ThreeFmApi
  }
}

export {}
