/**
 * 历史记录分页 hook
 * 统一管理 page / jumpPage / pagedHistory / totalPages / 跳转校验
 */
import { useState, useMemo, useCallback } from 'react'
import { Notification } from 'animal-island-ui'

export interface UseHistoryPaginationResult<T> {
  page: number
  setPage: (p: number) => void
  jumpInput: string
  setJumpInput: (v: string) => void
  pagedItems: T[]
  totalPages: number
  goFirst: () => void
  goPrev: () => void
  goNext: () => void
  goLast: () => void
  jumpTo: () => void
  reset: () => void
}

export function useHistoryPagination<T>(
  items: T[],
  pageSize = 10
): UseHistoryPaginationResult<T> {
  const [page, setPage] = useState(1)
  const [jumpInput, setJumpInput] = useState('')

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const pagedItems = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize]
  )

  const goFirst = useCallback(() => setPage(1), [])
  const goPrev = useCallback(() => setPage((p) => Math.max(1, p - 1)), [])
  const goNext = useCallback(() => setPage((p) => Math.min(totalPages, p + 1)), [totalPages])
  const goLast = useCallback(() => setPage(totalPages), [totalPages])

  const jumpTo = useCallback(() => {
    const target = parseInt(jumpInput, 10)
    if (isNaN(target) || target < 1 || target > totalPages) {
      Notification.warning('请输入有效页码')
      return
    }
    setPage(target)
    setJumpInput('')
  }, [jumpInput, totalPages])

  const reset = useCallback(() => {
    setPage(1)
    setJumpInput('')
  }, [])

  return {
    page: safePage,
    setPage,
    jumpInput,
    setJumpInput,
    pagedItems,
    totalPages,
    goFirst,
    goPrev,
    goNext,
    goLast,
    jumpTo,
    reset
  }
}