import { strFromU8, unzipSync, type Unzipped } from 'fflate'
import { MeshBuilder } from './mesh'
import { ModelError, type ModelInfo, type ParsedModel } from './types'

// 3MF is a zip with XML models. The root model's <build> lists items that
// reference objects; objects hold a mesh or components pointing at other
// objects, possibly in other model files (Bambu/Orca put each object in
// 3D/Objects/*.model). Transforms are 3x4 affine matrices for row vectors.

type Matrix = number[] // m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32

const IDENTITY: Matrix = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]

const UNIT_MM: Record<string, number> = {
  micron: 0.001,
  millimeter: 1,
  centimeter: 10,
  inch: 25.4,
  foot: 304.8,
  meter: 1000
}

interface Component {
  key: string
  transform: Matrix
}

interface ModelObject {
  name?: string
  vertices?: Float64Array
  triangles?: Uint32Array
  components: Component[]
}

export function unzip3mf(bytes: Uint8Array, keep: (name: string) => boolean): Unzipped {
  try {
    return unzipSync(bytes, { filter: (f) => keep(f.name) })
  } catch {
    throw new ModelError('Not a valid 3MF file (it is not a zip archive).')
  }
}

const isImage = (name: string) => /^(Metadata|Auxiliaries)\/.*\.(png|jpe?g)$/i.test(name)

export function parse3mf(bytes: Uint8Array): ParsedModel {
  const files = unzip3mf(bytes, (n) => /\.model$/i.test(n) || n === '_rels/.rels' || isImage(n))
  const rels = files['_rels/.rels'] ? strFromU8(files['_rels/.rels']) : ''
  const rootPath = normalize(relTarget(rels, '3dmodel') ?? '3D/3dmodel.model')
  const rootBytes = files[rootPath]
  if (!rootBytes) throw new ModelError('This 3MF file has no 3D model.')
  const root = strFromU8(rootBytes)
  const scale = UNIT_MM[attr(/<model\b[^>]*>/.exec(root)?.[0] ?? '', 'unit') ?? 'millimeter'] ?? 1

  const objects = new Map<string, ModelObject>()
  const loaded = new Set<string>()
  const load = (path: string, xml: string) => {
    loaded.add(path)
    for (const [id, obj] of readObjects(xml, path)) objects.set(`${path}#${id}`, obj)
  }
  load(rootPath, root)
  // Load other model files lazily, only when a component points at them.
  const ensure = (key: string) => {
    const path = key.slice(0, key.lastIndexOf('#'))
    if (!loaded.has(path) && files[path]) load(path, strFromU8(files[path]))
  }

  const mesh = new MeshBuilder()
  const names: string[] = []
  const emit = (key: string, m: Matrix, depth: number) => {
    ensure(key)
    const obj = objects.get(key)
    if (!obj || depth > 16) return
    if (obj.vertices && obj.triangles) addMesh(mesh, obj.vertices, obj.triangles, m)
    for (const c of obj.components) emit(c.key, multiply(c.transform, m), depth + 1)
  }

  const base: Matrix = scale === 1 ? IDENTITY : [scale, 0, 0, 0, scale, 0, 0, 0, scale, 0, 0, 0]
  const build = /<build\b[^>]*>([\s\S]*?)<\/build>/.exec(root)?.[1] ?? ''
  for (const item of build.matchAll(/<item\b([^>]*?)\/?>/g)) {
    if (attr(item[1], 'printable') === '0') continue
    const key = `${normalize(attr(item[1], 'p:path') ?? rootPath)}#${attr(item[1], 'objectid')}`
    mesh.startPart()
    const before = mesh.triangles
    emit(key, multiply(parseMatrix(attr(item[1], 'transform')), base), 0)
    const name = objects.get(key)?.name
    if (mesh.triangles > before && name) names.push(name)
  }
  if (mesh.triangles === 0) throw new ModelError('This 3MF file has no printable objects.')

  const info: ModelInfo = { ...readMetadata(root) }
  if (names.length > 0) info.objects = names
  return { geometry: mesh.build(), info, thumbnail: pickThumbnail(files, rels) }
}

function readObjects(xml: string, path: string): Map<string, ModelObject> {
  const out = new Map<string, ModelObject>()
  for (const m of xml.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/g)) {
    const id = attr(m[1], 'id')
    if (!id) continue
    const body = m[2]
    const obj: ModelObject = { name: attr(m[1], 'name'), components: [] }
    if (body.includes('<mesh')) {
      obj.vertices = readVertices(body)
      obj.triangles = readTriangles(body)
    }
    for (const c of body.matchAll(/<component\b([^>]*?)\/?>/g)) {
      obj.components.push({
        key: `${normalize(attr(c[1], 'p:path') ?? path)}#${attr(c[1], 'objectid')}`,
        transform: parseMatrix(attr(c[1], 'transform'))
      })
    }
    out.set(id, obj)
  }
  return out
}

function readVertices(body: string): Float64Array {
  const values: number[] = []
  for (const v of body.matchAll(/<vertex\b([^>]*?)\/?>/g)) {
    let x = 0, y = 0, z = 0
    for (const a of v[1].matchAll(/\b([xyz])\s*=\s*"([^"]*)"/g)) {
      if (a[1] === 'x') x = +a[2]
      else if (a[1] === 'y') y = +a[2]
      else z = +a[2]
    }
    values.push(x, y, z)
  }
  return Float64Array.from(values)
}

function readTriangles(body: string): Uint32Array {
  const values: number[] = []
  for (const t of body.matchAll(/<triangle\b([^>]*?)\/?>/g)) {
    let a = 0, b = 0, c = 0
    for (const v of t[1].matchAll(/\bv([123])\s*=\s*"(\d+)"/g)) {
      if (v[1] === '1') a = +v[2]
      else if (v[1] === '2') b = +v[2]
      else c = +v[2]
    }
    values.push(a, b, c)
  }
  return Uint32Array.from(values)
}

function addMesh(mesh: MeshBuilder, v: Float64Array, t: Uint32Array, m: Matrix): void {
  const p = new Float64Array(v.length)
  for (let i = 0; i < v.length; i += 3) {
    const x = v[i], y = v[i + 1], z = v[i + 2]
    p[i] = x * m[0] + y * m[3] + z * m[6] + m[9]
    p[i + 1] = x * m[1] + y * m[4] + z * m[7] + m[10]
    p[i + 2] = x * m[2] + y * m[5] + z * m[8] + m[11]
  }
  // A mirroring transform flips the winding; swap two corners to keep normals outward.
  const det =
    m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6])
  const count = v.length / 3
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i], b = det < 0 ? t[i + 2] : t[i + 1], c = det < 0 ? t[i + 1] : t[i + 2]
    if (a >= count || b >= count || c >= count) continue
    mesh.triangle(
      p[a * 3], p[a * 3 + 1], p[a * 3 + 2],
      p[b * 3], p[b * 3 + 1], p[b * 3 + 2],
      p[c * 3], p[c * 3 + 1], p[c * 3 + 2]
    )
  }
}

// a then b: p·(a·b) = (p·a)·b
function multiply(a: Matrix, b: Matrix): Matrix {
  const r = new Array<number>(12)
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 3; col++) {
      r[row * 3 + col] =
        a[row * 3] * b[col] + a[row * 3 + 1] * b[3 + col] + a[row * 3 + 2] * b[6 + col] + (row === 3 ? b[9 + col] : 0)
    }
  }
  return r
}

function parseMatrix(value: string | undefined): Matrix {
  if (!value) return IDENTITY
  const n = value.trim().split(/\s+/).map(Number)
  return n.length === 12 && n.every(Number.isFinite) ? n : IDENTITY
}

function readMetadata(root: string): ModelInfo {
  const info: ModelInfo = {}
  for (const m of root.matchAll(/<metadata\b([^>]*)>([\s\S]*?)<\/metadata>/g)) {
    const value = decodeXml(m[2]).trim()
    if (!value) continue
    const name = attr(m[1], 'name')?.replace(/^.*:/, '').toLowerCase()
    if (name === 'title') info.title = value
    else if (name === 'designer') info.designer = value
    else if (name === 'application') info.application = value
  }
  return info
}

function pickThumbnail(files: Unzipped, rels: string): ParsedModel['thumbnail'] {
  const declared = relTarget(rels, 'thumbnail')
  const candidates = [
    declared && normalize(declared),
    'Metadata/plate_1.png',
    'Metadata/thumbnail.png',
    'Auxiliaries/.thumbnails/thumbnail_middle.png',
    ...Object.keys(files).filter(isImage)
  ]
  for (const name of candidates) {
    if (name && files[name]?.length) {
      return { mime: /\.png$/i.test(name) ? 'image/png' : 'image/jpeg', data: files[name] }
    }
  }
  return undefined
}

// Target of the first relationship whose Type ends with `/<type>`.
function relTarget(rels: string, type: string): string | undefined {
  for (const r of rels.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    if (attr(r[1], 'Type')?.toLowerCase().endsWith('/' + type)) return attr(r[1], 'Target')
  }
  return undefined
}

export function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|\\s)${name.replace(':', '\\:')}\\s*=\\s*"([^"]*)"`).exec(tag)
  return m ? decodeXml(m[1]) : undefined
}

const normalize = (path: string) => decodeURIComponent(path.replace(/^\/+/, ''))

function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const k = e.toLowerCase()
    if (k[0] === '#') return String.fromCodePoint(k[1] === 'x' ? parseInt(k.slice(2), 16) : +k.slice(1))
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[k] ?? ''
  })
}
