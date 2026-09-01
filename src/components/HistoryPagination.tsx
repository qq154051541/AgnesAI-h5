/**
 * 通用历史记录分页器（首页 / 上一页 / 页码 / 下一页 / 尾页 / 跳转）
 */
import { Button } from 'animal-island-ui'

interface HistoryPaginationProps {
  page: number
  totalPages: number
  jumpInput: string
  onJumpInputChange: (v: string) => void
  onFirst: () => void
  onPrev: () => void
  onNext: () => void
  onLast: () => void
  onJump: () => void
}

export default function HistoryPagination(props: HistoryPaginationProps) {
  const {
    page,
    totalPages,
    jumpInput,
    onJumpInputChange,
    onFirst,
    onPrev,
    onNext,
    onLast,
    onJump
  } = props

  if (totalPages <= 1) return null

  return (
    <div className="agnes-history-pagination">
      <Button size="small" disabled={page <= 1} onClick={onFirst}>首页</Button>
      <Button size="small" disabled={page <= 1} onClick={onPrev}>上一页</Button>
      <span className="agnes-page-info">{page} / {totalPages}</span>
      <Button size="small" disabled={page >= totalPages} onClick={onNext}>下一页</Button>
      <Button size="small" disabled={page >= totalPages} onClick={onLast}>尾页</Button>
      {totalPages > 3 && (
        <div className="agnes-page-jump">
          <input
            className="agnes-page-jump-input"
            type="number"
            value={jumpInput}
            maxLength={4}
            placeholder="页码"
            onChange={(e) => onJumpInputChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onJump()}
          />
          <Button size="small" onClick={onJump}>跳转</Button>
        </div>
      )}
    </div>
  )
}