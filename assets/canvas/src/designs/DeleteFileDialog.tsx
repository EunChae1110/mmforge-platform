import { Trash2 } from 'lucide-react'
import { useId, useLayoutEffect, useRef, useState } from 'react'
import { designFileRoute } from '../shared/designFiles'
import './deleteFileDialog.css'

export function DeleteFileDialog({ filename, onDismiss, onDeleted }: {
  filename: string
  onDismiss: (deleted: boolean) => void
  onDeleted: (filename: string) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  useLayoutEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    cancelRef.current?.focus()
    return () => { if (dialog.open) dialog.close() }
  }, [])

  function dismiss(deleted: boolean) {
    ref.current?.close()
    onDismiss(deleted)
  }

  async function deleteFile() {
    if (deleting) return
    setDeleting(true)
    setError('')
    try {
      const url = import.meta.env.BASE_URL + designFileRoute.slice(1)
      const response = await fetch(url + '?' + new URLSearchParams({ filename }), { method: 'DELETE' })
      const result = await response.json().catch(() => null)
      if (!response.ok || result?.filename !== filename) {
        throw new Error(typeof result?.error === 'string' ? result.error : 'The local file service is unavailable. Restart MMForge and try again.')
      }
      onDeleted(filename)
      dismiss(true)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Couldn’t delete the file. Try again.')
      setDeleting(false)
    }
  }

  return (
    <dialog
      className="canvas-delete-dialog"
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={event => {
        event.preventDefault()
        if (!deleting) dismiss(false)
      }}
    >
      <div className="canvas-delete-icon"><Trash2 size={18} aria-hidden="true" /></div>
      <h2 id={titleId}>Delete design file?</h2>
      <p id={descriptionId}>This will permanently delete <strong>designs/{filename}</strong> from your workspace.</p>
      {error && <p className="canvas-delete-error" role="alert">{error}</p>}
      <footer className="canvas-delete-actions">
        <button type="button" ref={cancelRef} disabled={deleting} onClick={() => dismiss(false)}>Cancel</button>
        <button type="button" className="canvas-delete-confirm" disabled={deleting} onClick={() => void deleteFile()}>
          {deleting ? 'Deleting…' : 'Delete file'}
        </button>
      </footer>
    </dialog>
  )
}
