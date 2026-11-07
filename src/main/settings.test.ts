import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/api'

const theme = vi.hoisted(() => ({ themeSource: 'system' }))
vi.mock('electron', () => ({ nativeTheme: theme }))

const { getSettings, loadSettings, sanitizeSettings, updateSettings } = await import('./settings')

let tmp: string

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), '3fm-settings-'))
})

afterAll(() => rmSync(tmp, { recursive: true, force: true }))

describe('sanitizeSettings', () => {
  it('keeps allowed values and drops the rest', () => {
    expect(sanitizeSettings({ theme: 'dark', viewMode: 'list', sort: 'size', desc: true, extra: 1 })).toEqual({
      theme: 'dark',
      viewMode: 'list',
      sort: 'size',
      desc: true
    })
    expect(sanitizeSettings({ theme: 'purple', sort: 'colour', desc: 'yes' })).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS)
  })
})

describe('settings file', () => {
  it('starts from the defaults when there is no file or it is broken', () => {
    expect(loadSettings(tmp)).toEqual(DEFAULT_SETTINGS)
    writeFileSync(join(tmp, 'settings.json'), '{ not json')
    expect(loadSettings(tmp)).toEqual(DEFAULT_SETTINGS)
  })

  it('saves changes, applies the theme and reads them back', () => {
    loadSettings(tmp)
    expect(updateSettings({ theme: 'light', sort: 'mtime', desc: true })).toMatchObject({ theme: 'light', sort: 'mtime' })
    expect(theme.themeSource).toBe('light')
    expect(JSON.parse(readFileSync(join(tmp, 'settings.json'), 'utf8')).sort).toBe('mtime')

    // A bad value leaves the setting as it was.
    updateSettings({ viewMode: 'tiles' as never })
    expect(getSettings().viewMode).toBe('grid')

    theme.themeSource = 'system'
    expect(loadSettings(tmp)).toEqual({ theme: 'light', viewMode: 'grid', sort: 'mtime', desc: true })
    expect(theme.themeSource).toBe('light')
  })
})
