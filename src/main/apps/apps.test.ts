import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeDatabase, openDatabase } from '../db/index'
import { addApp, appsState, defaultAppFor, removeApp, setDefaultApp, syncDetectedApps } from '../db/apps'
import { detectApps, installRoots, type DetectFs } from './detect'

// A fake disk: the set of files that exist, with directories implied by their paths.
function fakeFs(files: string[]): DetectFs {
  const norm = (p: string) => p.replaceAll('/', '\\').toLowerCase()
  const all = files.map((f) => f.replaceAll('/', '\\'))
  return {
    exists: (p) => all.some((f) => norm(f) === norm(p)),
    list: (dir) => {
      const prefix = norm(dir) + '\\'
      const names = all.filter((f) => norm(f).startsWith(prefix)).map((f) => f.slice(prefix.length).split('\\')[0])
      return [...new Set(names)]
    }
  }
}

describe('detectApps', () => {
  const PF = 'C:\\Program Files'
  const LOCAL = 'C:\\Users\\me\\AppData\\Local\\Programs'

  it('finds slicers in the install folders', () => {
    const fs = fakeFs([
      `${PF}/Bambu Studio/bambu-studio.exe`,
      `${PF}/Prusa3D/PrusaSlicer/prusa-slicer.exe`,
      `${PF}/Prusa3D/PrusaSlicer/prusa-gcodeviewer.exe`,
      `${LOCAL}/OrcaSlicer/orca-slicer.exe`
    ])
    expect(detectApps([PF, LOCAL], fs)).toEqual([
      { name: 'Bambu Studio', exePath: `${PF}\\Bambu Studio\\bambu-studio.exe`, exts: null },
      { name: 'OrcaSlicer', exePath: `${LOCAL}\\OrcaSlicer\\orca-slicer.exe`, exts: null },
      { name: 'PrusaSlicer', exePath: `${PF}\\Prusa3D\\PrusaSlicer\\prusa-slicer.exe`, exts: null },
      {
        name: 'PrusaSlicer G-code Viewer',
        exePath: `${PF}\\Prusa3D\\PrusaSlicer\\prusa-gcodeviewer.exe`,
        exts: ['gcode']
      }
    ])
  })

  it('picks the newest of several Cura versions', () => {
    const fs = fakeFs(
      ['5.7.1', '5.9.0', '5.10.2', '5.10.0', '5.8.0'].map((v) => `${PF}/UltiMaker Cura ${v}/UltiMaker-Cura.exe`)
    )
    expect(detectApps([PF], fs)).toEqual([
      { name: 'UltiMaker Cura', exePath: `${PF}\\UltiMaker Cura 5.10.2\\UltiMaker-Cura.exe`, exts: null }
    ])
  })

  it('skips a versioned folder without the program in it', () => {
    const fs = fakeFs([`${PF}/Ultimaker Cura 4.13.1/Cura.exe`, `${PF}/UltiMaker Cura 5.2.0/readme.txt`])
    expect(detectApps([PF], fs)[0].exePath).toBe(`${PF}\\Ultimaker Cura 4.13.1\\Cura.exe`)
  })

  it('finds nothing on a machine without slicers', () => {
    expect(detectApps([PF], fakeFs([`${PF}/Notepad++/notepad++.exe`]))).toEqual([])
  })

  it('lists each install root once', () => {
    expect(
      installRoots({
        ProgramW6432: 'C:\\Program Files',
        ProgramFiles: 'C:\\PROGRAM FILES',
        'ProgramFiles(x86)': 'C:\\Program Files (x86)',
        LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local'
      })
    ).toEqual(['C:\\Program Files', 'C:\\Program Files (x86)', 'C:\\Users\\me\\AppData\\Local\\Programs'])
  })
})

describe('app settings', () => {
  let tmp: string
  const bambu = { name: 'Bambu Studio', exePath: 'C:\\PF\\Bambu Studio\\bambu-studio.exe', exts: null }
  const cura = (v: string) => ({ name: 'UltiMaker Cura', exePath: `C:\\PF\\UltiMaker Cura ${v}\\UltiMaker-Cura.exe`, exts: null })
  const names = () => appsState().apps.map((a) => a.name)
  const idOf = (name: string) => appsState().apps.find((a) => a.name === name)!.id

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), '3fm-apps-'))
    openDatabase(join(tmp, 'test.db'))
  })

  afterAll(() => {
    closeDatabase()
    rmSync(tmp, { recursive: true, force: true })
  })

  it('stores detected apps', () => {
    syncDetectedApps([bambu, cura('5.9.0')])
    expect(appsState().apps).toEqual([
      { id: expect.any(Number), name: 'Bambu Studio', exePath: bambu.exePath, autoDetected: true, exts: null },
      { id: expect.any(Number), name: 'UltiMaker Cura', exePath: cura('5.9.0').exePath, autoDetected: true, exts: null }
    ])
  })

  it('keeps defaults when a slicer is upgraded', () => {
    setDefaultApp('stl', idOf('UltiMaker Cura'))
    syncDetectedApps([bambu, cura('5.10.2')])
    expect(defaultAppFor('stl')?.exePath).toBe(cura('5.10.2').exePath)
    expect(appsState().defaults).toEqual({ stl: idOf('UltiMaker Cura') })
  })

  it('forgets uninstalled slicers and their defaults', () => {
    syncDetectedApps([bambu])
    expect(names()).toEqual(['Bambu Studio'])
    expect(defaultAppFor('stl')).toBeUndefined()
  })

  it('adds programs by hand', () => {
    const result = addApp('D:\\Tools\\MySlicer\\MySlicer.exe')
    expect(result.ok).toBe(true)
    expect(names()).toEqual(['Bambu Studio', 'MySlicer'])
    expect(addApp('d:\\tools\\myslicer\\MYSLICER.EXE')).toMatchObject({ ok: false, reason: 'duplicate' })
  })

  it('removes only programs added by hand', () => {
    removeApp(idOf('Bambu Studio'))
    removeApp(idOf('MySlicer'))
    expect(names()).toEqual(['Bambu Studio'])
  })

  it('lets a hand-added copy of a detected program take over', () => {
    const id = idOf('Bambu Studio')
    setDefaultApp('3mf', id)
    expect(addApp(bambu.exePath).ok).toBe(true)
    expect(appsState().apps).toEqual([expect.objectContaining({ id, autoDetected: false })])
    // Detection doesn't add it back as a second entry.
    syncDetectedApps([bambu])
    expect(names()).toEqual(['Bambu Studio'])
    expect(defaultAppFor('3mf')?.id).toBe(id)
  })
})
