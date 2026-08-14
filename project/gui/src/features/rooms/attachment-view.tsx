import { useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { Download, X } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { toast } from '#/components/ui/toast'
import { formatBytes } from './format'
import type { RoomAttachment } from './types'
import {
  useAttachmentBlob,
  useEnsureAttachmentObjectUrl,
} from './use-attachment-blob'

const previewTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
])

export function AttachmentView({ attachment }: { attachment: RoomAttachment }) {
  const [open, setOpen] = useState(false)
  const preview = previewTypes.has(attachment.contentType)
  const { url } = useAttachmentBlob(attachment.id, preview)
  const ensureAttachmentObjectUrl = useEnsureAttachmentObjectUrl()
  const download = async () => {
    try {
      const objectUrl = await ensureAttachmentObjectUrl(attachment.id)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = attachment.filename
      link.click()
      toast.add({
        title: 'Download started',
        description: attachment.filename,
        type: 'success',
      })
    } catch {
      toast.add({
        title: 'Download failed',
        description: attachment.filename,
        type: 'error',
      })
    }
  }
  if (preview && url)
    return (
      <>
        <div className="relative w-fit max-w-full rounded-lg bg-muted p-2">
          <button
            type="button"
            className="block max-w-full"
            aria-label={`Preview ${attachment.filename}`}
            onClick={() => setOpen(true)}
          >
            <img
              src={url}
              alt={attachment.filename}
              className="h-auto max-h-[20rem] w-auto max-w-[min(100%,28rem)] rounded-md border object-contain bg-muted"
            />
          </button>
          <Button
            type="button"
            variant="secondary"
            size="icon-xs"
            className="absolute right-3 bottom-3 shadow-sm cursor-pointer hover:bg-muted"
            aria-label={`Download ${attachment.filename}`}
            onClick={() => void download()}
          >
            <Download />
          </Button>
        </div>
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Portal>
            <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/80 transition-opacity duration-200 data-starting-style:opacity-0 data-ending-style:opacity-0" />
            <Dialog.Popup className="fixed inset-0 z-50 m-auto h-fit w-fit max-h-[100dvh] max-w-[100vw] overflow-hidden rounded-xl bg-muted p-3 outline-none transition-opacity duration-200 ease-out data-starting-style:opacity-0 data-ending-style:opacity-0">
              <Dialog.Title className="sr-only">
                {attachment.filename}
              </Dialog.Title>
              <img
                src={url}
                alt={attachment.filename}
                className="block h-auto max-h-[min(70dvh,40rem)] w-auto max-w-[min(70vw,56rem)] object-contain"
              />
              <div className="absolute top-3 right-3 flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-sm"
                  aria-label={`Download ${attachment.filename}`}
                  onClick={() => void download()}
                >
                  <Download />
                </Button>
                <Dialog.Close
                  aria-label="Close image preview"
                  className="inline-flex size-8 items-center justify-center rounded-md bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80"
                >
                  <X className="size-4" />
                </Dialog.Close>
              </div>
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      </>
    )
  return (
    <button
      type="button"
      className="flex max-w-full items-center gap-2 rounded-md border px-2 py-1 text-left text-xs hover:bg-muted"
      onClick={() => void download()}
    >
      <span className="truncate">{attachment.filename}</span>
      <span className="shrink-0 text-muted-foreground">
        {formatBytes(attachment.byteSize)}
      </span>
    </button>
  )
}
