import { Download, RotateCw, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

type Release = { tag: string; version: string; notes: string; url: string }
type UpdateInfo = { version: string; update: Release | null }

const endpoint = import.meta.env.BASE_URL + '__mmforge/update'
const ignoredRelease = 'mmforge:ignored-release'
const pendingVersion = 'mmforge:pending-version'

async function request<T>(path = '', options?: RequestInit): Promise<T> {
  const response = await fetch(endpoint + path, options)
  const data = await response.json().catch(() => { throw new Error('The local update service is unavailable. Restart MMForge and check again.') })
  if (!response.ok) throw new Error(data.error ?? 'The update service is unavailable.')
  return data
}

export function ReleaseUpdates({ activityActive }: { activityActive: boolean }) {
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [checking, setChecking] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installed, setInstalled] = useState<string | null>(null)
  const [error, setError] = useState('')
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const offer = useRef<Release | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    void request<UpdateInfo>('', { signal: controller.signal }).then(data => {
      try {
        const pending = sessionStorage.getItem(pendingVersion)
        if (pending === data.version) {
          sessionStorage.removeItem(pendingVersion)
          setInstalled(data.version)
          setOpen(true)
        }
        if (data.update && localStorage.getItem(ignoredRelease) !== data.update.tag) offer.current = data.update
      } catch {
        offer.current = data.update
      }
      setInfo(data)
    }).catch(() => {})
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!activityActive && info?.update && offer.current === info.update) {
      offer.current = null
      setOpen(true)
    }
  }, [activityActive, info])

  useEffect(() => {
    const dialog = dialogRef.current!
    if (open && !dialog.open && !activityActive) dialog.showModal()
    if ((!open || activityActive) && dialog.open && !installing) dialog.close()
  }, [activityActive, installing, open])

  async function check() {
    setOpen(true)
    setError('')
    setChecking(true)
    try {
      setInfo(await request<UpdateInfo>())
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not check for updates.')
    } finally {
      setChecking(false)
    }
  }

  function keepVersion() {
    if (info?.update) {
      try { localStorage.setItem(ignoredRelease, info.update.tag) } catch { /* Storage is optional. */ }
    }
    setOpen(false)
  }

  async function install(release: Release) {
    setError('')
    setInstalling(true)
    try { sessionStorage.setItem(pendingVersion, release.version) } catch { /* Storage is optional. */ }
    try {
      const result = await request<{ installed: string }>('?tag=' + encodeURIComponent(release.tag), { method: 'POST' })
      setInstalled(result.installed)
      setInfo({ version: result.installed, update: null })
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not install the update.')
    } finally {
      try { sessionStorage.removeItem(pendingVersion) } catch { /* Storage is optional. */ }
      setInstalling(false)
    }
  }

  const release = info?.update

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="canvas-icon-button canvas-corner-button canvas-update-toggle"
        aria-label="Check for MMForge updates"
        title={info ? `Check for updates · v${info.version}` : 'Check for updates'}
        disabled={activityActive}
        onClick={() => installed ? setOpen(true) : void check()}
      >
        <Download aria-hidden="true" />
      </button>
      <dialog
        ref={dialogRef}
        className="canvas-update-dialog"
        aria-labelledby="canvas-update-title"
        onCancel={event => {
          event.preventDefault()
          if (!installing) setOpen(false)
        }}
        onClose={() => buttonRef.current?.focus()}
      >
        <header className="canvas-update-header">
          <h2 id="canvas-update-title">{installed ? 'Update installed' : release ? 'MMForge update available' : 'MMForge updates'}</h2>
          <button type="button" className="canvas-icon-button" aria-label="Close updates" disabled={installing} onClick={() => setOpen(false)}>
            <X aria-hidden="true" />
          </button>
        </header>
        {installed ? (
          <p role="status">MMForge v{installed} is installed. Restart the local canvas to load it.</p>
        ) : checking ? (
          <p role="status">Checking GitHub for updates…</p>
        ) : release ? (
          <>
            <p className="canvas-update-versions">v{info.version} → <strong>v{release.version}</strong></p>
            <div className="canvas-update-notes" role="region" aria-label="Release notes" tabIndex={0}>
              {release.notes.trim() || 'No release notes were published.'}
            </div>
            <a href={release.url} target="_blank" rel="noopener noreferrer">View release on GitHub</a>
          </>
        ) : info && !error ? (
          <p role="status">You’re on v{info.version}. No newer stable release is available.</p>
        ) : null}
        {error && <p className="canvas-update-error" role="alert">{error}</p>}
        {installing && <p role="status">Installing v{release?.version}…</p>}
        <footer className="canvas-update-actions">
          {release && !checking ? (
            <>
              <button type="button" disabled={installing} onClick={keepVersion}>Keep current version</button>
              <button type="button" className="canvas-update-primary" disabled={installing} onClick={() => void install(release)}>Install v{release.version}</button>
            </>
          ) : !installed && (
            <button type="button" disabled={checking} onClick={() => void check()}>
              <RotateCw size={14} aria-hidden="true" /> Check again
            </button>
          )}
        </footer>
      </dialog>
    </>
  )
}
