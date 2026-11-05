import { basename } from 'node:path'
import type { AddAppResult, AppsState, ExternalApp } from '@shared/api'
import { KNOWN_APPS, type DetectedApp } from '../apps/detect'
import { getDb } from './index'

interface AppRow {
  id: number
  name: string
  exe_path: string
  args_template: string
  auto_detected: number
}

export interface LaunchApp extends ExternalApp {
  argsTemplate: string
}

const KNOWN_EXTS = new Map(KNOWN_APPS.map((a) => [a.name, a.exts ?? null]))

function toApp(row: AppRow): LaunchApp {
  return {
    id: row.id,
    name: row.name,
    exePath: row.exe_path,
    autoDetected: row.auto_detected === 1,
    exts: row.auto_detected === 1 ? (KNOWN_EXTS.get(row.name) ?? null) : null,
    argsTemplate: row.args_template
  }
}

export function getApp(id: number): LaunchApp | undefined {
  const row = getDb().prepare('SELECT * FROM apps WHERE id = ?').get(id) as AppRow | undefined
  return row && toApp(row)
}

export function appsState(): AppsState {
  const db = getDb()
  const apps = (db.prepare('SELECT * FROM apps ORDER BY name COLLATE NOCASE').all() as AppRow[]).map(
    (row): ExternalApp => {
      const { argsTemplate: _, ...app } = toApp(row)
      return app
    }
  )
  const defaults: Record<string, number> = {}
  for (const d of db.prepare('SELECT ext, app_id FROM ext_defaults').all() as { ext: string; app_id: number }[]) {
    defaults[d.ext] = d.app_id
  }
  return { apps, defaults }
}

// Brings auto-detected rows in line with what is installed now. Rows are
// matched by name, so a new Cura version updates the path and keeps defaults.
export function syncDetectedApps(found: DetectedApp[]): AppsState {
  const db = getDb()
  db.transaction(() => {
    const existing = db.prepare('SELECT * FROM apps WHERE auto_detected = 1').all() as AppRow[]
    const byName = new Map(existing.map((r) => [r.name, r]))
    for (const app of found) {
      const row = byName.get(app.name)
      byName.delete(app.name)
      // A user-added entry for the same program wins over detection.
      const taken = db
        .prepare('SELECT id FROM apps WHERE exe_path = ? AND auto_detected = 0')
        .get(app.exePath)
      if (taken) {
        if (row) db.prepare('DELETE FROM apps WHERE id = ?').run(row.id)
        continue
      }
      if (row) {
        if (row.exe_path !== app.exePath) {
          db.prepare('UPDATE apps SET exe_path = ? WHERE id = ?').run(app.exePath, row.id)
        }
      } else {
        db.prepare('INSERT INTO apps (name, exe_path, auto_detected) VALUES (?, ?, 1)').run(
          app.name,
          app.exePath
        )
      }
    }
    // Uninstalled since the last check.
    for (const gone of byName.values()) db.prepare('DELETE FROM apps WHERE id = ?').run(gone.id)
  })()
  return appsState()
}

export function addApp(exePath: string): AddAppResult {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM apps WHERE exe_path = ?').get(exePath) as AppRow | undefined
  if (existing && existing.auto_detected === 0) {
    return { ok: false, reason: 'duplicate', message: `${existing.name} is already in the list.` }
  }
  const name = basename(exePath).replace(/\.exe$/i, '')
  db.transaction(() => {
    // Adding a detected program by hand makes it a user entry (keeps its id and defaults).
    if (existing) db.prepare('UPDATE apps SET auto_detected = 0 WHERE id = ?').run(existing.id)
    else db.prepare('INSERT INTO apps (name, exe_path) VALUES (?, ?)').run(name, exePath)
  })()
  return { ok: true, state: appsState() }
}

// Only apps the user added can be removed; detected ones come back on the next check.
export function removeApp(id: number): AppsState {
  getDb().prepare('DELETE FROM apps WHERE id = ? AND auto_detected = 0').run(id)
  return appsState()
}

export function setDefaultApp(ext: string, appId: number | null): AppsState {
  const db = getDb()
  if (appId === null) db.prepare('DELETE FROM ext_defaults WHERE ext = ?').run(ext)
  else {
    db.prepare(
      'INSERT INTO ext_defaults (ext, app_id) VALUES (?, ?) ON CONFLICT(ext) DO UPDATE SET app_id = excluded.app_id'
    ).run(ext, appId)
  }
  return appsState()
}

export function defaultAppFor(ext: string): LaunchApp | undefined {
  const row = getDb()
    .prepare('SELECT a.* FROM ext_defaults d JOIN apps a ON a.id = d.app_id WHERE d.ext = ?')
    .get(ext) as AppRow | undefined
  return row && toApp(row)
}
