import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Slicers 3FM looks for in the usual install folders.
export interface KnownApp {
  name: string
  // Relative to a Program Files root. A segment with "*" matches versioned
  // folders such as "UltiMaker Cura 5.10.2"; the newest version wins.
  paths: string[]
  // Extensions it can open; omitted means every cataloged type.
  exts?: string[]
}

export const KNOWN_APPS: KnownApp[] = [
  { name: 'Bambu Studio', paths: ['Bambu Studio/bambu-studio.exe'] },
  { name: 'OrcaSlicer', paths: ['OrcaSlicer/orca-slicer.exe'] },
  { name: 'PrusaSlicer', paths: ['Prusa3D/PrusaSlicer/prusa-slicer.exe'] },
  {
    name: 'PrusaSlicer G-code Viewer',
    paths: ['Prusa3D/PrusaSlicer/prusa-gcodeviewer.exe'],
    exts: ['gcode']
  },
  { name: 'UltiMaker Cura', paths: ['UltiMaker Cura */UltiMaker-Cura.exe', 'Ultimaker Cura */Cura.exe'] },
  { name: 'SuperSlicer', paths: ['SuperSlicer/superslicer.exe'] },
  {
    name: 'Creality Print',
    paths: ['Creality Print */CrealityPrint.exe', 'Creality/Creality Print */CrealityPrint.exe']
  }
]

export interface DetectedApp {
  name: string
  exePath: string
  exts: string[] | null
}

export interface DetectFs {
  exists(path: string): boolean
  // Directory entry names; empty when the directory can't be read.
  list(dir: string): string[]
}

const realFs: DetectFs = {
  exists: existsSync,
  list: (dir) => {
    try {
      return readdirSync(dir)
    } catch {
      return []
    }
  }
}

export function installRoots(env: NodeJS.ProcessEnv = process.env): string[] {
  const roots = [
    env.ProgramW6432,
    env.ProgramFiles,
    env['ProgramFiles(x86)'],
    env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Programs')
  ].filter((r): r is string => !!r)
  const seen = new Set<string>()
  return roots.filter((r) => !seen.has(r.toLowerCase()) && seen.add(r.toLowerCase()))
}

const byVersionDesc = (a: string, b: string): number =>
  b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' })

// Expands "*" segments against the disk, newest version first.
function resolve(root: string, segments: string[], fs: DetectFs): string | null {
  if (segments.length === 0) return fs.exists(root) ? root : null
  const [head, ...rest] = segments
  if (!head.includes('*')) return resolve(join(root, head), rest, fs)
  const pattern = new RegExp(
    '^' + head.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$',
    'i'
  )
  const matches = fs.list(root).filter((name) => pattern.test(name)).sort(byVersionDesc)
  for (const name of matches) {
    const found = resolve(join(root, name), rest, fs)
    if (found) return found
  }
  return null
}

export function detectApps(roots = installRoots(), fs: DetectFs = realFs): DetectedApp[] {
  const found: DetectedApp[] = []
  for (const known of KNOWN_APPS) {
    let exePath: string | null = null
    for (const root of roots) {
      for (const p of known.paths) {
        exePath = resolve(root, p.split('/'), fs)
        if (exePath) break
      }
      if (exePath) break
    }
    if (exePath) found.push({ name: known.name, exePath, exts: known.exts ?? null })
  }
  return found
}
