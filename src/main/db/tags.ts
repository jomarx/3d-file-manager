import { labelProblem, TAG_COLORS, type Tag, type TagResult } from '@shared/api'
import { getDb } from './index'

// File counts leave out missing files, matching what the tag's view shows.
const TAG_SELECT = `
  SELECT t.id, t.name, t.color, COUNT(f.id) AS fileCount
  FROM tags t
  LEFT JOIN file_tags ft ON ft.tag_id = t.id
  LEFT JOIN files f ON f.id = ft.file_id AND f.missing_since IS NULL`

export function listTags(): Tag[] {
  return getDb().prepare(`${TAG_SELECT} GROUP BY t.id ORDER BY t.name COLLATE NOCASE`).all() as Tag[]
}

export function getTag(id: number): Tag | undefined {
  return getDb().prepare(`${TAG_SELECT} WHERE t.id = ? GROUP BY t.id`).get(id) as Tag | undefined
}

const fail = (message: string) => ({ ok: false as const, message })

function checkName(name: string, exceptId: number | null): string | null {
  const problem = labelProblem('tag', name)
  if (problem) return problem
  const other = getDb().prepare('SELECT id FROM tags WHERE name = ? AND id IS NOT ?').get(name, exceptId)
  return other ? `There is already a tag called "${name}".` : null
}

const isColor = (color: string) => /^#[0-9a-f]{6}$/i.test(color)

export function createTag(rawName: string, color?: string): TagResult {
  const name = rawName.trim()
  const problem = checkName(name, null)
  if (problem) return fail(problem)
  if (color !== undefined && !isColor(color)) return fail('That is not a color.')
  const db = getDb()
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM tags').get() as { n: number }
  const info = db
    .prepare('INSERT INTO tags (name, color) VALUES (?, ?)')
    .run(name, color ?? TAG_COLORS[n % TAG_COLORS.length])
  return { ok: true, tag: getTag(Number(info.lastInsertRowid))! }
}

export function updateTag(id: number, changes: { name?: string; color?: string }): TagResult {
  if (!getTag(id)) return fail('That tag no longer exists.')
  const name = changes.name?.trim()
  if (name !== undefined) {
    const problem = checkName(name, id)
    if (problem) return fail(problem)
  }
  if (changes.color !== undefined && !isColor(changes.color)) return fail('That is not a color.')
  const db = getDb()
  db.transaction(() => {
    if (name !== undefined) db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(name, id)
    if (changes.color !== undefined) db.prepare('UPDATE tags SET color = ? WHERE id = ?').run(changes.color, id)
  })()
  return { ok: true, tag: getTag(id)! }
}

export function deleteTag(id: number): void {
  getDb().prepare('DELETE FROM tags WHERE id = ?').run(id)
}

export function assignTag(fileIds: number[], tagId: number, on: boolean): void {
  const db = getDb()
  const stmt = on
    ? db.prepare(
        // The SELECT skips ids that aren't cataloged instead of failing on the foreign key.
        'INSERT OR IGNORE INTO file_tags (file_id, tag_id) SELECT id, ? FROM files WHERE id = ?'
      )
    : db.prepare('DELETE FROM file_tags WHERE tag_id = ? AND file_id = ?')
  db.transaction(() => fileIds.forEach((fileId) => stmt.run(tagId, fileId)))()
}
