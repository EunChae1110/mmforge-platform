import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, Layers } from 'lucide-react'
import { useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import { CanvasHint } from '../ui/CanvasHint'
import { PreviewBoundary } from './PreviewBoundary'
import { getWidgets, subscribeToWidgets, type Position, type Widget } from './widgetCatalog'
import './gameWidgets.css'

type Placement = Position & { hidden: boolean }
type Layout = {
  menuVisible: boolean
  placements: Record<string, Placement>
}
type Drag = {
  pointerId: number
  start: Position
  origin: Position
  range: Position
}

const widgetInset = 16
const interactive = 'button, a[href], input, select, textarea, summary, label, [contenteditable], [tabindex], [role="button"], [role="slider"], [role="switch"]'
const emptyLayout: Layout = { menuVisible: true, placements: {} }

function clamp(value: number) {
  return Math.max(0, Math.min(1, value))
}

function readLayout(key: string, widgets: readonly Widget[]): Layout {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<Layout> | null
    if (!saved) return emptyLayout
    const placements: Layout['placements'] = {}
    for (const { id } of widgets) {
      // The first preview stored its sample widgets by filename stem.
      const position = saved.placements?.[id] ?? saved.placements?.[id.slice('custom/'.length, -'.tsx'.length)]
      if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
        placements[id] = { x: clamp(position.x), y: clamp(position.y), hidden: position.hidden === true }
      }
    }
    return { menuVisible: saved.menuVisible !== false, placements }
  } catch {
    return emptyLayout
  }
}

export function useGameWidgets(designPath?: string) {
  const widgets = useSyncExternalStore(subscribeToWidgets, () => getWidgets(designPath))
  const key = 'mmforge:game-widgets:' + (designPath ?? 'canvas')
  const [layout, setLayout] = useState(() => readLayout(key, widgets))

  function updateLayout(next: Layout) {
    setLayout(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // The preview can still use its in-memory layout.
    }
  }

  return {
    ...layout,
    widgets,
    setMenuVisible: (menuVisible: boolean) => updateLayout({ ...layout, menuVisible }),
    toggleWidget(widget: Widget) {
      const current = layout.placements[widget.id]
      const position = current ? { ...current, hidden: !current.hidden } : { ...widget.initialPosition, hidden: false }
      updateLayout({ ...layout, placements: { ...layout.placements, [widget.id]: position } })
    },
    moveWidget(id: string, position: Position) {
      updateLayout({ ...layout, placements: { ...layout.placements, [id]: { ...position, hidden: false } } })
    },
  }
}

type GameWidgetsState = ReturnType<typeof useGameWidgets>

export function GameWidgetMenu({ state, containerRef }: {
  state: GameWidgetsState
  containerRef: RefObject<HTMLElement | null>
}) {
  return (
    <DropdownMenu.Root modal={false}>
      <CanvasHint label="Widgets">
        <DropdownMenu.Trigger className="canvas-icon-button" aria-label="Widgets">
          <Layers aria-hidden="true" />
        </DropdownMenu.Trigger>
      </CanvasHint>
      <DropdownMenu.Portal container={containerRef.current}>
        <DropdownMenu.Content className="canvas-file-menu canvas-widget-menu" side="top" align="center" sideOffset={8} collisionPadding={8}>
          {state.widgets.map((widget) => (
            <DropdownMenu.CheckboxItem
              key={widget.id}
              className="canvas-file-menu-item"
              checked={state.placements[widget.id]?.hidden === false}
              onCheckedChange={() => state.toggleWidget(widget)}
              onSelect={(event) => event.preventDefault()}
            >
              <span className="canvas-widget-menu-check"><DropdownMenu.ItemIndicator><Check aria-hidden="true" /></DropdownMenu.ItemIndicator></span>
              {widget.title}
            </DropdownMenu.CheckboxItem>
          ))}
          {state.widgets.length === 0 && (
            <DropdownMenu.Label className="canvas-widget-menu-empty">No widgets for this design</DropdownMenu.Label>
          )}
          <DropdownMenu.Separator className="canvas-file-menu-separator" />
          <DropdownMenu.CheckboxItem
            className="canvas-file-menu-item"
            checked={state.menuVisible}
            onCheckedChange={state.setMenuVisible}
            onSelect={(event) => event.preventDefault()}
          >
            <span className="canvas-widget-menu-check"><DropdownMenu.ItemIndicator><Check aria-hidden="true" /></DropdownMenu.ItemIndicator></span>
            Show menu
          </DropdownMenu.CheckboxItem>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export function GameWidgetLayer({ state }: { state: GameWidgetsState }) {
  return (
    <div className="canvas-widget-layer" style={{ '--widget-inset': widgetInset + 'px' } as CSSProperties}>
      {state.widgets.map(widget => {
        const position = state.placements[widget.id]
        return position && !position.hidden && (
          <PlacedWidget key={widget.id} widget={widget} position={position} onMove={state.moveWidget} />
        )
      })}
    </div>
  )
}

function PlacedWidget({ widget, position, onMove }: {
  widget: Widget
  position: Position
  onMove: (id: string, position: Position) => void
}) {
  const drag = useRef<Drag | null>(null)
  const [draft, setDraft] = useState<Position | null>(null)
  const placed = draft ?? position
  const Preview = widget.Preview

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    const node = event.currentTarget
    const control = event.target instanceof Element && event.target.closest(interactive)
    if (event.button !== 0 || drag.current || (control && control !== node) || !node.parentElement) return

    drag.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: position,
      range: {
        x: Math.max(1, node.parentElement.clientWidth - node.offsetWidth - 2 * widgetInset),
        y: Math.max(1, node.parentElement.clientHeight - node.offsetHeight - 2 * widgetInset),
      },
    }
    node.setPointerCapture(event.pointerId)
    setDraft(position)
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (current?.pointerId !== event.pointerId) return
    setDraft({
      x: clamp(current.origin.x + (event.clientX - current.start.x) / current.range.x),
      y: clamp(current.origin.y + (event.clientY - current.start.y) / current.range.y),
    })
  }

  function stopDrag(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (current?.pointerId !== event.pointerId) return
    drag.current = null
    setDraft(null)
    if (event.type !== 'pointerup') return
    onMove(widget.id, {
      x: clamp(current.origin.x + (event.clientX - current.start.x) / current.range.x),
      y: clamp(current.origin.y + (event.clientY - current.start.y) / current.range.y),
    })
  }

  function moveByKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return
    const step = event.shiftKey ? 0.1 : 0.02
    let { x, y } = position
    if (event.key === 'ArrowLeft') x -= step
    else if (event.key === 'ArrowRight') x += step
    else if (event.key === 'ArrowUp') y -= step
    else if (event.key === 'ArrowDown') y += step
    else return
    event.preventDefault()
    onMove(widget.id, { x: clamp(x), y: clamp(y) })
  }

  return (
    <div
      className="canvas-game-widget"
      data-dragging={draft !== null}
      role="group"
      aria-label={widget.title}
      aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
      tabIndex={0}
      style={{ '--widget-x': placed.x, '--widget-y': placed.y } as CSSProperties}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onLostPointerCapture={stopDrag}
      onKeyDown={moveByKey}
    >
      <PreviewBoundary><Preview /></PreviewBoundary>
    </div>
  )
}
