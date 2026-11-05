import { parseGcode, parseGcode3mf } from './gcode'
import { parseStl } from './stl'
import { parse3mf } from './threemf'
import { ModelError, type ParsedModel } from './types'

export * from './types'

// Parses a catalog file by its extension (as stored in files.ext).
export function parseModel(bytes: Uint8Array, ext: string): ParsedModel {
  switch (ext) {
    case 'stl':
      return parseStl(bytes)
    case '3mf':
      return parse3mf(bytes)
    case 'gcode':
      return parseGcode(new TextDecoder().decode(bytes))
    case 'gcode.3mf':
      return parseGcode3mf(bytes)
    default:
      throw new ModelError(`No previewer for .${ext} files.`)
  }
}
