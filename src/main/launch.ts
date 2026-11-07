import { randomBytes } from 'node:crypto'
import { statSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { extensionOf, type LaunchTarget } from '@shared/api'
import { fileByPath } from './db/files'

// Files opened from Explorer (a double-click, "Open with" or a drop on the
// shortcut) arrive as command-line arguments, at startup or in a second instance.

let quick: { token: string; path: string } | null = null
let pending: LaunchTarget | null = null

// The model file named on a command line: the last argument that is an existing
// STL, 3MF or G-code file. Flags and the program itself are skipped.
export function modelFileArg(argv: string[], cwd: string): string | null {
  for (let i = argv.length - 1; i >= 1; i--) {
    const arg = argv[i]
    if (arg.startsWith('-') || !extensionOf(arg)) continue
    const path = resolve(cwd, arg)
    try {
      if (statSync(path).isFile()) return path
    } catch {
      // Not there; keep looking.
    }
  }
  return null
}

// A cataloged file opens in the catalog. Anything else opens in the quick view,
// which may then read that one file, and only until the next one is opened.
export function launchTarget(path: string): LaunchTarget | null {
  const cataloged = fileByPath(path)
  if (cataloged && !cataloged.missing) return { kind: 'catalog', file: cataloged }
  const match = extensionOf(path)
  if (!match) return null
  let info
  try {
    info = statSync(path)
  } catch {
    return null
  }
  if (!info.isFile()) return null
  quick = { token: randomBytes(16).toString('hex'), path }
  const file = { token: quick.token, path, name: basename(path), ...match, size: info.size, mtime: Math.floor(info.mtimeMs) }
  return { kind: 'quick', file }
}

// Remembers a file for the window to pick up; returns false when there is nothing to open.
export function queueLaunch(argv: string[], cwd: string): boolean {
  const path = modelFileArg(argv, cwd)
  const target = path ? launchTarget(path) : null
  if (target) pending = target
  return target !== null
}

export function takeLaunch(): LaunchTarget | null {
  const target = pending
  pending = null
  return target
}

// Path of the file in the quick view, if `token` names it.
export function quickPath(token?: string): string | null {
  if (!quick || (token !== undefined && token !== quick.token)) return null
  return quick.path
}
