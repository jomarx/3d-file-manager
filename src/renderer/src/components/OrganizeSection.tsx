import { useId, useState, type ReactNode } from 'react'
import type { Collection, FileItem, Tag } from '@shared/api'

interface Props {
  files: FileItem[]
  tags: Tag[]
  collections: Collection[]
  onSetTag(tag: Tag, on: boolean): void
  // Resolves to false when the name was refused, so the field keeps it.
  onAddTag(name: string): Promise<boolean>
  onSetCollection(collection: Collection, on: boolean): void
  // Shows the "Add to collection" menu at a point.
  onCollectionMenu(x: number, y: number): void
}

// Tags and collections of the selection. With several files selected, a label
// only some of them have is dimmed; clicking it applies it to all.
export default function OrganizeSection(props: Props) {
  const { files } = props
  const listId = useId()
  const [draft, setDraft] = useState('')

  const withCounts = <T extends Tag | Collection>(labels: T[], key: 'tagIds' | 'collectionIds') =>
    labels
      .map((label) => ({ label, n: files.filter((f) => f[key].includes(label.id)).length }))
      .filter((x) => x.n > 0)

  const tags = withCounts(props.tags, 'tagIds')
  const collections = withCounts(props.collections, 'collectionIds')
  // Suggestions leave out tags every selected file already has.
  const suggestions = props.tags.filter((t) => !tags.some((x) => x.label.id === t.id && x.n === files.length))

  const submit = async () => {
    const name = draft.trim()
    if (!name) return
    if (await props.onAddTag(name)) setDraft('')
  }

  return (
    <>
      <Heading>Tags</Heading>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {tags.map(({ label: tag, n }) => (
          <Chip
            key={tag.id}
            dot={tag.color}
            partial={n < files.length}
            title={n < files.length ? `${n} of ${files.length} files. Click to tag all.` : undefined}
            onClick={n < files.length ? () => props.onSetTag(tag, true) : undefined}
            onRemove={() => props.onSetTag(tag, false)}
            removeLabel={`Remove tag ${tag.name}`}
          >
            {tag.name}
            {n < files.length && <span className="ml-1 opacity-70">{n}</span>}
          </Chip>
        ))}
        <input
          value={draft}
          list={listId}
          placeholder={tags.length > 0 ? 'Add…' : 'Add a tag…'}
          aria-label="Add tag"
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void submit()
            } else if (e.key === 'Escape') {
              e.stopPropagation()
              setDraft('')
              e.currentTarget.blur()
            }
          }}
          className="h-6 w-24 min-w-0 flex-1 rounded-full border border-dashed border-zinc-300 bg-transparent px-2.5 text-[11px] outline-none placeholder:text-zinc-400 focus:border-accent focus:border-solid dark:border-zinc-700"
        />
        <datalist id={listId}>
          {suggestions.map((t) => (
            <option key={t.id} value={t.name} />
          ))}
        </datalist>
      </div>

      <Heading>Collections</Heading>
      <ul className="mt-2 flex flex-col gap-1 text-xs">
        {collections.map(({ label: c, n }) => (
          <li key={c.id} className="group flex items-center gap-2">
            <button
              type="button"
              disabled={n === files.length}
              title={n < files.length ? `${n} of ${files.length} files. Click to add all.` : undefined}
              onClick={() => props.onSetCollection(c, true)}
              className={`min-w-0 flex-1 truncate text-left disabled:cursor-default ${n < files.length ? 'text-zinc-500' : ''}`}
            >
              {c.name}
              {n < files.length && <span className="ml-1 text-[11px]">({n})</span>}
            </button>
            <RemoveButton label={`Remove from ${c.name}`} onClick={() => props.onSetCollection(c, false)} />
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          props.onCollectionMenu(r.left, r.bottom + 4)
        }}
        className="mt-1.5 text-xs text-zinc-500 hover:text-accent"
      >
        + Add to collection ▾
      </button>
    </>
  )
}

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="mt-4 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">{children}</h3>
}

function Chip(props: {
  dot: string
  partial: boolean
  title?: string
  onClick?(): void
  onRemove(): void
  removeLabel: string
  children: ReactNode
}) {
  return (
    <span
      className={[
        'inline-flex h-6 items-center gap-1.5 rounded-full border pr-1 pl-2 text-[11px]',
        props.partial
          ? 'border-dashed border-zinc-300 text-zinc-500 dark:border-zinc-700'
          : 'border-zinc-300 dark:border-zinc-700'
      ].join(' ')}
    >
      <button type="button" title={props.title} disabled={!props.onClick} onClick={props.onClick} className="flex items-center gap-1.5 disabled:cursor-default">
        <span className="size-2 rounded-full" style={{ backgroundColor: props.dot }} />
        <span className="max-w-40 truncate">{props.children}</span>
      </button>
      <RemoveButton label={props.removeLabel} onClick={props.onRemove} />
    </span>
  )
}

function RemoveButton({ label, onClick }: { label: string; onClick(): void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid size-4 shrink-0 place-items-center rounded-full text-[10px] text-zinc-400 hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
    >
      ✕
    </button>
  )
}
