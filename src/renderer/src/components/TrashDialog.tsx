import type { FileItem } from '@shared/api'
import Dialog, { DialogButton } from './Dialog'

const LISTED = 5

// Confirms moving files to the Recycle Bin. Missing files are only dropped from the catalog.
export default function TrashDialog(props: {
  files: FileItem[]
  // Names of files on drives without a Recycle Bin.
  permanent: string[]
  onConfirm(): void
  onCancel(): void
}) {
  const { files, permanent } = props
  const missing = files.filter((f) => f.missing).length
  const onlyMissing = missing === files.length
  const what = files.length === 1 ? `"${files[0].name}"` : `${files.length} files`

  return (
    <Dialog
      title={onlyMissing ? 'Remove from catalog' : 'Move to Recycle Bin'}
      onClose={props.onCancel}
      footer={
        <>
          <DialogButton onClick={props.onCancel} autoFocus={permanent.length > 0}>
            Cancel
          </DialogButton>
          <DialogButton kind="danger" onClick={props.onConfirm} autoFocus={permanent.length === 0}>
            {onlyMissing ? 'Remove' : permanent.length > 0 ? 'Delete' : 'Move to Recycle Bin'}
          </DialogButton>
        </>
      }
    >
      <p className="break-words">
        {onlyMissing
          ? `Remove ${what} from the catalog? ${files.length === 1 ? 'It is' : 'They are'} already gone from disk.`
          : `Move ${what} to the Recycle Bin?`}
      </p>
      {missing > 0 && !onlyMissing && (
        <p className="mt-2 text-zinc-500">
          {missing} of them {missing === 1 ? 'is' : 'are'} already missing from disk and will just be removed
          from the catalog.
        </p>
      )}
      {permanent.length > 0 && (
        <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <p className="font-medium">
            {permanent.length === 1 ? 'This file is' : 'These files are'} on a drive without a Recycle Bin and
            may be deleted permanently:
          </p>
          <ul className="mt-1 list-disc pl-4 break-all">
            {permanent.slice(0, LISTED).map((name, i) => (
              <li key={i}>{name}</li>
            ))}
            {permanent.length > LISTED && <li>and {permanent.length - LISTED} more</li>}
          </ul>
        </div>
      )}
      <p className="mt-3 text-zinc-500">Their tags and collection entries in 3FM are removed too.</p>
    </Dialog>
  )
}
