import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { extensionOf } from '@shared/api'
import { walk, type FoundFile } from './walk'

let root: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), '3fm-walk-'))
  const files: Record<string, string> = {
    'benchy.stl': 'solid',
    'Plate.3MF': 'zip',
    'readme.txt': 'nope',
    'sub/part.gcode': 'G1',
    'sub/deeper/plate_1.gcode.3mf': 'zip',
    'node_modules/ignored.stl': 'solid',
    '.git/ignored.stl': 'solid'
  }
  for (const [rel, body] of Object.entries(files)) {
    const full = join(root, rel)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, body)
  }
})

afterAll(() => rmSync(root, { recursive: true, force: true }))

async function collect(recursive: boolean): Promise<FoundFile[]> {
  const out: FoundFile[] = []
  for await (const f of walk(root, recursive)) out.push(f)
  return out.sort((a, b) => (a.name < b.name ? -1 : 1))
}

describe('walk', () => {
  it('finds catalogable files recursively and skips tooling folders', async () => {
    const found = await collect(true)
    expect(found.map((f) => [f.name, f.ext, f.type])).toEqual([
      ['Plate.3MF', '3mf', '3mf'],
      ['benchy.stl', 'stl', 'stl'],
      ['part.gcode', 'gcode', 'gcode'],
      ['plate_1.gcode.3mf', 'gcode.3mf', 'gcode']
    ])
    const benchy = found[1]
    expect(benchy.path).toBe(join(root, 'benchy.stl'))
    expect(benchy.size).toBe(5)
    expect(benchy.mtime).toBeGreaterThan(0)
  })

  it('stays in the top folder when not recursive', async () => {
    expect((await collect(false)).map((f) => f.name)).toEqual(['Plate.3MF', 'benchy.stl'])
  })

  it('throws when the root is missing', async () => {
    await expect(walk(join(root, 'nope'), true).next()).rejects.toThrow()
  })
})

describe('extensionOf', () => {
  it('prefers .gcode.3mf over .3mf', () => {
    expect(extensionOf('a.GCODE.3MF')).toEqual({ ext: 'gcode.3mf', type: 'gcode' })
    expect(extensionOf('a.3mf')).toEqual({ ext: '3mf', type: '3mf' })
  })

  it('rejects other files', () => {
    expect(extensionOf('model.obj')).toBeNull()
    expect(extensionOf('stl')).toBeNull()
  })
})
