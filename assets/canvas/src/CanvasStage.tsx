import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Bot, Copy, ExternalLink, Gamepad2, Hand, ImagePlus, Maximize, MessageSquarePlus, Minimize, Minus, MousePointer2, Plus, Scan, X } from 'lucide-react'
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
const interactiveElement = 'button, a[href], input, select, textarea, label, summary, [contenteditable], [tabindex], [role~="button"], [role~="slider"], [role~="switch"], [role~="checkbox"], [role~="tab"], [role~="radio"], [role~="option"], [role~="combobox"], [role~="listbox"], [role~="menu"], [role~="scrollbar"]'
const gameTopClearance = 8
const gameToolbarClearance = 20
const modeTransitionDuration = 280
const modeTransitionEasing = 'cubic-bezier(0.22, 1, 0.36, 1)'
const toolbarIdleDelay = 2500

function keepMenuInView(viewport: HTMLElement, frame: HTMLElement, toolbar: HTMLElement, view: View): View {
  const { width, height } = viewport.getBoundingClientRect()
  const bottom = toolbar.offsetTop - viewport.offsetTop
  const maxX = Math.max(0, (width - frame.offsetWidth * view.zoom) / 2 - 8)
  const halfHeight = frame.offsetHeight * view.zoom / 2
  const minY = halfHeight + gameTopClearance - height / 2
  const maxY = Math.max(minY, bottom - 8 - halfHeight - height / 2)
  return { ...view, x: Math.max(-maxX, Math.min(maxX, view.x)), y: Math.max(minY, Math.min(maxY, view.y)) }
}

function fitPreview(viewport: HTMLElement, frame: HTMLElement, controls: DOMRect, toolbar: HTMLElement): View {
  const width = viewport.clientWidth
  const gutter = 16
  const frameWidth = frame.offsetWidth
  const frameHeight = frame.offsetHeight
  const viewportBounds = viewport.getBoundingClientRect()
  const height = Math.max(0, toolbar.offsetTop - viewport.offsetTop)
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

export function CanvasStage({ designPath, previewWidth, controlsRef, sidebarOpen, previewLocked, gameMode, onGameModeChange, gameScreenshot, onGameScreenshotChange, children }: {
  designPath?: string
  previewWidth: number
  controlsRef: RefObject<HTMLDivElement | null>
  sidebarOpen: boolean
  previewLocked: boolean
  gameMode: boolean
  onGameModeChange: (enabled: boolean) => void
  gameScreenshot: File | null
  onGameScreenshotChange: (image: File | null) => void
  children: ReactNode
}) {
  const stageRef = useRef<HTMLElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const screenshotInputRef = useRef<HTMLInputElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const hoverBubbleRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const modeTransitionTimer = useRef<number | undefined>(undefined)
  const toolbarAnimation = useRef<Animation | null>(null)
  const previousToolbarWidth = useRef<number | null>(null)
  const toolbarIdleTimer = useRef<number | undefined>(undefined)
  const [toolbarIdle, setToolbarIdle] = useState(false)
  const [switchingMode, setSwitchingMode] = useState(false)
  const [manualView, setManualView] = useState<View | null>(null)
  const [gameFit, setGameFit] = useState<View>(centeredView)
  const [gamePosition, setGamePosition] = useState<{ x: number; y: number } | null>(null)
  const [screenshotUrl, setScreenshotUrl] = useState('')
  const [fullscreen, setFullscreen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [gameError, setGameError] = useState('')
  const [tool, setTool] = useState<Tool>('pointer')
  const [hovered, setHovered] = useState<Element | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [dragging, setDragging] = useState(false)
  const [fitView, setFitView] = useState<View>(centeredView)
  const [dimensions, setDimensions] = useState('')
  const [previewVisible, setPreviewVisible] = useState(false)
  const view = gameMode ? { ...gameFit, ...gamePosition } : manualView ?? fitView
  const selecting = !gameMode && tool === 'select' && Boolean(dimensions)
  const hoverInfo = selecting && !previewLocked && hovered ? describeElement(hovered) : null

  const scheduleToolbarHide = useCallback(() => {
    window.clearTimeout(toolbarIdleTimer.current)
    toolbarIdleTimer.current = window.setTimeout(() => setToolbarIdle(true), toolbarIdleDelay)
  }, [])

  useEffect(() => {
    setToolbarIdle(false)
    if (!gameMode) return
    scheduleToolbarHide()
    return () => window.clearTimeout(toolbarIdleTimer.current)
  }, [gameMode, scheduleToolbarHide])

  function revealToolbarNearPointer(event: PointerEvent<HTMLElement>) {
    if (!gameMode) return
    const toolbar = toolbarRef.current
    const stage = event.currentTarget.getBoundingClientRect()
    if (!toolbar || event.clientY < stage.top + toolbar.offsetTop - 12 ||
      Math.abs(event.clientX - (stage.left + stage.width / 2)) > Math.max(110, toolbar.offsetWidth / 2 + 12)) return

    setToolbarIdle(false)
    scheduleToolbarHide()
  }

  useEffect(() => {
    if (!gameScreenshot) {
      setScreenshotUrl('')
      return
    }
    const url = URL.createObjectURL(gameScreenshot)
    setScreenshotUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [gameScreenshot])

  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === stageRef.current)
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])

  async function toggleFullscreen() {
    setGameError('')
    if (expanded) {
      setExpanded(false)
      return
    }
    try {
      if (document.fullscreenElement === stageRef.current) await document.exitFullscreen()
      else if (document.fullscreenEnabled && stageRef.current?.requestFullscreen) await stageRef.current.requestFullscreen()
      else setExpanded(true)
    } catch {
      if (!document.fullscreenElement) setExpanded(true)
    }
  }

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

  const selectedElement = gameMode ? null : selection?.element
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

  function changeMode(next: boolean) {
    if (next === gameMode) return
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      previousToolbarWidth.current = toolbarRef.current?.getBoundingClientRect().width ?? null
      window.clearTimeout(modeTransitionTimer.current)
      setSwitchingMode(true)
      modeTransitionTimer.current = window.setTimeout(() => setSwitchingMode(false), modeTransitionDuration + 40)
    }
    setHovered(null)
    setGameError('')
    setExpanded(false)
    if (!next && fullscreen) void document.exitFullscreen().catch(() => {})
    onGameModeChange(next)
  }

  useLayoutEffect(() => {
    const toolbar = toolbarRef.current
    const width = previousToolbarWidth.current
    if (!toolbar || width === null) return

    previousToolbarWidth.current = null
    toolbarAnimation.current?.cancel()
    toolbarAnimation.current = toolbar.animate(
      [{ width: width + 'px' }, { width: toolbar.getBoundingClientRect().width + 'px' }],
      { duration: modeTransitionDuration, easing: modeTransitionEasing },
    )
  }, [gameMode])

  useEffect(() => () => {
    window.clearTimeout(modeTransitionTimer.current)
    toolbarAnimation.current?.cancel()
  }, [])

  useLayoutEffect(() => {
    if (!previewLocked) return
    setHovered(null)
    if (document.fullscreenElement === stageRef.current) void document.exitFullscreen().catch(() => {})
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

      if (gameMode) {
        const viewportHeight = viewport.clientHeight
        const availableHeight = Math.max(1, toolbar.offsetTop - viewport.offsetTop - gameTopClearance - gameToolbarClearance)
        const zoom = Math.min(1, Math.max(1, viewport.clientWidth - 16) / width, availableHeight / frame.offsetHeight)
        const fit = keepMenuInView(viewport, frame, toolbar, { x: 0, y: gameTopClearance + (availableHeight - viewportHeight) / 2, zoom })
        setGameFit(fit)
        setGamePosition(current => current && keepMenuInView(viewport, frame, toolbar, { ...fit, ...current }))
        return
      }

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
  }, [controlsRef, designPath, gameMode, sidebarOpen])

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

    if (gameMode) return
    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', onWheel)
  }, [gameMode, zoomBy])

  function startPan(event: PointerEvent<HTMLDivElement>) {
    if (selecting && event.button === 0) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    const onBackground = event.target === event.currentTarget
    const target = event.target instanceof Element ? event.target : null
    const canPan = gameMode
      ? event.button === 0 && Boolean(dimensions && target && frameRef.current?.contains(target) && !target.closest(interactiveElement))
      : event.button === 1 || (event.button === 0 && (tool === 'pan' || onBackground))
    if (!canPan || dragRef.current) return

    event.preventDefault()
    if (gameMode) event.stopPropagation()
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
    if (gameMode) {
      setGamePosition(keepMenuInView(viewportRef.current!, frameRef.current!, toolbarRef.current!, { x, y, zoom: gameFit.zoom }))
      return
    }
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
      ref={stageRef}
      className="canvas-stage"
      data-expanded={expanded}
      data-switching-mode={switchingMode}
      aria-label={gameMode ? 'Game preview' : 'Design canvas'}
      onPointerMoveCapture={revealToolbarNearPointer}
      onPointerDownCapture={revealToolbarNearPointer}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && expanded) setExpanded(false)
        if (!previewLocked && event.key === 'Escape' && selecting) chooseTool('pointer')
      }}
    >
      <div
        ref={viewportRef}
        className="canvas-viewport"
        inert={previewLocked || switchingMode}
        data-game-mode={gameMode}
        data-pan-tool={!gameMode && tool === 'pan'}
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
        <div className="canvas-game-scene" aria-hidden="true">
          {screenshotUrl && (
            <img className="canvas-game-background" src={screenshotUrl} alt="" draggable={false} onError={() => {
              onGameScreenshotChange(null)
              setGameError('This image could not be opened.')
            }} />
          )}
        </div>
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
            {!gameMode && dimensions && <figcaption className="canvas-measure" aria-label="Menu dimensions" hidden={!previewVisible}>{dimensions}</figcaption>}
          </figure>
        ) : children}
        {hoverInfo && (
          <div ref={hoverBubbleRef} className="canvas-hover-bubble" aria-hidden="true">
            {hoverInfo.label && <strong>{hoverInfo.label}</strong>}
            <span className={hoverInfo.label ? 'canvas-hover-type' : undefined}>{hoverInfo.type}</span>
          </div>
        )}
      </div>

      {!gameMode && selection && dimensions && !previewLocked && (
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

      <div ref={toolbarRef} className="canvas-toolkit" data-idle={gameMode && toolbarIdle} role="group" aria-label="Canvas tools" inert={previewLocked}>
        {gameMode ? (
          <div className="canvas-mode-tools canvas-game-tools" inert={switchingMode}>
            <input hidden type="file" accept="image/*" ref={screenshotInputRef} onChange={event => {
              const image = event.currentTarget.files?.[0]
              if (image) {
                setGameError('')
                onGameScreenshotChange(image)
              }
              event.currentTarget.value = ''
            }} />
            <button type="button" className="canvas-icon-button" aria-label="Load game screenshot" title="Load game screenshot" onClick={() => screenshotInputRef.current?.click()}>
              <ImagePlus aria-hidden="true" />
            </button>
            {gameScreenshot && (
              <button type="button" className="canvas-icon-button" aria-label="Clear game screenshot" title="Clear game screenshot" onClick={() => onGameScreenshotChange(null)}>
                <X aria-hidden="true" />
              </button>
            )}
            <button type="button" className="canvas-icon-button" aria-label="Center menu" title="Center menu" disabled={!dimensions} onClick={() => setGamePosition(null)}>
              <Scan aria-hidden="true" />
            </button>
            <button type="button" className="canvas-icon-button" aria-label={fullscreen || expanded ? 'Exit fullscreen' : 'Fullscreen'} title={fullscreen || expanded ? 'Exit fullscreen' : 'Fullscreen'} onClick={() => void toggleFullscreen()}>
              {fullscreen || expanded ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
            </button>
          </div>
        ) : (
          <div className="canvas-mode-tools canvas-edit-tools" inert={switchingMode}>
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
        )}
        <span className="canvas-tool-divider" aria-hidden="true" />
        <button
          type="button"
          className="canvas-mode-switch"
          role="switch"
          aria-checked={gameMode}
          aria-label="Game preview mode"
          title={gameMode ? 'Switch to Agent Canvas' : 'Switch to Game Preview'}
          onClick={() => changeMode(!gameMode)}
        >
          <span className="canvas-mode-thumb" aria-hidden="true">
            <Bot className="canvas-mode-agent" />
            <Gamepad2 className="canvas-mode-game" />
          </span>
        </button>
      </div>
      {gameMode && gameError && <p className="canvas-game-error" role="status">{gameError}</p>}
    </main>
  )
}
