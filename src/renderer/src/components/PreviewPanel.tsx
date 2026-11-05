// Right-hand panel: 3D preview, metadata and file actions for the selected file.
export default function PreviewPanel() {
  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-zinc-200 dark:border-zinc-800">
      <div className="m-4 grid aspect-square place-items-center rounded-lg border border-dashed border-zinc-300 text-xs text-zinc-400 dark:border-zinc-700">
        Select a file to preview
      </div>
    </aside>
  )
}
