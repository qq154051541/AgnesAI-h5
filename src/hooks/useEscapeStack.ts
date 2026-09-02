import { useEffect, useCallback } from 'react'

/**
 * 全局 ESC 关闭栈：任何弹层（drawer / modal / fullscreen viewer）打开时 push 一个关闭回调，关闭时 pop。
 * 按 ESC 时只调用栈顶的回调，从而保证"最上层先关闭"的层级语义。
 *
 * 关键点：
 * 1. 事件监听注册在 window capture 阶段，先于任何第三方组件库（animal-island-ui）的 listener。
 * 2. 命中栈顶回调后 stopImmediatePropagation + preventDefault 阻止事件继续传播。
 * 3. 没有主动调用栈顶回调时（栈空），不阻止默认行为，让浏览器处理。
 */
const stack: Array<() => void> = []
let listenerInstalled = false

function installListenerIfNeeded() {
  if (listenerInstalled) return
  listenerInstalled = true
  window.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const top = stack[stack.length - 1]
      if (!top) return
      e.stopImmediatePropagation()
      e.stopPropagation()
      e.preventDefault()
      top()
    },
    { capture: true }
  )
}

/** 弹层挂载时调用：返回一个 cleanup 函数，在卸载时调用 */
export function useEscapeStack(closeFn: () => void, active: boolean = true) {
  useEffect(() => {
    if (!active) return
    installListenerIfNeeded()
    stack.push(closeFn)
    return () => {
      const idx = stack.lastIndexOf(closeFn)
      if (idx >= 0) stack.splice(idx, 1)
    }
  }, [closeFn, active])
}

/** 编程式：把 closeFn 放到栈顶（用于"我这一层已经打开了，请求 ESC 优先级"） */
export function pushEscapeHandler(closeFn: () => void): () => void {
  installListenerIfNeeded()
  stack.push(closeFn)
  return () => {
    const idx = stack.lastIndexOf(closeFn)
    if (idx >= 0) stack.splice(idx, 1)
  }
}

/** 检查栈是否为空（用于调试） */
export function getEscapeStackDepth(): number {
  return stack.length
}