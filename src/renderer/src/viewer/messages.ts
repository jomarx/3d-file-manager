import type { ParsedModel } from '@shared/model'

// Messages between useModel and the parse worker.

export interface ParseRequest {
  url: string
  ext: string
  size: number
}

export type ParseMessage =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'parsing' }
  | { type: 'done'; model: ParsedModel }
  // unavailable: the file couldn't be read (missing, offline drive), as
  // opposed to read but not understood.
  | { type: 'error'; message: string; unavailable: boolean }
