import { useEffect, useState } from 'react'
import { designActivityEvent, widgetOwner, type DesignActivity } from '../shared/designActivity'
import './designActivityNotice.css'

const phaseDetails = {
  creating: 'AI is creating a file',
  writing: 'AI is writing the design',
  editing: 'AI is editing the design',
  created: 'Design file created',
  updated: 'Design file updated',
}

const widgetPhaseDetails = {
  creating: 'AI is creating the widget',
  writing: 'AI is writing the widget',
  editing: 'AI is editing the widget',
  created: 'Widget file created',
  updated: 'Widget file updated',
}

export function useDesignActivity() {
  const [live, setLive] = useState<DesignActivity | null>(null)

  useEffect(() => {
    const hot = import.meta.hot
    if (!hot) return
    hot.on(designActivityEvent, setLive)
    hot.send(designActivityEvent + ':sync')
    return () => hot.off(designActivityEvent, setLive)
  }, [])

  useEffect(() => {
    if (!live) return
    const timer = window.setTimeout(() => setLive(null), Math.max(0, live.until - Date.now()))
    return () => window.clearTimeout(timer)
  }, [live])

  return live
}

export function DesignActivityNotice({ live, designPath }: { live: DesignActivity | null; designPath?: string }) {
  if (!live || live.phase === 'done') return null

  const owner = widgetOwner(live.path)
  const file = live.path.split('/').at(-1)!
  const affectedMenu = owner ?? live.path.match(/^designs\/([^/]+\.tsx)$/)?.[1] ?? designPath?.split('/').at(-1)
  const menuName = affectedMenu?.replace(/\.tsx$/, '')
  const context = owner ? menuName + ' · ' + file.replace(/\.[^.]+$/, '') : (menuName ?? file)
  const status = (owner ? widgetPhaseDetails : phaseDetails)[live.phase]
  const previewReady = live.previewReady === true || live.source === 'filesystem'

  return (
    <div className="canvas-activity-backdrop" data-preview-ready={previewReady}>
      <div className="canvas-activity-aura" aria-hidden="true" />
      <div className="canvas-activity-text" role="status" aria-atomic="true">
        <strong key={live.phase}>{status}</strong>
        <span>{context}</span>
      </div>
    </div>
  )
}
