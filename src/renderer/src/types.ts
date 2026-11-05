export type FileType = 'stl' | '3mf' | 'gcode'

export type LibraryView = 'all' | 'recent' | 'untagged' | 'missing'

export type Selection =
  | { kind: 'library'; id: LibraryView }
  | { kind: 'collection'; id: number }
  | { kind: 'tag'; id: number }
  | { kind: 'folder'; id: number }

export type ViewMode = 'grid' | 'list'
