import { Markdown } from '#/components/markdown'
import { BrailleLoader } from '#/components/ui/braille-loader'
import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'
import { toast } from '#/components/ui/toast'
import {
  IssuePriorityIcon,
  IssueStatusIcon,
} from '#/features/issues/components/issue-icons'
import { CornerDownRight } from 'lucide-react'
import { useState } from 'react'
import type { Grill, GrillProposedIssue } from '../types'
import {
  useConfirmGrillProposal,
  useDismissGrillProposal,
  usePushBackGrillProposal,
} from '../use-grills'

function proposedIssueDepth(
  issuesByKey: Map<string, GrillProposedIssue>,
  key: string,
  seen = new Set<string>(),
): number {
  const issue = issuesByKey.get(key)
  if (!issue?.parentKey || seen.has(key)) return 0
  seen.add(key)
  return 1 + proposedIssueDepth(issuesByKey, issue.parentKey, seen)
}

function orderProposedIssues(
  issues: GrillProposedIssue[],
): Array<GrillProposedIssue & { depth: number }> {
  const byKey = new Map(issues.map((issue) => [issue.key, issue]))
  return [...issues]
    .map((issue) => ({
      ...issue,
      depth: proposedIssueDepth(byKey, issue.key),
    }))
    .sort((a, b) => {
      const depthDiff = a.depth - b.depth
      if (depthDiff !== 0) return depthDiff
      return a.key.localeCompare(b.key)
    })
}

function GrillProposedIssueRow({
  issue,
  depth,
}: {
  issue: GrillProposedIssue
  depth: number
}) {
  return (
    <li className="border-b border-border/40 last:border-b-0">
      <div
        className="flex min-h-9 items-center gap-2 px-3 py-1.5 text-sm"
        style={depth > 0 ? { paddingLeft: 12 + depth * 16 } : undefined}
      >
        {depth > 0 ? (
          <CornerDownRight
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
        ) : null}
        <IssuePriorityIcon priority="none" />
        <IssueStatusIcon status="backlog" />
        <span className="min-w-0 flex-1 truncate font-medium">{issue.title}</span>
      </div>
      {issue.description?.trim() ? (
        <div
          className="border-t border-border/30 bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
          style={
            depth > 0 ? { paddingLeft: 12 + depth * 16 + 12 } : undefined
          }
        >
          <Markdown>{issue.description}</Markdown>
        </div>
      ) : null}
    </li>
  )
}

function GrillProposedIssueTree({ issues }: { issues: GrillProposedIssue[] }) {
  const ordered = orderProposedIssues(issues)
  return (
    <ul className="overflow-hidden rounded-md border border-border/60">
      {ordered.map((issue) => (
        <GrillProposedIssueRow
          key={issue.key}
          issue={issue}
          depth={issue.depth}
        />
      ))}
    </ul>
  )
}

export function ProposalPanel({ grill }: { grill: Grill }) {
  const proposal = grill.issueProposal
  const pushBack = usePushBackGrillProposal(grill.id)
  const confirm = useConfirmGrillProposal(grill.id)
  const dismiss = useDismissGrillProposal(grill.id)
  const [notes, setNotes] = useState('')
  if (!proposal) return null

  const open =
    proposal.status === 'proposed' || proposal.status === 'revision_requested'

  return (
    <div className="space-y-3 rounded-lg border p-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out fill-mode-both motion-reduce:animate-none">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Issue proposal</h3>
        <span className="text-xs text-muted-foreground">{proposal.status}</span>
      </div>
      {proposal.revisionNotes && (
        <p className="text-xs text-muted-foreground">
          Revision notes: {proposal.revisionNotes}
        </p>
      )}
      <GrillProposedIssueTree issues={proposal.issues} />
      {open ? (
        <div className="space-y-2">
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Revision notes for push-back"
            rows={2}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pushBack.isPending || !notes.trim()}
              onClick={() => {
                void pushBack
                  .mutateAsync(notes.trim())
                  .then(() => setNotes(''))
                  .catch((reason) => {
                    toast.add({
                      title:
                        reason instanceof Error
                          ? reason.message
                          : 'Unable to push back',
                      type: 'error',
                    })
                  })
              }}
            >
              Push back
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={dismiss.isPending}
              onClick={() => {
                void dismiss.mutateAsync().catch((reason) => {
                  toast.add({
                    title:
                      reason instanceof Error
                        ? reason.message
                        : 'Unable to skip Issues',
                    type: 'error',
                  })
                })
              }}
            >
              Skip Issues
            </Button>
            <Button
              type="button"
              disabled={confirm.isPending}
              onClick={() => {
                void confirm.mutateAsync().catch((reason) => {
                  toast.add({
                    title:
                      reason instanceof Error
                        ? reason.message
                        : 'Unable to confirm',
                    type: 'error',
                  })
                })
              }}
            >
              {confirm.isPending ? (
                <BrailleLoader
                  text={
                    grill.kind === 'code'
                      ? 'Materializing branch in github'
                      : 'Confirming Issues'
                  }
                />
              ) : (
                'Confirm Issues'
              )}
            </Button>
          </div>
          {grill.kind === 'general' ? (
            <p className="text-xs text-muted-foreground">
              Skip Issues if the Doc writeup is enough — nothing is minted.
            </p>
          ) : null}
        </div>
      ) : proposal.status === 'dismissed' ? (
        <p className="text-xs text-muted-foreground">
          Issue tree skipped — no Issues were created.
        </p>
      ) : null}
    </div>
  )
}
