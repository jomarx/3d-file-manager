import type { FileType } from '@shared/api'

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export function formatDate(ms: number, withTime = false): string {
  return (withTime ? dateTimeFormat : dateFormat).format(ms)
}

// SQLite's datetime('now'), "YYYY-MM-DD HH:MM:SS" in UTC, as milliseconds.
export const parseSqlDate = (value: string): number => Date.parse(value.replace(' ', 'T') + 'Z')

export const numberFormat = new Intl.NumberFormat()

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${Math.round(seconds)}s`
}

// 12.3 → "12.3", 120 → "120", 0.25 → "0.25"
export function formatMm(value: number): string {
  return value.toFixed(value < 1 ? 2 : 1).replace(/\.0+$/, '')
}

export const TYPE_LABEL: Record<FileType, string> = { stl: 'STL', '3mf': '3MF', gcode: 'G-code' }

// Badge colors per file type (background, text).
export const TYPE_STYLE: Record<FileType, string> = {
  stl: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  '3mf': 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  gcode: 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
}

export function dirname(path: string, name: string): string {
  return path.slice(0, path.length - name.length).replace(/[\\/]$/, '')
}
