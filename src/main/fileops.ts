import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { lstat, rename, stat } from 'node:fs/promises'
import { basename, dirname, join, parse, resolve } from 'node:path'
import { extensionOf, type FileItem, type LocateResult, type OpResult, type RenameResult, type TrashResult } from '@shared/api'
import { defaultAppFor, getApp, type LaunchApp } from './db/apps'
import { deleteFileRows, getFile, getFiles, renameFileRow } from './db/files'
import { moveFileRow } from './db/moves'
import { folderContaining } from './db/repo'

// Opening many files at once is almost always a misclick; slicers take a
// batch in one window, the Windows default opens one window per file.
export const MAX_OPEN_IN_APP = 50
export const MAX_OPEN_SYSTEM = 10

const INVALID_CHARS = /[<>:"/\\|?*\u0000-\u001f]/
const RESERVED_NAMES = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i

const fail = (message: string) => ({ ok: false as const, message })

// Why `name` can't be used as the new name of a file with extension `ext`, or null if it can.
export function checkFileName(name: string, ext: string): string | null {
  if (name.trim() !== name) return "A name can't start or end with a space."
  if (!name.toLowerCase().endsWith('.' + ext.toLowerCase())) return `The name must end in .${ext}.`
  if (name.length === ext.length + 1) return 'Enter a name.'
  if (INVALID_CHARS.test(name)) return 'A name can\'t contain any of these characters: \\ / : * ? " < > |'
  const device = name.split('.')[0]
  if (RESERVED_NAMES.test(device)) return `"${device}" is reserved by Windows.`
  if (name.length > 255) return 'That name is too long.'
  return null
}

function describe(error: unknown): string {
  const code = (error as NodeJS.ErrnoException)?.code
  if (code === 'EBUSY' || code === 'EPERM') return 'The file is open in another program.'
  if (code === 'EACCES') return 'Windows denied access to the file.'
  if (code === 'ENOENT') return 'The file no longer exists.'
  return error instanceof Error ? error.message : String(error)
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch {
    return false
  }
}

export async function renameFile(id: number, name: string): Promise<RenameResult> {
  const file = getFile(id)
  if (!file) return fail('This file is no longer in the catalog.')
  if (file.missing) return fail(`${file.name} is missing from disk.`)
  if (name === file.name) return { ok: true, file }
  const problem = checkFileName(name, file.ext)
  if (problem) return fail(problem)

  const target = join(dirname(file.path), name)
  // Changing only the case is a rename Windows allows onto the "same" path.
  const caseOnly = target.toLowerCase() === file.path.toLowerCase()
  // fs.rename replaces an existing target on Windows, so check first.
  if (!caseOnly && (await exists(target))) return fail(`There is already a file named "${name}" in this folder.`)
  try {
    await rename(file.path, target)
  } catch (error) {
    return fail(describe(error))
  }
  try {
    return { ok: true, file: renameFileRow(id, target, name) }
  } catch (error) {
    await rename(target, file.path).catch(() => undefined)
    return fail(`The catalog could not be updated: ${describe(error)}`)
  }
}

const refuse = (message: string) => ({ ok: false as const, reason: 'refused' as const, message })

// Points a missing file's catalog entry at path, where the user found it.
// The file must be in a cataloged folder, or the next scan would lose it again.
export async function locateFile(id: number, path: string): Promise<LocateResult> {
  const file = getFile(id)
  if (!file) return refuse('This file is no longer in the catalog.')
  if (!file.missing) return refuse(`${file.name} is not missing.`)
  const full = resolve(path)
  const name = basename(full)
  const kind = extensionOf(name)
  if (!kind) return refuse('Pick an STL, 3MF or G-code file.')
  const folder = folderContaining(full)
  if (!folder) return refuse(`${dirname(full)} is not in the catalog. Add its folder, then try again.`)
  let info
  try {
    info = await stat(full)
  } catch (error) {
    return refuse(describe(error))
  }
  moveFileRow(id, { folderId: folder.id, path: full, name, ext: kind.ext, size: info.size, mtime: Math.floor(info.mtimeMs) })
  return { ok: true, file: getFile(id)! }
}

// The closest folder to path that still exists, to start a file picker in.
export function nearestDir(path: string): string | undefined {
  for (let dir = dirname(path); ; dir = dirname(dir)) {
    if (existsSync(dir)) return dir
    if (dirname(dir) === dir) return undefined
  }
}

// Whether deleting from this path's drive goes to the Recycle Bin. Network
// shares don't have one; local and Google Drive volumes do.
export function hasRecycleBin(path: string): boolean {
  const root = parse(path).root
  if (root.startsWith('\\\\')) return false
  return existsSync(join(root, '$RECYCLE.BIN'))
}

export function trashWarnings(ids: number[]): string[] {
  const byRoot = new Map<string, boolean>()
  return getFiles(ids)
    .filter((f) => {
      if (f.missing) return false
      const root = parse(f.path).root.toLowerCase()
      if (!byRoot.has(root)) byRoot.set(root, hasRecycleBin(f.path))
      return !byRoot.get(root)
    })
    .map((f) => f.name)
}

// Moves files to the Recycle Bin and drops them from the catalog. Files that
// are already gone from disk are just dropped.
export async function trashFiles(ids: number[], trash: (path: string) => Promise<void>): Promise<TrashResult> {
  const trashed: number[] = []
  const failed: TrashResult['failed'] = []
  for (const file of getFiles(ids)) {
    if (!file.missing) {
      try {
        await trash(file.path)
      } catch (error) {
        if (await exists(file.path)) {
          failed.push({ name: file.name, message: describe(error) })
          continue
        }
      }
    }
    trashed.push(file.id)
  }
  deleteFileRows(trashed)
  return { trashed, failed }
}

// Splits an argument template such as `--load "{file}"` into arguments. The
// argument holding {file} is repeated once per file; without one, files go last.
export function buildArgs(template: string, files: string[]): string[] {
  const args: string[] = []
  let placed = false
  for (const raw of template.match(/"[^"]*"|\S+/g) ?? []) {
    const token = raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw
    if (token.includes('{file}')) {
      placed = true
      for (const f of files) args.push(token.replaceAll('{file}', f))
    } else {
      args.push(token)
    }
  }
  if (!placed) args.push(...files)
  return args
}

function launch(app: LaunchApp, files: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(app.exePath, buildArgs(app.argsTemplate, files), {
      cwd: dirname(app.exePath),
      detached: true,
      stdio: 'ignore'
    })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

async function launchOrFail(app: LaunchApp, paths: string[]): Promise<OpResult> {
  if (paths.length > MAX_OPEN_IN_APP) return fail(`Select at most ${MAX_OPEN_IN_APP} files to open at once.`)
  try {
    await launch(app, paths)
    return { ok: true }
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return fail(`${app.name} was not found at ${app.exePath}.`)
    }
    return fail(`${app.name} could not be started: ${describe(error)}`)
  }
}

// shell.openPath: resolves with an error message, or '' on success.
type OpenPath = (path: string) => Promise<string>

async function openWithSystem(files: FileItem[], openPath: OpenPath): Promise<OpResult> {
  if (files.length > MAX_OPEN_SYSTEM) {
    return fail(`Select at most ${MAX_OPEN_SYSTEM} files to open with the Windows default program.`)
  }
  for (const file of files) {
    const error = await openPath(file.path)
    if (error) return fail(`${file.name} could not be opened: ${error}`)
  }
  return { ok: true }
}

function present(ids: number[]): FileItem[] | OpResult {
  const files = getFiles(ids)
  if (files.length === 0) return fail('Nothing to open.')
  const missing = files.find((f) => f.missing)
  if (missing) return fail(`${missing.name} is missing from disk.`)
  return files
}

// Opens files in `appId`, or with each extension's default (3FM's own choice
// first, then the Windows default program).
export async function openFiles(ids: number[], appId: number | null, openPath: OpenPath): Promise<OpResult> {
  const files = present(ids)
  if (!Array.isArray(files)) return files
  if (appId !== null) {
    return openInApp(
      files.map((f) => f.path),
      appId
    )
  }
  const groups = new Map<number, { app: LaunchApp; files: FileItem[] }>()
  const system: FileItem[] = []
  for (const file of files) {
    const app = defaultAppFor(file.ext)
    if (!app) system.push(file)
    else if (groups.has(app.id)) groups.get(app.id)!.files.push(file)
    else groups.set(app.id, { app, files: [file] })
  }
  for (const group of groups.values()) {
    const result = await launchOrFail(
      group.app,
      group.files.map((f) => f.path)
    )
    if (!result.ok) return result
  }
  return system.length > 0 ? openWithSystem(system, openPath) : { ok: true }
}

// Opens paths, cataloged or not, in one of the listed apps.
export function openInApp(paths: string[], appId: number): Promise<OpResult> {
  const app = getApp(appId)
  return app ? launchOrFail(app, paths) : Promise.resolve(fail('That app is no longer in the list.'))
}

export async function openFilesWithSystem(ids: number[], openPath: OpenPath): Promise<OpResult> {
  const files = present(ids)
  return Array.isArray(files) ? openWithSystem(files, openPath) : files
}
