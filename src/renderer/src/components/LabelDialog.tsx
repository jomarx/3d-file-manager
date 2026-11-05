import { useState } from 'react'
import { labelProblem, MAX_COLLECTION_NAME, MAX_TAG_NAME, TAG_COLORS } from '@shared/api'
import Dialog, { DialogButton } from './Dialog'

export interface LabelFields {
  name: string
  color: string
  description: string
}

// Creates or edits a tag (name and color) or a collection (name and description).
export default function LabelDialog(props: {
  kind: 'tag' | 'collection'
  editing: boolean
  initial: LabelFields
  // Resolves to an error message to show, or null once saved.
  onSave(fields: LabelFields): Promise<string | null>
  onClose(): void
}) {
  const { kind } = props
  const [fields, setFields] = useState(props.initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (changes: Partial<LabelFields>) => {
    setFields((f) => ({ ...f, ...changes }))
    setError(null)
  }

  // Quotes and length are caught while typing; an empty name just disables saving.
  const problem = fields.name.trim() === '' ? null : labelProblem(kind, fields.name)
  const save = async () => {
    if (busy || fields.name.trim() === '' || problem) return
    setBusy(true)
    const message = await props.onSave(fields)
    setBusy(false)
    if (message) setError(message)
  }

  const noun = kind === 'tag' ? 'tag' : 'collection'
  return (
    <Dialog
      title={props.editing ? `Edit ${noun}` : `New ${noun}`}
      onClose={props.onClose}
      className="w-[24rem]"
      footer={
        <>
          <DialogButton onClick={props.onClose}>Cancel</DialogButton>
          <DialogButton kind="primary" onClick={() => void save()} disabled={busy || fields.name.trim() === '' || !!problem}>
            {props.editing ? 'Save' : 'Create'}
          </DialogButton>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
        className="flex flex-col gap-3"
      >
        <label className="flex flex-col gap-1">
          <span className="text-zinc-500">Name</span>
          <input
            value={fields.name}
            autoFocus
            spellCheck={false}
            maxLength={(kind === 'tag' ? MAX_TAG_NAME : MAX_COLLECTION_NAME) + 1}
            onChange={(e) => set({ name: e.target.value })}
            onFocus={(e) => e.target.select()}
            className="h-8 rounded-md border border-zinc-300 bg-white px-2 text-sm outline-none focus:border-accent dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        {kind === 'tag' ? (
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-zinc-500">Color</legend>
            <div className="flex flex-wrap gap-1.5">
              {TAG_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  role="radio"
                  aria-checked={fields.color === color}
                  aria-label={color}
                  onClick={() => set({ color })}
                  className={[
                    'size-6 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                    fields.color === color ? 'ring-2 ring-zinc-900 ring-offset-2 ring-offset-white dark:ring-zinc-100 dark:ring-offset-[#15181e]' : ''
                  ].join(' ')}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </fieldset>
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-zinc-500">Description (optional)</span>
            <textarea
              value={fields.description}
              rows={3}
              onChange={(e) => set({ description: e.target.value })}
              onKeyDown={(e) => {
                // Ctrl+Enter saves from the description; plain Enter is a new line.
                if (e.key === 'Enter' && e.ctrlKey) {
                  e.preventDefault()
                  void save()
                }
              }}
              className="resize-none rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-accent dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
        )}
        {(problem ?? error) && <p className="text-red-600 dark:text-red-400">{problem ?? error}</p>}
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}
