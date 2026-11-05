import { describe, expect, it } from 'vitest'
import { parseSearch } from './parse'

describe('parseSearch', () => {
  it('splits plain words into terms', () => {
    expect(parseSearch('  benchy   boat ').terms).toEqual(['benchy', 'boat'])
  })

  it('keeps a quoted phrase as one term', () => {
    expect(parseSearch('"cable clip" v2').terms).toEqual(['cable clip', 'v2'])
  })

  it('reads every prefix, including quoted values', () => {
    const parsed = parseSearch('benchy tag:pla type:3mf in:"Printer upgrades" folder:Thingi')
    expect(parsed).toEqual({
      terms: ['benchy'],
      tags: ['pla'],
      types: ['3mf'],
      collections: ['Printer upgrades'],
      folders: ['Thingi']
    })
  })

  it('accepts type aliases and marks unknown types as null', () => {
    expect(parseSearch('type:G-code ext:STL type:obj').types).toEqual(['gcode', 'stl', null])
  })

  it('treats unknown prefixes and drive letters as literal terms', () => {
    expect(parseSearch('part:2 C:\\models').terms).toEqual(['part:2', 'C:\\models'])
  })

  it('ignores prefixes with no value', () => {
    expect(parseSearch('tag: tag:"" benchy')).toEqual({
      terms: ['benchy'],
      tags: [],
      types: [],
      collections: [],
      folders: []
    })
  })

  it('tolerates an unclosed quote', () => {
    expect(parseSearch('in:"Gifts for mom').collections).toEqual(['Gifts for mom'])
  })
})
