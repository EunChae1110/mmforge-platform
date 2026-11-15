import { cloneElement, useId, useLayoutEffect, useRef, type ReactElement } from 'react'
import { useCanvasHover } from './useCanvasHover'
import './canvasHint.css'

export function CanvasHint({ label, shortcut, children }: {
  label: string
  shortcut?: 'zoom'
  children: ReactElement<{ 'aria-describedby'?: string }>
}) {
  const { open, events } = useCanvasHover()
  const id = useId()
  const anchorRef = useRef<HTMLSpanElement>(null)
  const hintRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    if (!open) return
    const anchor = anchorRef.current!
    const hint = hintRef.current!
    function position() {
      const bounds = anchor.getBoundingClientRect()
      const width = hint.offsetWidth
      const center = bounds.left + bounds.width / 2
      const left = Math.max(8, Math.min(center - width / 2, document.documentElement.clientWidth - width - 8))
      hint.style.setProperty('--hint-shift', left - center + width / 2 + 'px')
    }
    position()
    window.addEventListener('resize', position)
    return () => window.removeEventListener('resize', position)
  }, [label, open])

  return (
    <span className="canvas-hint-anchor" ref={anchorRef} {...events}>
      {open ? cloneElement(children, { 'aria-describedby': id }) : children}
      {open && (
        <span className="canvas-hint" ref={hintRef} id={id} role="tooltip">
          <span className="canvas-hint-label">
            {label}
            {shortcut === 'zoom' && <span className="canvas-hint-shortcut"><kbd>Ctrl</kbd> + scroll</span>}
          </span>
        </span>
      )}
    </span>
  )
}
