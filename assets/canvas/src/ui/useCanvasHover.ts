import { useEffect, useState, type FocusEvent, type PointerEvent } from 'react'

export function useCanvasHover() {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const open = (hovered || focused) && !dismissed

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setDismissed(true)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  return {
    open,
    events: {
      onPointerEnter(event: PointerEvent<HTMLElement>) {
        if (event.pointerType === 'touch') return
        setHovered(true)
        setDismissed(false)
      },
      onPointerLeave() {
        setHovered(false)
      },
      onFocus(event: FocusEvent<HTMLElement>) {
        const fromOutside = !event.currentTarget.contains(event.relatedTarget)
        if (fromOutside) {
          setFocused(event.target.matches(':focus-visible'))
          setDismissed(false)
        } else if (event.target.matches(':focus-visible')) {
          setFocused(true)
        }
      },
      onBlur(event: FocusEvent<HTMLElement>) {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
      },
    },
  }
}
