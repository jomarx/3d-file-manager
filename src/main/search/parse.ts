import type { FileType } from '@shared/api'

export interface ParsedSearch {
  // Plain words; every one must appear in the file name.
  terms: string[]
  // tag:pla — file must carry every listed tag.
  tags: string[]
  // type:stl — file must be one of these types. An unknown value such as
  // "type:obj" is kept as null so the search matches nothing instead of
  // silently ignoring the filter.
  types: (FileType | null)[]
  // in:"Christmas gifts" — file must be in every listed collection.
  collections: string[]
  // folder:Thingi — the file's directory path must contain each value.
  folders: string[]
}

const TYPE_ALIASES: Record<string, FileType> = {
  stl: 'stl',
  '3mf': '3mf',
  gcode: 'gcode',
  'g-code': 'gcode',
  'gcode.3mf': 'gcode'
}

// key:"quoted value" | key:value | "quoted phrase" | word
const TOKEN = /(\w+):"([^"]*)"?|(\w+):(\S*)|"([^"]*)"?|(\S+)/g

export function parseSearch(input: string): ParsedSearch {
  const result: ParsedSearch = { terms: [], tags: [], types: [], collections: [], folders: [] }
  for (const m of input.matchAll(TOKEN)) {
    const key = (m[1] ?? m[3])?.toLowerCase()
    const value = (m[2] ?? m[4] ?? '').trim()
    if (key !== undefined) {
      if (value === '') continue
      switch (key) {
        case 'tag':
          result.tags.push(value)
          continue
        case 'type':
        case 'ext':
          result.types.push(TYPE_ALIASES[value.toLowerCase()] ?? null)
          continue
        case 'in':
          result.collections.push(value)
          continue
        case 'folder':
          result.folders.push(value)
          continue
      }
      // Not a known prefix (e.g. "C:" or "part:2"): search for it literally.
      result.terms.push(m[0])
      continue
    }
    const word = (m[5] ?? m[6] ?? '').trim()
    if (word !== '') result.terms.push(word)
  }
  return result
}
