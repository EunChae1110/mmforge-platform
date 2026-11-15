import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Copy, Ellipsis, ExternalLink, Github, LayoutTemplate, PanelLeftClose, PanelLeftOpen, SquareDashed, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react'
import designEdits from 'virtual:design-edits'
import { CanvasStage } from './CanvasStage'
import { PreviewBoundary } from './PreviewBoundary'
import { DeleteFileDialog } from '../designs/DeleteFileDialog'
import { useDesignActivity } from '../designs/DesignActivityNotice'
import { designSavedEvent, type DesignSaved } from '../shared/designActivity'
import { designDeletedEvent, type DesignDeleted } from '../shared/designFiles'
import { ReleaseUpdates } from '../updates/ReleaseUpdates'

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

export function Canvas() {
  const [filename, setFilename] = useState(() => new URLSearchParams(location.search).get('design'))
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [gameMode, setGameMode] = useState(false)
  const [gameScreenshot, setGameScreenshot] = useState<File | null>(null)
  const [copyStatus, setCopyStatus] = useState<{ text: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const controlsRef = useRef<HTMLDivElement>(null)
  const sidebarToggleRef = useRef<HTMLButtonElement>(null)
  const deleteTriggerRef = useRef<HTMLElement | null>(null)
  const activity = useDesignActivity()
  const activityActive = activity !== null && activity.phase !== 'done'

  const design = designs.find((item) => item.filename === filename)
  const Preview = design?.Preview
  const SidebarIcon = sidebarOpen ? PanelLeftClose : PanelLeftOpen
  const sidebarAction = sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'

  const selectDesign = useCallback((nextFilename: string | null) => {
    history.replaceState({ ...history.state, followDesign: null }, '', designUrl(nextFilename))
    setFilename(nextFilename)
  }, [])

  const clearDeletedSelection = useCallback((deleted: string) => {
    if (new URLSearchParams(location.search).get('design') === deleted) selectDesign(null)
  }, [selectDesign])

  useEffect(() => {
    const hot = import.meta.hot
    if (!hot) return

    function followSavedDesign({ filename: next, owners, widget }: DesignSaved) {
      const current = new URLSearchParams(location.search).get('design')
      if (!current || current === next || owners.includes(current)) return

      const target = designs.find((item) => item.filename === next)
      if (widget && !target?.Preview) return
      const destination = target && !target.Preview ? null : next
      // Update the URL before Vite reloads the page to discover newly added designs.
      history.replaceState({ ...history.state, followDesign: destination }, '', designUrl(destination))
      setFilename(destination)
    }

    function followDeletedDesign({ filename }: DesignDeleted) {
      clearDeletedSelection(filename)
    }

    hot.on(designSavedEvent, followSavedDesign)
    hot.on(designDeletedEvent, followDeletedDesign)
    return () => {
      hot.off(designSavedEvent, followSavedDesign)
      hot.off(designDeletedEvent, followDeletedDesign)
    }
  }, [clearDeletedSelection])

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

  function dismissDeleteDialog(deleted: boolean) {
    const trigger = deleteTriggerRef.current
    deleteTriggerRef.current = null
    setDeleteTarget(null)
    if (!deleted && trigger?.isConnected) trigger.focus()
    else sidebarToggleRef.current?.focus()
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
    <div className="canvas" data-game-mode={gameMode}>
      <div className="canvas-controls" data-sidebar-open={sidebarOpen} ref={controlsRef}>
        <div className="canvas-title">
          <button
            ref={sidebarToggleRef}
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
                const menuId = 'design-menu-' + encodeURIComponent(filename)
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
                        id={menuId}
                        className="canvas-icon-button canvas-file-more"
                        aria-label={'More options for ' + name}
                        title="More options"
                      >
                        <Ellipsis aria-hidden="true" />
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content
                          className="canvas-file-menu"
                          align="end"
                          sideOffset={6}
                          collisionPadding={8}
                          onCloseAutoFocus={event => {
                            if (deleteTriggerRef.current?.id === menuId) event.preventDefault()
                          }}
                        >
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
                          {import.meta.env.MMFORGE_LOCAL_ACTIONS && (
                            <>
                              <DropdownMenu.Separator className="canvas-file-menu-separator" />
                              <DropdownMenu.Item className="canvas-file-menu-item canvas-file-menu-danger" onSelect={() => {
                                deleteTriggerRef.current = document.getElementById(menuId)
                                setDeleteTarget(filename)
                              }}>
                                <Trash2 aria-hidden="true" />
                                Delete file
                              </DropdownMenu.Item>
                            </>
                          )}
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
      >
        <Github aria-hidden="true" />
      </a>
      {import.meta.env.MMFORGE_LOCAL_ACTIONS && deleteTarget && (
        <DeleteFileDialog filename={deleteTarget} onDismiss={dismissDeleteDialog} onDeleted={clearDeletedSelection} />
      )}
      {import.meta.env.MMFORGE_LOCAL_ACTIONS && <ReleaseUpdates activityActive={activityActive} />}

      <CanvasStage
        key={filename ?? undefined}
        designPath={Preview ? 'designs/' + design.filename : undefined}
        previewWidth={design?.width ?? 536}
        controlsRef={controlsRef}
        sidebarOpen={sidebarOpen}
        previewLocked={activityActive}
        activity={activity}
        gameMode={gameMode}
        onGameModeChange={setGameMode}
        gameScreenshot={gameScreenshot}
        onGameScreenshotChange={setGameScreenshot}
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
    </div>
  )
}
