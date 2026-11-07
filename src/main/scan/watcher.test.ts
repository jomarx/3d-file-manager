import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeDatabase, openDatabase } from '../db/index'
import { addFolder, removeFolder } from '../db/repo'
import { FolderWatcher } from './watcher'

let tmp: string
let lib: string
let folderId: number
let watcher: FolderWatcher
let rescans: number[] = []

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function rescansAfter(change: () => void): Promise<number[]> {
  rescans = []
  change()
  await sleep(600)
  return rescans
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), '3fm-watch-'))
  lib = join(tmp, 'Prints')
  mkdirSync(join(lib, 'sub'), { recursive: true })
  openDatabase(join(tmp, 'test.db'))
  const added = addFolder(lib)
  if (!added.ok) throw new Error(added.message)
  folderId = added.folder.id
  watcher = new FolderWatcher((id) => rescans.push(id), 100)
  watcher.sync()
})

afterAll(() => {
  watcher.close()
  closeDatabase()
  rmSync(tmp, { recursive: true, force: true })
})

describe('FolderWatcher', () => {
  it('rescans once after a burst of model file changes, in subfolders too', async () => {
    expect(
      await rescansAfter(() => {
        writeFileSync(join(lib, 'a.stl'), 'x')
        writeFileSync(join(lib, 'sub', 'b.3mf'), 'x')
        writeFileSync(join(lib, 'sub', 'c.gcode'), 'x')
      })
    ).toEqual([folderId])
  })

  it('rescans when a folder appears', async () => {
    expect(await rescansAfter(() => mkdirSync(join(lib, 'new.models')))).toEqual([folderId])
  })

  it('ignores other files', async () => {
    expect(
      await rescansAfter(() => {
        writeFileSync(join(lib, 'notes.txt'), 'x')
        writeFileSync(join(lib, 'sub', 'photo.png'), 'x')
      })
    ).toEqual([])
  })

  it('stops watching removed folders', async () => {
    removeFolder(folderId)
    watcher.sync()
    expect(await rescansAfter(() => writeFileSync(join(lib, 'd.stl'), 'x'))).toEqual([])
  })
})
