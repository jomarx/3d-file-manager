import { MeshBuilder } from './mesh'
import { ModelError, type ParsedModel } from './types'

// STL comes in two flavours: binary (80-byte header, count, 50 bytes per
// triangle) and ASCII ("solid … facet … vertex x y z"). Some binary files also
// start with "solid", so the size check decides first.

export function parseStl(bytes: Uint8Array): ParsedModel {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.byteLength >= 84) {
    const count = view.getUint32(80, true)
    if (84 + count * 50 === bytes.byteLength) return parseBinary(view, count)
  }
  const head = new TextDecoder().decode(bytes.subarray(0, 256)).trimStart()
  if (head.startsWith('solid')) return parseAscii(new TextDecoder().decode(bytes))
  if (bytes.byteLength >= 84) {
    // Truncated or padded binary file: read whatever whole triangles are there.
    const count = Math.min(view.getUint32(80, true), Math.floor((bytes.byteLength - 84) / 50))
    if (count > 0) return parseBinary(view, count)
  }
  throw new ModelError('Not a valid STL file.')
}

function parseBinary(view: DataView, count: number): ParsedModel {
  const mesh = new MeshBuilder()
  for (let i = 0, o = 84 + 12; i < count; i++, o += 50) {
    const f = (k: number) => view.getFloat32(o + k * 4, true)
    mesh.triangle(f(0), f(1), f(2), f(3), f(4), f(5), f(6), f(7), f(8))
  }
  return { geometry: mesh.build(), info: {} }
}

function parseAscii(text: string): ParsedModel {
  const mesh = new MeshBuilder()
  // "solid" starts a new part (multi-solid files); "endsolid" has no word break so never matches.
  const token = /\b(?:(solid)\b|vertex\s+(\S+)\s+(\S+)\s+(\S+))/g
  const v: number[] = []
  let m: RegExpExecArray | null
  while ((m = token.exec(text))) {
    if (m[1]) {
      mesh.startPart()
      v.length = 0
      continue
    }
    v.push(+m[2], +m[3], +m[4])
    if (v.length === 9) {
      mesh.triangle(v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8])
      v.length = 0
    }
  }
  if (mesh.triangles === 0) throw new ModelError('This STL file has no triangles.')
  const name = /^\s*solid[ \t]+(.+)$/m.exec(text)?.[1].trim()
  return { geometry: mesh.build(), info: name ? { title: name } : {} }
}
