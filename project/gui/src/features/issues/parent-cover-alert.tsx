import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '#/components/ui/alert'
import { useTheme } from '#/components/theme-provider'
import {
  agentNameFrom,
  useAgentDefinitions,
} from '#/features/agents/use-agent-definitions'
import { terminal } from '#/features/runs/run-helpers'
import { Dithering } from '@paper-design/shaders-react'
import { formatIssueId } from './format'
import type { Issue } from './types'
import { useIssueRuns } from './use-issue-runs'

function CoverDither({ active }: { active: boolean }) {
  const { theme } = useTheme()
  const dark =
    theme === 'dark' ||
    (theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)
  const reducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] opacity-40"
      aria-hidden="true"
    >
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
  )
}

/** Shown on a child Issue when its parent is owned by an agent. */
export function ParentCoverAlert({
  parent,
  onOpenParent,
}: {
  parent: Issue
  onOpenParent: () => void
}) {
  const { data: parentRuns = [] } = useIssueRuns(parent.id)
  const { data: agents = [] } = useAgentDefinitions()
  const active = parentRuns.some((run) => !terminal(run.state))
  const agentLabel =
    parent.owner?.kind === 'agent'
      ? agentNameFrom(agents, parent.owner.id)
      : 'an agent'

  return (
    <Alert className="relative mb-4 overflow-hidden border-border/70">
      <CoverDither active={active} />
      <div className="relative">
        <AlertTitle>
          {active
            ? `Being worked on by ${agentLabel}`
            : `Covered by ${agentLabel} on the parent Issue`}
        </AlertTitle>
        <AlertDescription>
          Parent{' '}
          <button
            type="button"
            className="font-medium text-foreground underline-offset-2 hover:underline"
            onClick={onOpenParent}
          >
            {formatIssueId(parent.number)}
          </button>{' '}
          {active
            ? 'has an active Issue-linked run that includes this sub-issue as context. Start run is blocked here.'
            : 'is owned by an agent. Sub-issue Start run stays blocked; Cursor subagents handle fan-out inside the parent run.'}
        </AlertDescription>
      </div>
    </Alert>
  )
}
