import { type ComponentType } from 'react'
import { widgetOwner } from '../shared/designActivity'

export type Position = { x: number; y: number }
export type Widget = {
  id: string
  title: string
  initialPosition: Position
  Preview: ComponentType
}
type WidgetModule = { default?: ComponentType; widgetTitle?: string }

const initialPositions: Position[] = [
  { x: 0, y: 1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 0.63 },
]
const modules = import.meta.glob<WidgetModule>('/designs/widgets/*/*.tsx', { eager: true })
const widgetsByDesign = new Map<string, Widget[]>()

for (const [path, module] of Object.entries(modules).sort(([left], [right]) => left.localeCompare(right))) {
  if (!module.default) continue
  const owner = widgetOwner(path)
  if (!owner) continue
  const filename = path.slice(path.lastIndexOf('/') + 1)
  const designPath = 'designs/' + owner
  const widgets = widgetsByDesign.get(designPath) ?? []
  widgets.push({
    id: 'custom/' + filename,
    title: module.widgetTitle?.trim() || filename.slice(0, -4).replace(/[-_]/g, ' '),
    initialPosition: initialPositions[widgets.length] ?? { x: 1, y: Math.min(0.8, (widgets.length - 3) * 0.2) },
    Preview: module.default,
  })
  widgetsByDesign.set(designPath, widgets)
}

const emptyWidgets: readonly Widget[] = []
const hot = import.meta.hot
const catalog: { widgets: ReadonlyMap<string, readonly Widget[]>; listeners: Set<() => void> } =
  hot?.data.catalog ?? { widgets: widgetsByDesign, listeners: new Set() }

export function getWidgets(designPath?: string) {
  return (designPath && catalog.widgets.get(designPath)) || emptyWidgets
}

export function subscribeToWidgets(listener: () => void) {
  catalog.listeners.add(listener)
  return () => { catalog.listeners.delete(listener) }
}

if (import.meta.hot) {
  // Replacing the catalog must leave the open game preview and screenshot mounted.
  import.meta.hot.data.catalog = catalog
  import.meta.hot.accept()
  catalog.widgets = widgetsByDesign
  for (const listener of catalog.listeners) listener()
}
