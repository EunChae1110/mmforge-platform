import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Copy, Ellipsis, ExternalLink, Github, LayoutTemplate, PanelLeftClose, PanelLeftOpen, SquareDashed } from 'lucide-react'
import { Component, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import designEdits from 'virtual:design-edits'
import { CanvasStage } from './CanvasStage'
import { DesignActivityNotice, useDesignActivity } from './DesignActivityNotice'
import { ReleaseUpdates } from './ReleaseUpdates'
import { designSavedEvent, type DesignSaved } from './designActivity'

type DesignModule = {
  default?: ComponentType
  previewWidth?: number
}

const modules = import.meta.glob<DesignModule>('/designs/*.tsx', { eager: true })
const designs = Object.entries(modules).map(([path, module]) => ({
  filename: path.slice('/designs/'.length),
  Preview: module.default,
  width: module.previewWidth,
}))

const editTimeFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

function designUrl(filename: string | null) {
  const url = new URL(location.href)
  if (filename === null) url.searchParams.delete('design')
  else url.searchParams.set('design', filename)
  return url
}

class PreviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return <p className="canvas-message" data-mmforge-preview-error role="alert">This design couldn’t render. Check the browser console.</p>
    }
    return this.props.children
  }
}

export function Canvas() {
  const [filename, setFilename] = useState(() => new URLSearchParams(location.search).get('design'))
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [copyStatus, setCopyStatus] = useState<{ text: string } | null>(null)
  const controlsRef = useRef<HTMLDivElement>(null)
  const activity = useDesignActivity()
  const activityActive = activity !== null && activity.phase !== 'done'

  const design = designs.find((item) => item.filename === filename)
  const Preview = design?.Preview
  const SidebarIcon = sidebarOpen ? PanelLeftClose : PanelLeftOpen
  const sidebarAction = sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'

  useEffect(() => {
    const hot = import.meta.hot
    if (!hot) return

    function followSavedDesign({ filename: next, owners }: DesignSaved) {
      const current = new URLSearchParams(location.search).get('design')
      if (!current || current === next || owners.includes(current)) return

      const target = designs.find((item) => item.filename === next)
      const destination = target && !target.Preview ? null : next
      // Update the URL before Vite reloads the page to discover newly added designs.
      history.replaceState({ ...history.state, followDesign: destination }, '', designUrl(destination))
      setFilename(destination)
    }

    hot.on(designSavedEvent, followSavedDesign)
    return () => hot.off(designSavedEvent, followSavedDesign)
  }, [])

  useEffect(() => {
    const pending = history.state?.followDesign
    if (!pending || pending !== filename || !design) return

    const destination = design.Preview ? filename : null
    history.replaceState({ ...history.state, followDesign: null }, '', designUrl(destination))
    if (!destination) setFilename(null)
  }, [design, filename])

  useEffect(() => {
    if (!copyStatus) return
    const timeout = window.setTimeout(() => setCopyStatus(null), 3000)
    return () => window.clearTimeout(timeout)
  }, [copyStatus])

  function selectDesign(nextFilename: string | null) {
    history.replaceState({ ...history.state, followDesign: null }, '', designUrl(nextFilename))
    setFilename(nextFilename)
  }

  async function copyDesignPath(filename: string) {
    try {
      await navigator.clipboard.writeText('designs/' + filename)
      setCopyStatus({ text: 'Path copied' })
    } catch {
      setCopyStatus({ text: 'Couldn’t copy path' })
    }
  }

  return (
    <div className="canvas">
      <div className="canvas-controls" data-sidebar-open={sidebarOpen} ref={controlsRef}>
        <div className="canvas-title">
          <button
            type="button"
            className="canvas-icon-button canvas-sidebar-toggle"
            aria-label={sidebarAction}
            title={sidebarAction}
            aria-controls="design-sidebar"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen((open) => !open)}
          >
            <img src={import.meta.env.BASE_URL + 'mmforge-icon.png'} width={28} height={28} alt="" draggable={false} />
            <SidebarIcon aria-hidden="true" />
          </button>
          <h1>MMForge platform</h1>
        </div>
        <div className="canvas-sidebar" inert={!sidebarOpen} aria-hidden={!sidebarOpen}>
          <nav id="design-sidebar" className="canvas-files" aria-label="Design files">
            <div className="canvas-files-header">
              <h2>Designs</h2>
              <button
                type="button"
                className="canvas-file-clear"
                aria-label="Blank canvas"
                title="Blank canvas"
                disabled={filename === null}
                onClick={() => selectDesign(null)}
              >
                <SquareDashed size={13} aria-hidden="true" />
              </button>
            </div>
            <ul className="canvas-file-list">
              {designs.map(({ filename }) => {
                const name = filename.slice(0, -'.tsx'.length)
                const lastEdit = designEdits[filename]
                const editId = 'design-edit-' + encodeURIComponent(filename)
                return (
                  <li className="canvas-file-row" key={filename} data-selected={design?.filename === filename}>
                    <button
                      type="button"
                      className="canvas-file"
                      aria-label={name}
                      aria-describedby={lastEdit ? editId : undefined}
                      title={name}
                      aria-pressed={design?.filename === filename}
                      onClick={() => selectDesign(filename)}
                    >
                      <LayoutTemplate size={15} aria-hidden="true" />
                      <span className="canvas-file-details">
                        <span className="canvas-file-name">{name}</span>
                        {lastEdit && (
                          <time id={editId} dateTime={lastEdit} title={new Date(lastEdit).toLocaleString()}>
                            Edited {editTimeFormat.format(new Date(lastEdit))}
                          </time>
                        )}
                      </span>
                    </button>
                    <DropdownMenu.Root modal={false}>
                      <DropdownMenu.Trigger
                        className="canvas-icon-button canvas-file-more"
                        aria-label={'More options for ' + name}
                        title="More options"
                      >
                        <Ellipsis aria-hidden="true" />
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content className="canvas-file-menu" align="end" sideOffset={6} collisionPadding={8}>
                          <DropdownMenu.Group>
                            <DropdownMenu.Item className="canvas-file-menu-item" asChild>
                              <a href={designUrl(filename).href} target="_blank" rel="noopener noreferrer">
                                <ExternalLink aria-hidden="true" />
                                Open in new tab
                              </a>
                            </DropdownMenu.Item>
                            <DropdownMenu.Item className="canvas-file-menu-item" onSelect={() => void copyDesignPath(filename)}>
                              <Copy aria-hidden="true" />
                              Copy file path
                            </DropdownMenu.Item>
                          </DropdownMenu.Group>
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  </li>
                )
              })}
            </ul>
            <div className="canvas-copy-status" role="status">{copyStatus?.text}</div>
          </nav>
        </div>
      </div>
      <a
        className="canvas-icon-button canvas-corner-button canvas-repo-link"
        href="https://github.com/EunChae1110/mmforge-platform"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="MMForge on GitHub (opens in a new tab)"
        title="MMForge on GitHub"
      >
        <Github aria-hidden="true" />
      </a>
      {import.meta.env.DEV && <ReleaseUpdates activityActive={activityActive} />}

      <CanvasStage
        key={filename ?? undefined}
        designPath={Preview ? 'designs/' + design.filename : undefined}
        previewWidth={design?.width ?? 536}
        controlsRef={controlsRef}
        sidebarOpen={sidebarOpen}
        previewLocked={activityActive}
      >
        {Preview ? (
          <PreviewBoundary>
            <Preview />
          </PreviewBoundary>
        ) : (
          <p className="canvas-empty">
            {design && 'Export a React component as the default export to preview this design.'}
            {!design && filename && 'Design not found. Choose a design from the sidebar.'}
            {!design && !filename && (designs.length ? 'Choose a design from the sidebar.' : 'Add a TSX file to designs/ to preview a menu.')}
          </p>
        )}
      </CanvasStage>
      <DesignActivityNotice live={activity} active={activityActive} />
    </div>
  )
}
