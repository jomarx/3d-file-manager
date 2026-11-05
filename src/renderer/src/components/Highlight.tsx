function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Marks every occurrence of the search terms inside `text`.
export default function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const words = terms.filter((t) => t.length > 0)
  if (words.length === 0) return <>{text}</>
  const pattern = new RegExp(`(${words.map(escapeRegExp).join('|')})`, 'gi')
  return (
    <>
      {text.split(pattern).map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-sm bg-accent/30 text-inherit">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  )
}
