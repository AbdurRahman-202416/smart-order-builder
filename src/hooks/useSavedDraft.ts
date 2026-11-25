import { useEffect, useState } from 'react'
import type { PlateDraft } from '../types'

const DRAFT_STORAGE_KEY = 'sob.draft.v1'
export const emptyPlateDraft = (): PlateDraft => ({ options: {}, qty: 1, editingItemId: null })

function readSavedDraft(): PlateDraft {
  try {
    const savedText = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (savedText) return { ...emptyPlateDraft(), ...(JSON.parse(savedText) as PlateDraft) }
  } catch {
    /* a broken saved draft is ignored */
  }
  return emptyPlateDraft()
}

/** Keeps the unfinished plate in localStorage, so it survives a page refresh. */
export function useSavedDraft() {
  const [draft, setDraft] = useState<PlateDraft>(readSavedDraft)
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
    } catch {
      /* storage may not be available */
    }
  }, [draft])
  return [draft, setDraft] as const
}
