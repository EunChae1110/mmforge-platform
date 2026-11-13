import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { designActivityEvent, type DesignActivity } from './designActivity'

const phaseDetails = {
  creating: 'AI is creating a file',
  writing: 'AI is writing the design',
  editing: 'AI is editing the design',
  done: 'AI edit complete',
  created: 'Design file created',
  updated: 'Design file updated',
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

export function DesignActivityNotice({ live, active }: { live: DesignActivity | null; active: boolean }) {
  const previewReady = live?.previewReady === true || live?.source === 'filesystem'

  return (
    <div className="canvas-activity-announcement" data-active={active} role="status" aria-atomic="true">
      {live && (
        <div className="canvas-activity" data-active={active} data-preview-ready={previewReady}>
          <div className="canvas-activity-aura" aria-hidden="true">
            {!active && <Check />}
          </div>
          <div className="canvas-activity-text">
            <strong>{phaseDetails[live.phase]}</strong>
            <span title={live.path}>{live.path}</span>
          </div>
        </div>
      )}
    </div>
  )
}
