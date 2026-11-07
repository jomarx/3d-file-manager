import { mkdirSync } from 'node:fs'
import { readdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setThumb, thumbNames } from './db/files'

// Thumbnails are drawn by the renderer (it has WebGL) and cached here as
// <data dir>\thumbs\<file id>.png. A scan that sees a file change clears its
// thumb_path, so the next look at it draws a new one.

const MAX_BYTES = 2 * 1024 * 1024
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

let dir = ''

export function initThumbs(dataDir: string): void {
  dir = join(dataDir, 'thumbs')
  mkdirSync(dir, { recursive: true })
}

export const thumbFile = (name: string): string => join(dir, name)

export async function saveThumb(id: number, mtime: number, png: Uint8Array | null): Promise<void> {
  if (!png) {
    setThumb(id, mtime, '')
    return
  }
  if (png.length > MAX_BYTES || !PNG_SIGNATURE.every((b, i) => png[i] === b)) {
    throw new Error('That is not a PNG thumbnail.')
  }
  const name = `${id}.png`
  await writeFile(join(dir, name), png)
  setThumb(id, mtime, name)
}

// Deletes thumbnails of files no longer in the catalog. Run before the window
// opens, so no thumbnail is being saved meanwhile.
export async function pruneThumbs(): Promise<void> {
  const names = await readdir(dir)
  const keep = thumbNames()
  for (const name of names) if (!keep.has(name)) await unlink(join(dir, name)).catch(() => undefined)
}
