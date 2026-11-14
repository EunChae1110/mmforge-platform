import { Check, LoaderCircle } from 'lucide-react'
import { useEffect, useLayoutEffect, useState } from 'react'
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
  const [lastNotice, setLastNotice] = useState<{ activity: DesignActivity; active: boolean } | null>(null)
  const notice = live ? { activity: live, active } : lastNotice

  useLayoutEffect(() => {
    if (live) setLastNotice({ activity: live, active })
  }, [active, live])

  return (
    <>
      {active && (
        <div className="canvas-activity-backdrop" data-preview-ready={previewReady} aria-hidden="true">
          <div className="canvas-activity-aura" />
        </div>
      )}
      <div className="canvas-activity-announcement" role="status" aria-atomic="true">
        {notice && (
          <div className="canvas-activity" data-visible={Boolean(live)} data-active={notice.active} aria-hidden={!live}>
            <span className="canvas-activity-icon" aria-hidden="true">
              <LoaderCircle className="canvas-activity-spinner" />
              <Check className="canvas-activity-check" />
            </span>
            <div className="canvas-activity-text">
              <strong key={notice.activity.phase}>{phaseDetails[notice.activity.phase]}</strong>
              <span>{notice.activity.path}</span>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
