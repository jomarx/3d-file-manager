import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { nativeTheme } from 'electron'
import { DEFAULT_SETTINGS, type Settings } from '@shared/api'

// Preferences live in settings.json next to the catalog, not in the database,
// so they survive a catalog being reset and are easy to read or delete.
let file: string | null = null
let current: Settings = { ...DEFAULT_SETTINGS }

const CHOICES: { [K in keyof Settings]: readonly Settings[K][] } = {
  theme: ['system', 'light', 'dark'],
  viewMode: ['grid', 'list'],
  sort: ['name', 'mtime', 'size', 'type'],
  desc: [false, true]
}

// Keeps the known keys with allowed values; anything else falls back to the default.
export function sanitizeSettings(raw: unknown, base: Settings = DEFAULT_SETTINGS): Settings {
  const out: Record<string, unknown> = { ...base }
  if (typeof raw !== 'object' || raw === null) return out as unknown as Settings
  const record = raw as Record<string, unknown>
  for (const key of Object.keys(CHOICES) as (keyof Settings)[]) {
    const allowed = CHOICES[key] as readonly unknown[]
    if (allowed.includes(record[key])) out[key] = record[key]
  }
  return out as unknown as Settings
}

export function loadSettings(dir: string): Settings {
  file = join(dir, 'settings.json')
  try {
    current = sanitizeSettings(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    current = { ...DEFAULT_SETTINGS }
  }
  nativeTheme.themeSource = current.theme
  return current
}

export function getSettings(): Settings {
  return current
}

export function updateSettings(patch: Partial<Settings>): Settings {
  current = sanitizeSettings(patch, current)
  nativeTheme.themeSource = current.theme
  if (file) {
    // Write then rename, so a crash never leaves a half-written file.
    writeFileSync(`${file}.tmp`, JSON.stringify(current, null, 2))
    renameSync(`${file}.tmp`, file)
  }
  return current
}
