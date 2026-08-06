import { Markdown } from '#/components/markdown'
import { BrailleLoader } from '#/components/ui/braille-loader'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '#/components/ui/breadcrumb'
import { Button } from '#/components/ui/button'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '#/components/ui/tabs'
import { toast } from '#/components/ui/toast'
import { useWindowKeydown } from '#/hooks/use-window-keydown'
import { Plus } from 'lucide-react'
import type { KeyboardEvent, ReactNode } from 'react'
import { useState } from 'react'
import { formatIssueId } from './format'
import { IssueStatusIcon } from './issue-icons'
import {
  OwnerPicker,
  PriorityPicker,
  StatusPicker,
  TagsEditor,
  TimeSpentEditor,
} from './issue-property-editors'
import { IssueRunsRail } from './issue-runs-rail'
import { ParentCoverAlert } from './parent-cover-alert'
import type { Issue } from './types'
import { useIssue, useIssues, useUpdateIssue } from './use-issues'

function RailRow({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="w-20 shrink-0 pt-1.5 text-xs text-muted-foreground">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function EditableTitle({ issue }: { issue: Issue }) {
  const updateIssue = useUpdateIssue()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(issue.title)

  const begin = () => {
    setDraft(issue.title)
    setEditing(true)
  }

  const save = async () => {
    const trimmed = draft.trim()
    if (!trimmed) {
      setDraft(issue.title)
      setEditing(false)
      return
    }
    if (trimmed === issue.title) {
      setEditing(false)
      return
    }
    try {
      await updateIssue.mutateAsync({ id: issue.id, title: trimmed })
      setEditing(false)
    } catch (reason) {
      toast.add({
        type: 'error',
        title: 'Could not update title',
        description:
          reason instanceof Error ? reason.message : 'Please try again.',
      })
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      void save()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void save()}
        onKeyDown={onKeyDown}
        className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        aria-label="Issue title"
        disabled={updateIssue.isPending}
      />
    )
  }

  return (
    <button
      type="button"
      className="w-full rounded-sm text-left text-2xl font-semibold tracking-tight outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/40"
      onClick={begin}
    >
      {issue.title}
    </button>
  )
}

function EditableDescription({ issue }: { issue: Issue }) {
  const updateIssue = useUpdateIssue()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(issue.description)

  const begin = () => {
    setDraft(issue.description)
    setEditing(true)
  }

  const save = async () => {
    if (draft === issue.description) {
      setEditing(false)
      return
    }
    try {
      await updateIssue.mutateAsync({ id: issue.id, description: draft })
      setEditing(false)
    } catch (reason) {
      toast.add({
        type: 'error',
        title: 'Could not update description',
        description:
          reason instanceof Error ? reason.message : 'Please try again.',
      })
    }
  }

  if (editing) {
    return (
      <textarea
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void save()}
        rows={8}
        className="w-full resize-y rounded-sm bg-transparent text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        aria-label="Issue description"
        disabled={updateIssue.isPending}
      />
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className="w-full cursor-text rounded-sm text-left text-sm leading-relaxed outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/40"
      onClick={begin}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          begin()
        }
      }}
    >
      {issue.description.trim() ? (
        <Markdown>{issue.description}</Markdown>
      ) : (
        <span className="text-muted-foreground">Add description…</span>
      )}
    </div>
  )
}

function SubIssuesSection({
  issue,
  onOpen,
  onAddSubIssue,
}: {
  issue: Issue
  onOpen: (issueId: string) => void
  onAddSubIssue: () => void
}) {
  const { data: issues = [] } = useIssues()
  const children = issues
    .filter((child) => child.parentId === issue.id)
    .sort((a, b) => a.number - b.number)

  return (
    <section className="mt-8 space-y-2">
      {children.length > 0 && (
        <ul className="overflow-hidden rounded-md border border-border/60">
          {children.map((child) => (
            <li key={child.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 border-b border-border/40 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/40"
                onClick={() => onOpen(child.id)}
              >
                <IssueStatusIcon status={child.status} />
                <span className="w-14 shrink-0 tabular-nums text-muted-foreground">
                  {formatIssueId(child.number)}
                </span>
                <span className="min-w-0 flex-1 truncate">{child.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={onAddSubIssue}
      >
        <Plus data-icon="inline-start" />
        Add sub-issue
      </Button>
    </section>
  )
}

export function IssueDetailPage({
  issueId,
  onBack,
  onOpenIssue,
  onAddSubIssue,
}: {
  issueId: string
  onBack: () => void
  onOpenIssue: (issueId: string) => void
  onAddSubIssue: (parentId: string) => void
}) {
  const { issue, isPending, isError, error } = useIssue(issueId)
  const { data: issues = [] } = useIssues()
  const parent = issue?.parentId
    ? issues.find((candidate) => candidate.id === issue.parentId)
    : undefined

  useWindowKeydown((event) => {
    if (event.key !== 'Escape') return
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const target = event.target as HTMLElement | null
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable)
    )
      return
    event.preventDefault()
    onBack()
  })

  if (isPending) {
    return (
      <div className="flex flex-1 justify-center py-12 text-sm text-muted-foreground">
        <BrailleLoader text="Loading issue…" />
      </div>
    )
  }

  if (isError || !issue) {
    return (
      <div className="flex flex-1 flex-col gap-3 px-6 py-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink
                render={
                  <button type="button" onClick={onBack} />
                }
              >
                Issues
              </BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <p className="text-sm text-destructive" role="alert">
          {error instanceof Error ? error.message : 'Issue not found'}
        </p>
      </div>
    )
  }

  const issueRef = formatIssueId(issue.number)
  const parentCovered = parent?.owner?.kind === 'agent'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center border-b border-border/60 px-4 py-2">
        <Breadcrumb className="min-w-0">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink
                render={
                  <button type="button" onClick={onBack} />
                }
              >
                Issues
              </BreadcrumbLink>
            </BreadcrumbItem>
            {parent && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem className="min-w-0">
                  <BreadcrumbLink
                    render={
                      <button
                        type="button"
                        className="max-w-40 truncate"
                        onClick={() => onOpenIssue(parent.id)}
                      />
                    }
                  >
                    <span className="tabular-nums">
                      {formatIssueId(parent.number)}
                    </span>
                    <span className="text-muted-foreground"> </span>
                    {parent.title}
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </>
            )}
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage className="min-w-0 truncate">
                <span className="tabular-nums text-muted-foreground">
                  {issueRef}
                </span>{' '}
                {issue.title}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-6 py-6 lg:px-10">
          <div className="mx-auto max-w-3xl">
            {parentCovered && parent ? (
              <ParentCoverAlert
                parent={parent}
                onOpenParent={() => onOpenIssue(parent.id)}
              />
            ) : null}
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <EditableTitle issue={issue} />
              </div>
            </div>
            <Tabs defaultValue="description" className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <TabsList variant="line">
                  <TabsTrigger value="description">Description</TabsTrigger>
                  <TabsTrigger value="deliverable">Deliverable</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="description" className="mt-3">
                <EditableDescription issue={issue} />
              </TabsContent>
              <TabsContent value="deliverable" className="mt-3">
                {issue.deliverable?.trim() ? (
                  <Markdown>{issue.deliverable}</Markdown>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No deliverable yet. It appears here when an Issue-linked run
                    succeeds.
                  </p>
                )}
              </TabsContent>
            </Tabs>
            <SubIssuesSection
              issue={issue}
              onOpen={onOpenIssue}
              onAddSubIssue={() => onAddSubIssue(issue.id)}
            />
          </div>
        </main>
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-border/60 px-4 py-5 sm:block lg:w-80">
          <section className="mb-5 space-y-0.5">
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">
              Properties
            </h3>
            <RailRow label="Status">
              <StatusPicker issue={issue} variant="rail" />
            </RailRow>
            <RailRow label="Priority">
              <PriorityPicker issue={issue} variant="rail" />
            </RailRow>
            <RailRow label="Assignee">
              <OwnerPicker issue={issue} />
            </RailRow>
          </section>
          <section className="mb-5">
            <TagsEditor issue={issue} />
          </section>
          <section className="mb-5">
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">
              Time spent
            </h3>
            <TimeSpentEditor issue={issue} />
          </section>
          {parent && (
            <section className="mb-5">
              <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                Parent
              </h3>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-1.5 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => onOpenIssue(parent.id)}
              >
                <IssueStatusIcon status={parent.status} />
                <span className="tabular-nums text-muted-foreground">
                  {formatIssueId(parent.number)}
                </span>
                <span className="min-w-0 truncate">{parent.title}</span>
              </button>
            </section>
          )}
          <IssueRunsRail issue={issue} />
        </aside>
      </div>
    </div>
  )
}
