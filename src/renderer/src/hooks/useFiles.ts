import { useCallback, useEffect, useRef, useState } from 'react'
import type { FileItem, FileQuery } from '@shared/api'

export const PAGE_SIZE = 200

type Params = Omit<FileQuery, 'offset' | 'limit'>

export interface FilesState {
  items: FileItem[]
  total: number
  terms: string[]
  loading: boolean
  // The items are for the current params, not left over from earlier ones.
  settled: boolean
  loadMore(): void
  // Re-run the query without losing how far the user has scrolled.
  refresh(): void
}

export function useFiles(params: Params): FilesState {
  const [items, setItems] = useState<FileItem[]>([])
  const [total, setTotal] = useState(0)
  const [terms, setTerms] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [loadedKey, setLoadedKey] = useState<string | null>(null)

  // Each new query bumps the generation so late responses from an older
  // query are dropped instead of overwriting newer results.
  const generation = useRef(0)
  const itemsRef = useRef(items)
  itemsRef.current = items
  const paramsRef = useRef(params)
  paramsRef.current = params
  const key = JSON.stringify(params)

  const fetchFrom = useCallback(async (offset: number, limit: number, replace: boolean) => {
    const gen = replace ? ++generation.current : generation.current
    setLoading(true)
    const requested = JSON.stringify(paramsRef.current)
    try {
      const res = await window.api.files.query({ ...paramsRef.current, offset, limit })
      if (gen !== generation.current) return
      setItems((prev) => (replace ? res.items : [...prev, ...res.items]))
      if (replace) setLoadedKey(requested)
      setTotal(res.total)
      setTerms(res.terms)
    } finally {
      if (gen === generation.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchFrom(0, PAGE_SIZE, true)
  }, [key, fetchFrom])

  const loadMore = useCallback(() => {
    const loaded = itemsRef.current.length
    if (loading || loaded >= total) return
    void fetchFrom(loaded, PAGE_SIZE, false)
  }, [loading, total, fetchFrom])

  const refresh = useCallback(() => {
    void fetchFrom(0, Math.max(itemsRef.current.length, PAGE_SIZE), true)
  }, [fetchFrom])

  return { items, total, terms, loading, settled: loadedKey === key, loadMore, refresh }
}

export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}
