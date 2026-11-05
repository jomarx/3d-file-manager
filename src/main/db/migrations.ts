import type Database from 'better-sqlite3'

// Each entry upgrades the schema by one version. Never edit a shipped
// migration; append a new one instead. PRAGMA user_version tracks progress.
const migrations: string[] = [
  // v1: catalog, tags, collections, external apps
  `
  CREATE TABLE folders (
    id         INTEGER PRIMARY KEY,
    path       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    recursive  INTEGER NOT NULL DEFAULT 1,
    offline    INTEGER NOT NULL DEFAULT 0,
    added_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE files (
    id             INTEGER PRIMARY KEY,
    folder_id      INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    path           TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name           TEXT NOT NULL,
    ext            TEXT NOT NULL,
    size           INTEGER NOT NULL,
    mtime          INTEGER NOT NULL,
    quick_hash     TEXT,
    thumb_path     TEXT,
    meta_json      TEXT,
    indexed_at     TEXT NOT NULL DEFAULT (datetime('now')),
    missing_since  TEXT
  );
  CREATE INDEX files_folder ON files(folder_id);
  CREATE INDEX files_ext ON files(ext);
  CREATE INDEX files_quick_hash ON files(quick_hash);

  CREATE VIRTUAL TABLE files_fts USING fts5(
    name, path,
    content='files', content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
  );
  CREATE TRIGGER files_ai AFTER INSERT ON files BEGIN
    INSERT INTO files_fts(rowid, name, path) VALUES (new.id, new.name, new.path);
  END;
  CREATE TRIGGER files_ad AFTER DELETE ON files BEGIN
    INSERT INTO files_fts(files_fts, rowid, name, path) VALUES ('delete', old.id, old.name, old.path);
  END;
  CREATE TRIGGER files_au AFTER UPDATE OF name, path ON files BEGIN
    INSERT INTO files_fts(files_fts, rowid, name, path) VALUES ('delete', old.id, old.name, old.path);
    INSERT INTO files_fts(rowid, name, path) VALUES (new.id, new.name, new.path);
  END;

  CREATE TABLE tags (
    id     INTEGER PRIMARY KEY,
    name   TEXT NOT NULL UNIQUE COLLATE NOCASE,
    color  TEXT NOT NULL DEFAULT '#64748b'
  );

  CREATE TABLE file_tags (
    file_id  INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    tag_id   INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (file_id, tag_id)
  ) WITHOUT ROWID;
  CREATE INDEX file_tags_tag ON file_tags(tag_id);

  CREATE TABLE collections (
    id             INTEGER PRIMARY KEY,
    name           TEXT NOT NULL,
    description    TEXT,
    cover_file_id  INTEGER REFERENCES files(id) ON DELETE SET NULL,
    sort_order     INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE collection_files (
    collection_id  INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    file_id        INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    position       INTEGER NOT NULL DEFAULT 0,
    added_at       TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (collection_id, file_id)
  ) WITHOUT ROWID;
  CREATE INDEX collection_files_file ON collection_files(file_id);

  CREATE TABLE apps (
    id             INTEGER PRIMARY KEY,
    name           TEXT NOT NULL,
    exe_path       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    args_template  TEXT NOT NULL DEFAULT '"{file}"',
    auto_detected  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE ext_defaults (
    ext     TEXT PRIMARY KEY,
    app_id  INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE
  );
  `
]

export const SCHEMA_VERSION = migrations.length

export function migrate(db: Database.Database): void {
  const current = db.pragma('user_version', { simple: true }) as number
  if (current > SCHEMA_VERSION) {
    throw new Error(
      `Database schema v${current} is newer than this build of 3FM supports (v${SCHEMA_VERSION}).`
    )
  }
  for (let v = current; v < SCHEMA_VERSION; v++) {
    db.transaction(() => {
      db.exec(migrations[v])
      db.pragma(`user_version = ${v + 1}`)
    })()
  }
}
