import { StaticDither } from '#/components/static-dither'
import { CircleX } from 'lucide-react'
import { previewIframeSrc } from '../preview-frame'
import type { Machine } from '../types'

/** Preview, or why there isn't one yet. Both surfaces fill their own frame. */
function MachinePreviewBody({
  machine,
  iframeClassName,
}: {
  machine: Machine
  iframeClassName: string
}) {
  if (machine.previewError)
    return (
      <div
        className="absolute inset-0 flex flex-col gap-2 overflow-hidden p-4"
        role="alert"
      >
        <p className="flex items-center gap-2 text-sm font-medium text-destructive">
          <CircleX className="size-4 shrink-0" />
          Preview failed
        </p>
        <pre className="min-h-0 flex-1 overflow-auto text-xs leading-5 whitespace-pre-wrap text-destructive/90">
          {machine.previewError}
        </pre>
      </div>
    )
  if (machine.previewUrl && machine.previewReady)
    return (
      <iframe
        key={machine.previewUrl}
        src={previewIframeSrc(machine.previewUrl, window.location.hostname)}
        title={`${machine.id} Preview`}
        className={iframeClassName}
        sandbox="allow-downloads allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
      />
    )
  if (machine.previewUrl)
    return (
      <div
        className="absolute inset-0 grid place-items-center overflow-hidden"
        role="status"
      >
        <StaticDither speed={0.35} lightOpacity={0.30} darkOpacity={0.15} />
      </div>
    )
  return (
    <div className="absolute inset-0 grid place-items-center bg-muted/50">
      <p className="text-sm text-muted-foreground">No Preview</p>
    </div>
  )
}

export function MachinePreviewFill({ machine }: { machine: Machine }) {
  return (
    <div className="size-full min-h-0 p-3">
      <div className="relative size-full min-h-0 overflow-hidden rounded-md bg-background shadow-sm ring-1 ring-foreground/10">
        <MachinePreviewBody
          machine={machine}
          iframeClassName="absolute inset-0 size-full bg-white"
        />
      </div>
    </div>
  )
}

/**
 * Card thumbnail. The iframe renders at a 1280x800 desktop viewport and is
 * scaled to the card, so Preview is shown zoomed out rather than cropped.
 * Length / length: `scale()` needs a number, and `100cqi / 1280px` is one.
 */
export function MachinePreviewThumbnail({ machine }: { machine: Machine }) {
  return (
    <div className="px-3">
      <div className="@container relative aspect-[16/10] overflow-hidden rounded-md bg-background shadow-sm ring-1 ring-foreground/10">
        <MachinePreviewBody
          machine={machine}
          iframeClassName="pointer-events-none absolute top-0 left-0 h-[800px] w-[1280px] origin-top-left [transform:scale(calc(100cqi/1280px))] bg-white"
        />
        <div className="pointer-events-none absolute inset-0 grid place-items-center transition-colors group-hover/card:bg-background/40">
          <span className="rounded-md bg-background/90 px-2 py-1 text-xs font-medium opacity-0 shadow-sm ring-1 ring-foreground/10 transition-opacity group-hover/card:opacity-100">
            Open machine
          </span>
        </div>
      </div>
    </div>
  )
}
