import { strFromU8 } from 'fflate'
import { BoundsTracker, Growable } from './growable'
import { attr, unzip3mf } from './threemf'
import { Feature, ModelError, type ModelInfo, type ParsedModel } from './types'

// Reads extrusion moves into line segments grouped by layer, plus the print
// stats slicers write as comments. Handles Bambu Studio / Orca, PrusaSlicer,
// SuperSlicer and Cura conventions.

const ARC_STEP_MM = 1
const MAX_ARC_SEGMENTS = 72

// Layer-change markers: Prusa/Orca ";LAYER_CHANGE", Bambu "; CHANGE_LAYER", Cura ";LAYER:12".
const LAYER_MARK = /^;\s*(?:LAYER_CHANGE|CHANGE_LAYER|LAYER:-?\d+)\s*$/
const FEATURE_MARK = /^;\s*(?:FEATURE|TYPE)\s*:\s*(.+?)\s*$/i
const THUMB_BEGIN = /^;\s*thumbnail(?:_(PNG|JPG|QOI))?\s+begin\s+(\d+)\s*x\s*(\d+)/i
const THUMB_END = /^;\s*thumbnail(?:_(?:PNG|JPG|QOI))?\s+end/i
const KEY_VALUE = /^;\s*([^:=]{2,60}?)\s*[:=]\s*(.*?)\s*$/

const G = 71, M = 77

export function featureOf(name: string): Feature {
  const n = name.toLowerCase()
  if (n.includes('support')) return Feature.Support
  if (n.includes('skirt') || n.includes('brim')) return Feature.SkirtBrim
  if (n.includes('bridge') || n.includes('overhang')) return Feature.Bridge
  if (n.includes('outer') || n.includes('external')) return Feature.OuterWall
  if (n.includes('wall') || n.includes('perimeter')) return Feature.InnerWall
  if (n.includes('top') || n.includes('bottom') || n === 'skin' || n.includes('ironing')) return Feature.TopBottom
  if (n.includes('solid')) return Feature.SolidInfill
  if (n.includes('infill') || n === 'fill') return Feature.Infill
  return Feature.Other
}

export function parseGcode(text: string): ParsedModel {
  return new GcodeReader().read(text)
}

// Bambu's sliced plate: a 3MF holding Metadata/plate_N.gcode and plate_N.png.
export function parseGcode3mf(bytes: Uint8Array): ParsedModel {
  const files = unzip3mf(bytes, (n) =>
    /^Metadata\/(plate_\d+\.(gcode|png)|slice_info\.config)$/i.test(n)
  )
  const gcodeName = Object.keys(files)
    .filter((n) => n.endsWith('.gcode'))
    .sort((a, b) => plateNo(a) - plateNo(b))[0]
  if (!gcodeName) throw new ModelError('This .gcode.3mf has no sliced plate inside.')
  const parsed = parseGcode(strFromU8(files[gcodeName]))
  const png = files[gcodeName.replace(/\.gcode$/, '.png')]
  if (png?.length) parsed.thumbnail = { mime: 'image/png', data: png }
  const slice = files['Metadata/slice_info.config']
  if (slice) fillFromSliceInfo(parsed.info, strFromU8(slice))
  return parsed
}

const plateNo = (name: string) => Number(/plate_(\d+)/.exec(name)?.[1] ?? 0)

function fillFromSliceInfo(info: ModelInfo, xml: string): void {
  const meta = (key: string) => {
    const tag = new RegExp(`<metadata\\b[^>]*\\bkey="${key}"[^>]*>`).exec(xml)?.[0]
    return tag ? attr(tag, 'value') : undefined
  }
  info.printTime ??= toNumber(meta('prediction'))
  info.filamentWeight ??= toNumber(meta('weight'))
  if (!info.filamentType) {
    const types = [...xml.matchAll(/<filament\b[^>]*>/g)].map((m) => attr(m[0], 'type')).filter(Boolean)
    if (types.length) info.filamentType = [...new Set(types)].join(', ')
  }
}

class GcodeReader {
  // Machine state
  private x = 0
  private y = 0
  private z = 0
  private e = 0
  private absolute = true
  private absoluteE = true
  private feature = Feature.Other

  // Output
  private positions = new Growable(Float32Array, 6 * 65536)
  private features = new Growable(Uint8Array, 65536)
  private segments = 0
  private layerEnds: number[] = []
  private layerZ: number[] = []
  private layerPending = false
  private layerMarks = false
  private box = new BoundsTracker()

  // Metadata
  private meta = new Map<string, string>()
  private header: string[] = []
  private nozzleTemp?: number
  private bedTemp?: number
  private thumb: { kind: string; w: number; h: number; lines: string[] } | null = null
  private bestThumb: { kind: string; area: number; base64: string } | null = null

  // Words of the current command, indexed by letter (A=0 … Z=25).
  private words = new Float64Array(26)
  private seen = 0

  read(text: string): ParsedModel {
    let pos = 0
    const n = text.length
    while (pos < n) {
      let end = text.indexOf('\n', pos)
      if (end < 0) end = n
      const line = text.slice(pos, end).trim()
      pos = end + 1
      if (line.length === 0) continue
      if (line.charCodeAt(0) === 59 /* ; */) this.comment(line)
      else this.command(line)
    }
    if (this.segments === 0 && this.meta.size === 0) throw new ModelError('This file has no G-code moves.')
    if (this.layerZ.length > this.layerEnds.length) this.layerEnds.push(this.segments)
    return {
      geometry:
        this.segments === 0
          ? null
          : {
              kind: 'toolpath',
              positions: this.positions.view(),
              features: this.features.view(),
              layerEnds: Uint32Array.from(this.layerEnds),
              layerZ: Float32Array.from(this.layerZ),
              bounds: this.box.bounds()
            },
      info: this.info(),
      thumbnail: this.thumbnail()
    }
  }

  private comment(line: string): void {
    if (this.thumb) {
      if (THUMB_END.test(line)) {
        const t = this.thumb
        this.thumb = null
        const area = t.w * t.h
        if (t.kind !== 'QOI' && (!this.bestThumb || area > this.bestThumb.area)) {
          this.bestThumb = { kind: t.kind, area, base64: t.lines.join('') }
        }
      } else {
        this.thumb.lines.push(line.slice(1).trim())
      }
      return
    }
    if (this.header.length < 40) this.header.push(line)
    if (LAYER_MARK.test(line)) {
      // Extrusion before the first marker is start G-code (purge lines along the bed
      // edge); drop it so it neither counts as a layer nor stretches the bounds.
      if (!this.layerMarks) this.resetToolpath()
      this.layerMarks = true
      this.layerPending = true
      return
    }
    const feature = FEATURE_MARK.exec(line)
    if (feature) {
      this.feature = featureOf(feature[1])
      return
    }
    const thumb = THUMB_BEGIN.exec(line)
    if (thumb) {
      this.thumb = { kind: (thumb[1] ?? 'PNG').toUpperCase(), w: +thumb[2], h: +thumb[3], lines: [] }
      return
    }
    // Bambu packs two values on one line: "; model printing time: 1h 2m; total estimated time: 1h 9m"
    const total = /total estimated time\s*:\s*([^;]+)/i.exec(line)
    if (total) this.setMeta('total estimated time', total[1].trim())
    const kv = KEY_VALUE.exec(line)
    if (kv) this.setMeta(kv[1], kv[2])
  }

  private setMeta(key: string, value: string): void {
    const k = key.trim().toLowerCase()
    if (!this.meta.has(k)) this.meta.set(k, value.replace(/^"(.*)"$/, '$1'))
  }

  private command(raw: string): void {
    const semi = raw.indexOf(';')
    const line = semi >= 0 ? raw.slice(0, semi) : raw
    const code = this.parseWords(line)
    if (code < 0) return
    const letter = Math.floor(code / 1000)
    const num = code % 1000
    if (letter === G) {
      if (num === 0 || num === 1) this.move()
      else if (num === 2 || num === 3) this.arc(num === 2)
      else if (num === 90) this.absolute = this.absoluteE = true
      else if (num === 91) this.absolute = this.absoluteE = false
      else if (num === 92) this.setPosition()
      else if (num === 28) this.home()
    } else if (letter === M) {
      if (num === 82) this.absoluteE = true
      else if (num === 83) this.absoluteE = false
      else if ((num === 104 || num === 109) && this.nozzleTemp === undefined && this.word('S') > 0) {
        this.nozzleTemp = this.word('S')
      } else if ((num === 140 || num === 190) && this.bedTemp === undefined && this.word('S') > 0) {
        this.bedTemp = this.word('S')
      }
    }
  }

  // Parses "G1 X10 Y-2.5 E.4" (spaces optional). Returns letter*1000 + number, or -1.
  private parseWords(line: string): number {
    this.seen = 0
    let code = -1
    let i = 0
    const n = line.length
    while (i < n) {
      let c = line.charCodeAt(i)
      if (c >= 97 && c <= 122) c -= 32
      if (c < 65 || c > 90) {
        i++
        continue
      }
      let j = i + 1
      while (j < n) {
        const d = line.charCodeAt(j)
        if ((d >= 48 && d <= 57) || d === 46 || d === 45 || d === 43 || d === 32) j++
        else break
      }
      const digits = line.slice(i + 1, j).replace(/ /g, '')
      const value = digits === '' ? NaN : Number(digits)
      if (code < 0) {
        if (!Number.isInteger(value) || value < 0 || value >= 1000) return -1
        code = c * 1000 + value
      } else if (!Number.isNaN(value)) {
        this.words[c - 65] = value
        this.seen |= 1 << (c - 65)
      }
      i = j
    }
    return code
  }

  private has(letter: string): boolean {
    return (this.seen & (1 << (letter.charCodeAt(0) - 65))) !== 0
  }

  private word(letter: string): number {
    return this.has(letter) ? this.words[letter.charCodeAt(0) - 65] : NaN
  }

  private target(axis: 'X' | 'Y' | 'Z', current: number): number {
    if (!this.has(axis)) return current
    return this.absolute ? this.word(axis) : current + this.word(axis)
  }

  // Extrusion amount of this move, updating E.
  private extrude(): number {
    if (!this.has('E')) return 0
    const value = this.word('E')
    const delta = this.absoluteE ? value - this.e : value
    this.e = this.absoluteE ? value : this.e + value
    return delta
  }

  private move(): void {
    const x = this.target('X', this.x)
    const y = this.target('Y', this.y)
    const z = this.target('Z', this.z)
    const de = this.extrude()
    if (de > 0 && (x !== this.x || y !== this.y)) {
      this.layerFor(z)
      this.segment(this.x, this.y, this.z, x, y, z)
    }
    this.x = x
    this.y = y
    this.z = z
  }

  private arc(clockwise: boolean): void {
    const x = this.target('X', this.x)
    const y = this.target('Y', this.y)
    const z = this.target('Z', this.z)
    const de = this.extrude()
    const i = this.has('I') ? this.word('I') : 0
    const j = this.has('J') ? this.word('J') : 0
    if (de > 0 && (this.has('I') || this.has('J'))) {
      this.layerFor(z)
      const cx = this.x + i
      const cy = this.y + j
      const r = Math.hypot(i, j)
      const a0 = Math.atan2(this.y - cy, this.x - cx)
      const a1 = Math.atan2(y - cy, x - cx)
      let sweep = clockwise ? a0 - a1 : a1 - a0
      if (sweep <= 1e-9) sweep += Math.PI * 2
      const steps = Math.min(MAX_ARC_SEGMENTS, Math.max(1, Math.ceil((sweep * r) / ARC_STEP_MM)))
      let px = this.x, py = this.y, pz = this.z
      for (let s = 1; s <= steps; s++) {
        const t = s / steps
        const a = a0 + (clockwise ? -sweep : sweep) * t
        const nx = s === steps ? x : cx + r * Math.cos(a)
        const ny = s === steps ? y : cy + r * Math.sin(a)
        const nz = this.z + (z - this.z) * t
        this.segment(px, py, pz, nx, ny, nz)
        px = nx
        py = ny
        pz = nz
      }
    } else if (de > 0 && (x !== this.x || y !== this.y)) {
      // Radius-form arcs (G2 R…) are rare; draw them as a straight line.
      this.layerFor(z)
      this.segment(this.x, this.y, this.z, x, y, z)
    }
    this.x = x
    this.y = y
    this.z = z
  }

  private setPosition(): void {
    if (this.has('X')) this.x = this.word('X')
    if (this.has('Y')) this.y = this.word('Y')
    if (this.has('Z')) this.z = this.word('Z')
    if (this.has('E')) this.e = this.word('E')
  }

  private home(): void {
    const all = !this.has('X') && !this.has('Y') && !this.has('Z')
    if (all || this.has('X')) this.x = 0
    if (all || this.has('Y')) this.y = 0
    if (all || this.has('Z')) this.z = 0
  }

  private resetToolpath(): void {
    this.positions.length = 0
    this.features.length = 0
    this.segments = 0
    this.layerEnds = []
    this.layerZ = []
    this.box = new BoundsTracker()
  }

  // Starts a new layer at a slicer layer marker, or (without markers) whenever
  // extrusion happens at a new height.
  private layerFor(z: number): void {
    const last = this.layerZ.length - 1
    const start = this.layerMarks ? this.layerPending : last < 0 || Math.abs(z - this.layerZ[last]) > 1e-3
    if (!start && last >= 0) return
    this.layerPending = false
    const prevEnd = this.layerEnds.length > 0 ? this.layerEnds[this.layerEnds.length - 1] : 0
    if (last >= 0 && this.segments === prevEnd && this.layerEnds.length === last) {
      // The open layer is still empty; reuse it.
      this.layerZ[last] = z
      return
    }
    if (last >= 0) this.layerEnds.push(this.segments)
    this.layerZ.push(z)
  }

  private segment(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    this.positions.push3(x0, y0, z0)
    this.positions.push3(x1, y1, z1)
    this.features.push(this.feature)
    this.box.add(x0, y0, z0)
    this.box.add(x1, y1, z1)
    this.segments++
  }

  private info(): ModelInfo {
    const get = (...keys: string[]) => {
      for (const k of keys) {
        const v = this.meta.get(k)
        if (v !== undefined && v !== '') return v
      }
      return undefined
    }
    const info: ModelInfo = {}
    info.slicer = slicerName(this.header)
    info.printer = get('printer_settings_id', 'printer_model', 'target_machine.name', 'machine_name')
    info.printTime = parseDuration(
      get('total estimated time', 'estimated printing time (normal mode)', 'estimated printing time', 'time', 'print.time')
    )
    info.filamentLength = sumList(get('filament used [mm]', 'total filament length [mm]'))
    // Cura: ";Filament used: 1.2345m"
    const meters = get('filament used')
    if (info.filamentLength === undefined && meters && /m\s*$/.test(meters)) {
      const m = sumList(meters)
      if (m) info.filamentLength = m * 1000
    }
    info.filamentWeight = sumList(get('filament used [g]', 'total filament weight [g]', 'total filament used [g]'))
    const types = get('filament_type', 'filament type', 'extruder_train.0.material.type', 'material')
    if (types) info.filamentType = [...new Set(types.split(/[;,]/).map((t) => t.trim()).filter(Boolean))].join(', ')
    info.layerHeight = toNumber(get('layer_height', 'layer height'))
    info.layers = toNumber(get('total layer number', 'total layers count', 'layer_count')) ?? (this.layerZ.length || undefined)
    // Start G-code often preheats the nozzle low for probing, so the slicer's setting wins.
    info.nozzleTemp = toNumber(get('nozzle_temperature', 'temperature', 'material_print_temperature')) ?? this.nozzleTemp
    info.bedTemp = this.bedTemp ?? toNumber(get('bed_temperature', 'hot_plate_temp'))
    for (const k of Object.keys(info) as (keyof ModelInfo)[]) if (info[k] === undefined) delete info[k]
    return info
  }

  private thumbnail(): ParsedModel['thumbnail'] {
    if (!this.bestThumb) return undefined
    try {
      const bin = atob(this.bestThumb.base64)
      const data = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i)
      return { mime: this.bestThumb.kind === 'JPG' ? 'image/jpeg' : 'image/png', data }
    } catch {
      return undefined
    }
  }
}

function slicerName(header: string[]): string | undefined {
  for (const line of header) {
    const generated = /generated (?:by|with)\s+(.+?)(?:\s+on\s+\d.*)?$/i.exec(line)
    if (generated) return generated[1].replace(/Cura_SteamEngine/i, 'Cura').trim()
    const named = /^;\s*(BambuStudio|OrcaSlicer|PrusaSlicer|SuperSlicer)\s+v?([\d.]+)/i.exec(line)
    if (named) return `${named[1]} ${named[2]}`
  }
  return undefined
}

export function parseDuration(value: string | undefined): number | undefined {
  if (!value) return undefined
  const v = value.trim()
  if (/^\d+(\.\d+)?$/.test(v)) return Math.round(Number(v))
  const unit: Record<string, number> = { d: 86400, h: 3600, m: 60, s: 1 }
  let total = 0
  let any = false
  for (const m of v.matchAll(/(\d+(?:\.\d+)?)\s*([dhms])\b/gi)) {
    any = true
    total += Number(m[1]) * unit[m[2].toLowerCase()]
  }
  return any ? Math.round(total) : undefined
}

function sumList(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parts = value.split(/[,;]/).map((p) => parseFloat(p)).filter(Number.isFinite)
  if (parts.length === 0) return undefined
  const sum = parts.reduce((a, b) => a + b, 0)
  return sum > 0 ? sum : undefined
}

function toNumber(value: string | undefined): number | undefined {
  if (!value) return undefined
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : undefined
}
