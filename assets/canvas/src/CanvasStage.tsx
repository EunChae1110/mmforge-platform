import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Copy, ExternalLink, Hand, Maximize, MessageSquarePlus, Minus, MousePointer2, Plus, Scan, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from 'react'
import { describeElement, draftUrl, elementContext, previewElement, requestElementAnnotation, supportsElementAnnotations } from './elementContext'

const minZoom = 0.1
const maxZoom = 4
const zoomStep = 1.25
const centeredView = { x: 0, y: 0, zoom: 1 }
const draftDestinations = [
  { agent: 'codex', name: 'Codex', icon: 'codex.png' },
  { agent: 'cursor', name: 'Cursor', icon: 'cursor.svg' },
  { agent: 'claude', name: 'Claude Code', icon: 'claude.png' },
  { agent: 'vscode', name: 'VS Code Agents', icon: 'vscode.png' },
] as const

type View = typeof centeredView
type Tool = 'pointer' | 'pan' | 'select'
type Selection = ReturnType<typeof elementContext> & {
  element: Element
  status: string
}
type Drag = {
  pointerId: number
  startX: number
  startY: number
  viewX: number
  viewY: number
}

function fitPreview(viewport: HTMLElement, frame: HTMLElement, controls: DOMRect, toolbar: HTMLElement): View {
  const width = viewport.clientWidth
  const gutter = 16
  const frameWidth = frame.offsetWidth
  const frameHeight = frame.offsetHeight
  const viewportBounds = viewport.getBoundingClientRect()
  const height = Math.max(0, toolbar.getBoundingClientRect().top - viewportBounds.top)
  const controlsRight = controls.right - viewportBounds.left
  const controlsBottom = controls.bottom - viewportBounds.top

  function fit(left: number, top: number): View {
    return {
      x: left / 2,
      y: (height - viewport.clientHeight + top) / 2,
      zoom: Math.min(1, Math.max(1, width - left - 2 * gutter) / frameWidth, Math.max(1, height - top - 2 * gutter) / frameHeight),
    }
  }

  const centered = fit(0, 0)
  if (
    (width - frameWidth * centered.zoom) / 2 >= controlsRight + gutter ||
    (height - frameHeight * centered.zoom) / 2 >= controlsBottom + gutter
  ) return centered

  const beside = fit(controlsRight, 0)
  const below = fit(0, controlsBottom)
  return beside.zoom >= below.zoom ? beside : below
}

export function CanvasStage({ designPath, previewWidth, controlsRef, sidebarOpen, previewLocked, children }: {
  designPath?: string
  previewWidth: number
  controlsRef: RefObject<HTMLDivElement | null>
  sidebarOpen: boolean
  previewLocked: boolean
  children: ReactNode
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const hoverBubbleRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const [manualView, setManualView] = useState<View | null>(null)
  const [tool, setTool] = useState<Tool>('pointer')
  const [hovered, setHovered] = useState<Element | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [dragging, setDragging] = useState(false)
  const [fitView, setFitView] = useState<View>(centeredView)
  const [dimensions, setDimensions] = useState('')
  const [previewVisible, setPreviewVisible] = useState(false)
  const view = manualView ?? fitView
  const selecting = tool === 'select' && Boolean(dimensions)
  const hoverInfo = selecting && !previewLocked && hovered ? describeElement(hovered) : null

  useEffect(() => {
    if (!selecting || previewLocked || !hovered) return
    hovered.setAttribute('data-mmforge-hovered', '')
    return () => hovered.removeAttribute('data-mmforge-hovered')
  }, [hovered, previewLocked, selecting])

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const bubble = hoverBubbleRef.current
    if (!viewport || !bubble || !hovered) return

    function positionBubble() {
      if (!viewport || !bubble || !hovered) return
      const area = viewport.getBoundingClientRect()
      const target = hovered.getBoundingClientRect()
      const visible = target.width > 0 && target.height > 0 && target.bottom > area.top &&
        target.top < area.bottom && target.right > area.left && target.left < area.right
      bubble.style.visibility = visible ? 'visible' : 'hidden'
      if (!visible) return

      const inset = 8
      const gap = 6 + 4 * view.zoom
      const above = target.top - area.top - bubble.offsetHeight - gap
      const below = target.bottom - area.top + gap
      const placement = above >= inset || below + bubble.offsetHeight > viewport.clientHeight - inset ? 'above' : 'below'
      const top = placement === 'above' ? above : below
      const maxLeft = viewport.clientWidth - bubble.offsetWidth - inset
      const maxTop = viewport.clientHeight - bubble.offsetHeight - inset
      const visibleLeft = Math.max(area.left, target.left)
      const visibleRight = Math.min(area.right, target.right)
      const anchor = (visibleLeft + visibleRight) / 2 - area.left
      const left = Math.max(inset, Math.min(maxLeft, anchor - bubble.offsetWidth / 2))
      const arrow = Math.max(12, Math.min(bubble.offsetWidth - 12, anchor - left))

      bubble.dataset.placement = placement
      bubble.style.setProperty('--arrow-x', arrow + 'px')
      bubble.style.left = left + 'px'
      bubble.style.top = Math.max(inset, Math.min(maxTop, top)) + 'px'
    }

    const observer = new ResizeObserver(positionBubble)
    observer.observe(viewport)
    observer.observe(hovered)
    observer.observe(bubble)
    viewport.addEventListener('scroll', positionBubble, true)
    positionBubble()
    return () => {
      observer.disconnect()
      viewport.removeEventListener('scroll', positionBubble, true)
    }
  }, [hovered, previewLocked, selecting, view])

  const selectedElement = selection?.element
  useEffect(() => {
    if (!selectedElement) return
    selectedElement.setAttribute('data-mmforge-selected', '')
    return () => selectedElement.removeAttribute('data-mmforge-selected')
  }, [selectedElement])

  async function copyContext(context: Selection) {
    let status: string
    try {
      await navigator.clipboard.writeText(context.prompt)
      status = 'Context copied'
    } catch {
      status = 'Couldn’t copy context'
    }
    setSelection((current) => current?.element === context.element && current.prompt === context.prompt
      ? { ...current, status }
      : current)
  }

  function selectElement(target: EventTarget | null) {
    const preview = previewRef.current
    const element = previewElement(target, preview)
    if (!element || !preview || !designPath) return

    const context = elementContext(element, preview, designPath)
    const opened = requestElementAnnotation(element, context)
    const next = { ...context, element, status: opened ? 'Annotation requested' : '' }
    setSelection(next)
    if (!opened) void copyContext(next)
  }

  function addToCurrentChat(context: Selection) {
    if (requestElementAnnotation(context.element, context)) {
      setSelection({ ...context, status: 'Annotation requested' })
    } else {
      void copyContext(context)
    }
  }

  function chooseTool(next: Tool) {
    setHovered(null)
    setTool(next)
  }

  useLayoutEffect(() => {
    if (!previewLocked) return
    setHovered(null)
    const viewport = viewportRef.current
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    if (viewport?.hasPointerCapture(drag.pointerId)) viewport.releasePointerCapture(drag.pointerId)
    setDragging(false)
  }, [previewLocked])

  useLayoutEffect(() => {
    const viewport = viewportRef.current!
    const toolbar = toolbarRef.current!
    const frame = frameRef.current
    const preview = previewRef.current
    if (!frame || !preview) return
    const controls = controlsRef.current!
    const title = controls.querySelector<HTMLElement>('.canvas-title')!

    const measure = () => {
      const { offsetWidth: width, offsetHeight: height } = preview
      const hasPreview = width > 0 && height > 0 && !preview.querySelector(':scope > [data-mmforge-preview-error]')
      setDimensions(hasPreview ? width + ' × ' + height + ' px' : '')
      if (!hasPreview) return

      const bounds = (sidebarOpen ? controls : title).getBoundingClientRect()
      const nextFit = fitPreview(viewport, frame, bounds, toolbar)
      setFitView((current) => current.x === nextFit.x && current.y === nextFit.y && current.zoom === nextFit.zoom ? current : nextFit)
    }

    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    observer.observe(toolbar)
    observer.observe(frame)
    observer.observe(preview)
    observer.observe(controls)
    const content = new MutationObserver(measure)
    content.observe(preview, { childList: true })
    const visibility = new IntersectionObserver(([entry]) => setPreviewVisible(entry.intersectionRatio > 0), { root: viewport })
    visibility.observe(preview)
    measure()
    return () => {
      observer.disconnect()
      content.disconnect()
      visibility.disconnect()
    }
  }, [controlsRef, designPath, sidebarOpen])

  const zoomBy = useCallback((factor: number, x = fitView.x, y = fitView.y) => {
    setManualView((manual) => {
      const current = manual ?? fitView
      const zoom = Math.min(maxZoom, Math.max(Math.min(minZoom, fitView.zoom), current.zoom * factor))
      if (zoom === current.zoom) return manual
      const ratio = zoom / current.zoom
      return {
        x: x - (x - current.x) * ratio,
        y: y - (y - current.y) * ratio,
        zoom,
      }
    })
  }, [fitView])

  useLayoutEffect(() => {
    const viewport = viewportRef.current!

    function onWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      if (dragRef.current) return

      const rect = viewport.getBoundingClientRect()
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1
      const delta = event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? event.deltaY * rect.height : event.deltaY * unit
      const factor = Math.exp(-Math.max(-160, Math.min(160, delta)) * 0.0025)
      zoomBy(factor, event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2)
    }

    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', onWheel)
  }, [zoomBy])

  function startPan(event: PointerEvent<HTMLDivElement>) {
    if (selecting && event.button === 0) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    const onBackground = event.target === event.currentTarget
    const canPan = event.button === 1 || (event.button === 0 && (tool === 'pan' || onBackground))
    if (!canPan || dragRef.current) return

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      viewX: view.x,
      viewY: view.y,
    }
    setHovered(null)
    setDragging(true)
  }

  function movePan(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag && selecting) setHovered(previewElement(event.target, previewRef.current))
    if (drag?.pointerId !== event.pointerId) return

    const x = drag.viewX + event.clientX - drag.startX
    const y = drag.viewY + event.clientY - drag.startY
    setManualView((current) => ({ x, y, zoom: current?.zoom ?? fitView.zoom }))
  }

  function stopPan(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
  }

  const zoom = view.zoom

  return (
    <main
      className="canvas-stage"
      aria-label="Design canvas"
      onKeyDown={(event) => {
        if (!previewLocked && event.key === 'Escape' && selecting) chooseTool('pointer')
      }}
    >
      <div
        ref={viewportRef}
        className="canvas-viewport"
        inert={previewLocked}
        data-pan-tool={tool === 'pan'}
        data-select-tool={selecting}
        data-dragging={dragging}
        onPointerDownCapture={startPan}
        onPointerMoveCapture={movePan}
        onPointerLeave={() => setHovered(null)}
        onPointerUpCapture={(event) => {
          if (selecting && !dragRef.current && event.button === 0) {
            event.preventDefault()
            event.stopPropagation()
            selectElement(event.target)
          }
          stopPan(event)
        }}
        onPointerCancel={stopPan}
        onLostPointerCapture={stopPan}
        onClickCapture={(event) => {
          if (!selecting) return
          event.preventDefault()
          event.stopPropagation()
          if (event.detail === 0) selectElement(event.target)
        }}
        onKeyDownCapture={(event) => {
          if (!selecting || (event.key !== 'Enter' && event.key !== ' ')) return
          event.preventDefault()
          event.stopPropagation()
          selectElement(event.target)
        }}
      >
        {designPath ? (
          <figure
            ref={frameRef}
            className="canvas-frame"
            style={{
              width: previewWidth,
              transform: 'translate(calc(-50% + ' + view.x + 'px), calc(-50% + ' + view.y + 'px)) scale(' + zoom + ')',
            }}
          >
            <div className="canvas-preview" ref={previewRef}>{children}</div>
            {dimensions && <figcaption className="canvas-measure" aria-label="Menu dimensions" hidden={!previewVisible}>{dimensions}</figcaption>}
          </figure>
        ) : children}
        {hoverInfo && (
          <div ref={hoverBubbleRef} className="canvas-hover-bubble" aria-hidden="true">
            {hoverInfo.label && <strong>{hoverInfo.label}</strong>}
            <span className={hoverInfo.label ? 'canvas-hover-type' : undefined}>{hoverInfo.type}</span>
          </div>
        )}
      </div>

      {selection && dimensions && !previewLocked && (
        <div className="canvas-selection" role="group" aria-label="Selected element">
          <div className="canvas-selection-details">
            <strong title={selection.label}>{selection.label}</strong>
            <span className="canvas-selection-type">{selection.type}</span>
            <span role="status">{selection.status}</span>
          </div>
          <button type="button" className="canvas-icon-button" aria-label="Copy element context" title="Copy element context" onClick={() => void copyContext(selection)}>
            <Copy aria-hidden="true" />
          </button>
          <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger className="canvas-icon-button" aria-label="Open draft" title="Open draft">
              <ExternalLink aria-hidden="true" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="canvas-file-menu" side="top" align="end" sideOffset={8} collisionPadding={8}>
                <DropdownMenu.Group>
                  {supportsElementAnnotations() && (
                    <DropdownMenu.Item className="canvas-file-menu-item" onSelect={() => addToCurrentChat(selection)}>
                      <MessageSquarePlus aria-hidden="true" />
                      Add to current chat
                    </DropdownMenu.Item>
                  )}
                  {draftDestinations.map(({ agent, name, icon }) => (
                    <DropdownMenu.Item className="canvas-file-menu-item" key={agent} asChild>
                      <a href={draftUrl(agent, selection.prompt)}>
                        <img className="canvas-agent-icon" src={import.meta.env.BASE_URL + 'agent-icons/' + icon} alt="" width={16} height={16} />
                        Open in {name}
                      </a>
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Group>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <button type="button" className="canvas-icon-button" aria-label="Clear selection" title="Clear selection" onClick={() => setSelection(null)}>
            <X aria-hidden="true" />
          </button>
        </div>
      )}

      <div ref={toolbarRef} className="canvas-toolkit" role="group" aria-label="Canvas tools" inert={previewLocked}>
        <button
          type="button"
          className="canvas-icon-button"
          aria-label="Pointer tool"
          aria-pressed={tool === 'pointer'}
          title="Pointer tool"
          onClick={() => chooseTool('pointer')}
        >
          <MousePointer2 aria-hidden="true" />
        </button>
        <button
          type="button"
          className="canvas-icon-button"
          aria-label="Hand tool"
          aria-pressed={tool === 'pan'}
          title="Hand tool"
          onClick={() => chooseTool('pan')}
        >
          <Hand aria-hidden="true" />
        </button>
        <button
          type="button"
          className="canvas-icon-button"
          aria-label="Select element"
          aria-pressed={selecting}
          title="Select element for AI feedback"
          disabled={!dimensions}
          onClick={() => chooseTool(selecting ? 'pointer' : 'select')}
        >
          <Scan aria-hidden="true" />
        </button>

        <span className="canvas-tool-divider" aria-hidden="true" />

        <button
          type="button"
          className="canvas-icon-button"
          aria-label="Zoom out"
          title="Zoom out (Ctrl + scroll)"
          disabled={zoom <= Math.min(minZoom, fitView.zoom)}
          onClick={() => zoomBy(1 / zoomStep)}
        >
          <Minus aria-hidden="true" />
        </button>
        <span className="canvas-zoom" aria-label="Zoom level">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          className="canvas-icon-button"
          aria-label="Zoom in"
          title="Zoom in (Ctrl + scroll)"
          disabled={zoom >= maxZoom}
          onClick={() => zoomBy(zoomStep)}
        >
          <Plus aria-hidden="true" />
        </button>
        <button
          type="button"
          className="canvas-icon-button"
          aria-label="Fit to canvas"
          title="Fit to canvas"
          onClick={() => setManualView(null)}
        >
          <Maximize aria-hidden="true" />
        </button>
      </div>
    </main>
  )
}
