import { Button } from '#/components/ui/button'

/** Shown under a Chamber message waiting for the agent's current run. */
export function QueuedNote({ onCancel }: { onCancel?: () => void }) {
  return (
    <span className="flex items-center gap-2 text-xs text-muted-foreground">
      Queued · sends when the agent finishes
      {onCancel && (
        <Button type="button" variant="ghost" size="xs" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </span>
  )
}
