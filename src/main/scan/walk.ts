import { opendir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { extensionOf, type FileType } from '@shared/api'

export interface FoundFile {
  path: string
  name: string
  ext: string
  type: FileType
  size: number
  mtime: number
}

// System and tooling folders that never hold user models.
const SKIP_DIRS = new Set(['$recycle.bin', 'system volume information', 'node_modules', '.git'])

/**
 * Yields every catalogable file under `root`. Symlinks and junctions are not
 * followed (they show up as neither file nor directory), which also rules out
 * cycles. Unreadable subfolders are reported through `onError` and skipped;
 * an unreadable root throws.
 */
export async function* walk(
  root: string,
  recursive: boolean,
  onError?: (path: string, error: unknown) => void
): AsyncGenerator<FoundFile> {
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop()!
    let entries
    try {
      entries = await opendir(dir)
    } catch (error) {
      if (dir === root) throw error
      onError?.(dir, error)
      continue
    }
    for await (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (recursive && !SKIP_DIRS.has(entry.name.toLowerCase())) stack.push(full)
        continue
      }
      if (!entry.isFile()) continue
      const kind = extensionOf(entry.name)
      if (!kind) continue
      try {
        const s = await stat(full)
        yield { path: full, name: entry.name, ...kind, size: s.size, mtime: Math.floor(s.mtimeMs) }
      } catch (error) {
        onError?.(full, error)
      }
    }
  }
}
