import type { AppsState, ExternalApp, FileItem } from '@shared/api'

export const EMPTY_APPS: AppsState = { apps: [], defaults: {} }

// Types the default-app settings cover, by extension.
export const OPEN_TYPES: { ext: string; label: string }[] = [
  { ext: 'stl', label: 'STL' },
  { ext: '3mf', label: '3MF' },
  { ext: 'gcode', label: 'G-code' },
  { ext: 'gcode.3mf', label: 'Sliced 3MF (.gcode.3mf)' }
]

export function handles(app: ExternalApp, ext: string): boolean {
  return app.exts === null || app.exts.includes(ext)
}

// Apps that can open every one of these files.
export function appsFor(state: AppsState, files: FileItem[]): ExternalApp[] {
  const exts = new Set(files.map((f) => f.ext))
  return state.apps.filter((a) => [...exts].every((e) => handles(a, e)))
}

// The app files open in by default, when they all go to the same one; null
// for the Windows default program, undefined when it differs between files.
export function defaultApp(state: AppsState, files: FileItem[]): ExternalApp | null | undefined {
  const ids = new Set(files.map((f) => state.defaults[f.ext] ?? null))
  if (ids.size !== 1) return undefined
  const [id] = ids
  return id === null ? null : (state.apps.find((a) => a.id === id) ?? null)
}
