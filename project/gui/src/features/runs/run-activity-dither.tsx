import { Dithering } from '@paper-design/shaders-react'
import { X } from 'lucide-react'
import { AgentAnt } from '#/components/avatar'
import { useTheme } from '#/components/theme-provider'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { Button } from '#/components/ui/button'
import { terminal, type RunState } from './run-helpers'

function DitherTile({ active }: { active: boolean }) {
  const { theme } = useTheme()
  const dark =
    theme === 'dark' ||
    (theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)
  const reducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches

  return (
    <div className="relative grid w-24 shrink-0 place-items-center overflow-hidden">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <Dithering
          className="absolute inset-0"
          width="100%"
          height="100%"
          colorBack={dark ? '#1c1a19' : '#f0efe8'}
          colorFront={dark ? '#dedbd2' : '#282522'}
          shape="warp"
          type="4x4"
          size={2.5}
          scale={1}
          speed={active && !reducedMotion ? 0.35 : 0}
        />
      </div>
      <div className="relative grid size-11 place-items-center rounded-full bg-background shadow-sm">
        <Avatar className="size-9">
          <AvatarFallback className="bg-primary/10 text-primary">
            <AgentAnt className="size-5" />
          </AvatarFallback>
        </Avatar>
      </div>
    </div>
  )
}

export function RunActivitySplitHeader({
  agent,
  state,
  status,
  onClose,
  onCancel,
}: {
  agent: string
  state: RunState
  status: string
  onClose: () => void
  onCancel: () => void
}) {
  return (
    <header className="shrink-0 border-b p-3">
      <div className="flex min-h-24 overflow-hidden rounded-xl border bg-background shadow-sm">
        <DitherTile active={!terminal(state)} />
        <div className="flex min-w-0 flex-1 items-center gap-3 bg-background px-3 py-2">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold">Run activity</h2>
            <p
              key={status}
              className="truncate text-xs text-muted-foreground animate-in fade-in-0 slide-in-from-bottom-0.5 duration-300"
            >
              {agent} · {status}
            </p>
          </div>
          {!terminal(state) && (
            <Button type="button" variant="ghost" size="xs" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close run activity"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
      </div>
    </header>
  )
}
