import type { ViewMode } from '../types'

interface Props {
  hasFolders: boolean
  query: string
  viewMode: ViewMode
  onAddFolder(): void
}

// File listing arrives with the scanner; for now this shows the empty states.
export default function FileArea(props: Props) {
  return (
    <main className="flex min-w-0 flex-1 items-center justify-center p-6" data-view={props.viewMode}>
      {props.hasFolders ? (
        <div className="text-center">
          <p className="text-sm font-medium">No files indexed yet</p>
          <p className="mt-1 text-xs text-zinc-500">
            {props.query
              ? `Nothing matches “${props.query}”.`
              : 'STL, 3MF and G-code files in your folders will show up here.'}
          </p>
        </div>
      ) : (
        <div className="max-w-sm text-center">
          <p className="text-base font-semibold">Start your catalog</p>
          <p className="mt-2 text-sm text-zinc-500">
            Add a folder that holds your STL, 3MF or G-code files. 3FM indexes them without moving
            or changing anything.
          </p>
          <button
            type="button"
            onClick={props.onAddFolder}
            className="mt-4 h-9 rounded-md bg-accent px-4 text-sm font-medium text-white hover:brightness-110"
          >
            Add folder
          </button>
        </div>
      )}
    </main>
  )
}
