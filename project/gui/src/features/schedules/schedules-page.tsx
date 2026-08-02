import { useMemo, useState } from 'react'
import { Pause, Play, Plus, RotateCcw, Archive } from 'lucide-react'
import { previewCron } from './cron'
import { useSchedules } from './use-schedules'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { BrailleLoader } from '#/components/ui/braille-loader'
import { Badge } from '#/components/ui/badge'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { toast } from '#/components/ui/toast'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#/components/ui/collapsible'
import { RunActivityRail } from '#/features/runs/run-activity-rail'

const defaultTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
const formatDate = (value?: number, timezone = defaultTimezone) =>
  value === undefined
    ? 'Not scheduled'
    : new Intl.DateTimeFormat([], {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: timezone,
      }).format(value)

const runBadgeVariant = (state: string) =>
  state === 'failed' ? 'destructive' : 'success'

const errorMessage = (reason: unknown) =>
  reason instanceof Error ? reason.message : 'Please try again.'

export function SchedulesPage() {
  const {
    schedules,
    agents,
    runs,
    loading,
    error,
    create,
    update,
    runNow,
    cancel,
  } = useSchedules()
  const [archived, setArchived] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string>()
  const [name, setName] = useState('')
  const [task, setTask] = useState('')
  const [cronExpression, setCronExpression] = useState('0 9 * * 5')
  const [timezone, setTimezone] = useState(defaultTimezone)
  const [agentDefinitionId, setAgentDefinitionId] =
    useState('software-engineer')
  const [formError, setFormError] = useState<string>()
  const [selectedRunId, setSelectedRunId] = useState<string>()
  const preview = useMemo(() => {
    try {
      return previewCron(cronExpression, timezone)
    } catch {
      return undefined
    }
  }, [cronExpression, timezone])
  const visible = schedules.filter((schedule) =>
    archived ? schedule.state === 'archived' : schedule.state !== 'archived',
  )
  const selectedRun = Object.values(runs)
    .flat()
    .find((run) => run.id === selectedRunId)
  const selectedSchedule = selectedRun
    ? schedules.find((schedule) => schedule.id === selectedRun.scheduleId)
    : undefined
  const startCreate = () => {
    setEditingId(undefined)
    setName('')
    setTask('')
    setCronExpression('0 9 * * 5')
    setTimezone(defaultTimezone)
    setAgentDefinitionId(agents[0]?.id ?? 'software-engineer')
    setCreating(true)
  }
  const runScheduleAction = (
    action: () => Promise<unknown>,
    title: string,
    description: string,
  ) => {
    void action()
      .then(() => toast.add({ type: 'success', title, description }))
      .catch((reason) =>
        toast.add({
          type: 'error',
          title: 'Schedule action failed',
          description: errorMessage(reason),
        }),
      )
  }

  if (loading)
    return (
      <div className="p-8 text-sm text-muted-foreground">
        <BrailleLoader text="Loading schedules" />
      </div>
    )
  return (
    <div className="flex min-h-0 flex-1">
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-5 sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold">Schedules</h1>
              <p className="text-sm text-muted-foreground">
                Recurring work shared by the workspace.
              </p>
            </div>
            <Button onClick={startCreate}>
              <Plus data-icon="inline-start" />
              New schedule
            </Button>
          </div>
          <Dialog open={creating} onOpenChange={setCreating}>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {editingId ? 'Edit schedule' : 'New schedule'}
                </DialogTitle>
                <DialogDescription>
                  Choose what should run and when it should run.
                </DialogDescription>
              </DialogHeader>
              <form
                className="grid gap-3"
                onSubmit={async (event) => {
                  event.preventDefault()
                  setFormError(undefined)
                  try {
                    if (editingId)
                      await update(editingId, {
                        name,
                        task,
                        cronExpression,
                        timezone,
                        agentDefinitionId,
                      })
                    else
                      await create({
                        name,
                        task,
                        cronExpression,
                        timezone,
                        agentDefinitionId,
                      })
                    setCreating(false)
                    setEditingId(undefined)
                    setName('')
                    setTask('')
                    toast.add({
                      type: 'success',
                      title: editingId
                        ? 'Schedule updated'
                        : 'Schedule created',
                      description: name,
                    })
                  } catch (reason) {
                    const message = errorMessage(reason)
                    setFormError(message)
                    toast.add({
                      type: 'error',
                      title: 'Unable to save schedule',
                      description: message,
                    })
                  }
                }}
              >
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Schedule name"
                  maxLength={50}
                  required
                />
                <Select
                  value={agentDefinitionId}
                  onValueChange={(value) => setAgentDefinitionId(value ?? '')}
                >
                  <SelectTrigger className="w-full" aria-label="Agent">
                    <SelectValue placeholder="Agent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {agents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <textarea
                  className="min-h-24 rounded-md border bg-background p-3 text-sm"
                  value={task}
                  onChange={(event) => setTask(event.target.value)}
                  placeholder="Task"
                  maxLength={10000}
                  required
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    value={cronExpression}
                    onChange={(event) => setCronExpression(event.target.value)}
                    aria-label="Cron expression"
                  />
                  <Input
                    value={timezone}
                    onChange={(event) => setTimezone(event.target.value)}
                    aria-label="Timezone"
                  />
                </div>
                {preview ? (
                  <p className="text-sm text-muted-foreground">
                    {preview.description} ·{' '}
                    {preview.nextRuns
                      .map((date) => formatDate(date, timezone))
                      .join(' · ')}
                  </p>
                ) : (
                  <p className="text-sm text-destructive">
                    Enter a valid five-field cron and IANA timezone.
                  </p>
                )}
                {formError && (
                  <p className="text-sm text-destructive">{formError}</p>
                )}
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCreating(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={!preview}>
                    {editingId ? 'Save changes' : 'Save schedule'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <Tabs
            className="flex-col"
            value={archived ? 'archived' : 'active'}
            onValueChange={(value) => setArchived(value === 'archived')}
          >
            <TabsList>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="archived">Archived</TabsTrigger>
            </TabsList>
            <TabsContent value={archived ? 'archived' : 'active'}>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {!visible.length && (
                <p className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
                  No schedules here yet.
                </p>
              )}
              <div className="grid gap-3">
                {visible.map((schedule) => {
                  const history = runs[schedule.id] ?? []
                  const latest = history.at(-1)
                  return (
                    <Card key={schedule.id}>
                      <CardHeader>
                        <CardTitle className="flex flex-wrap items-center gap-2">
                          <h2>{schedule.name}</h2>
                          <Badge variant="secondary">{schedule.state}</Badge>
                        </CardTitle>
                        <CardDescription>
                          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                            <span>
                              {
                                previewCron(
                                  schedule.cronExpression,
                                  schedule.timezone,
                                ).description
                              }
                            </span>
                            <code className="font-mono text-[0.7rem]">
                              {schedule.cronExpression}
                            </code>
                            <span>· {schedule.timezone}</span>
                            <span>· {schedule.createdBy.name}</span>
                          </div>
                        </CardDescription>
                        {schedule.state !== 'archived' && (
                          <CardAction>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                runScheduleAction(
                                  () => runNow(schedule.id),
                                  'Run started',
                                  schedule.name,
                                )
                              }
                            >
                              <Play data-icon="inline-start" />
                              Run now
                            </Button>
                          </CardAction>
                        )}
                      </CardHeader>
                      <CardContent className="flex flex-col gap-4">
                        <p className="whitespace-pre-wrap text-sm">
                          {schedule.task}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Next run:{' '}
                          {formatDate(schedule.nextRunAt, schedule.timezone)}
                          {latest ? ` · Latest: ${latest.state}` : ''}
                        </p>
                        {!!history.length && (
                          <Collapsible>
                            <CollapsibleTrigger
                              render={
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                />
                              }
                            >
                              View history ({history.length})
                            </CollapsibleTrigger>
                            <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden pt-2 transition-[height,opacity] duration-200 ease-out motion-reduce:transition-none data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 [&[hidden]:not([hidden='until-found'])]:hidden">
                              <div className="overflow-hidden rounded-md border divide-y">
                                {history.map((run) => (
                                  <button
                                    type="button"
                                    key={run.id}
                                    onClick={() => setSelectedRunId(run.id)}
                                    aria-pressed={selectedRunId === run.id}
                                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none aria-pressed:bg-accent"
                                  >
                                    <span className="flex min-w-0 flex-col gap-0.5">
                                      <span className="font-medium">
                                        {run.source === 'automatic'
                                          ? 'Automatic'
                                          : 'Run now'}
                                      </span>
                                      <span className="text-xs text-muted-foreground">
                                        {formatDate(
                                          run.createdAt,
                                          schedule.timezone,
                                        )}
                                      </span>
                                    </span>
                                    <Badge variant={runBadgeVariant(run.state)}>
                                      {run.state}
                                    </Badge>
                                  </button>
                                ))}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        )}
                      </CardContent>
                      <CardFooter className="flex flex-wrap gap-2 border-t">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(schedule.id)
                            setName(schedule.name)
                            setTask(schedule.task)
                            setCronExpression(schedule.cronExpression)
                            setTimezone(schedule.timezone)
                            setAgentDefinitionId(schedule.agentDefinitionId)
                            setCreating(true)
                          }}
                        >
                          Edit
                        </Button>
                        {schedule.state === 'active' ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              runScheduleAction(
                                () => update(schedule.id, { state: 'paused' }),
                                'Schedule paused',
                                schedule.name,
                              )
                            }
                          >
                            <Pause data-icon="inline-start" />
                            Pause
                          </Button>
                        ) : schedule.state === 'paused' ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              runScheduleAction(
                                () => update(schedule.id, { state: 'active' }),
                                'Schedule resumed',
                                schedule.name,
                              )
                            }
                          >
                            <Play data-icon="inline-start" />
                            Resume
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              runScheduleAction(
                                () => update(schedule.id, { state: 'paused' }),
                                'Schedule restored',
                                schedule.name,
                              )
                            }
                          >
                            <RotateCcw data-icon="inline-start" />
                            Restore
                          </Button>
                        )}
                        {schedule.state !== 'archived' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              runScheduleAction(
                                () =>
                                  update(schedule.id, { state: 'archived' }),
                                'Schedule archived',
                                schedule.name,
                              )
                            }
                          >
                            <Archive data-icon="inline-start" />
                            Archive
                          </Button>
                        )}
                      </CardFooter>
                    </Card>
                  )
                })}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
      {selectedRun && selectedSchedule && (
        <RunActivityRail
          run={{
            ...selectedRun,
            roomId: '',
            requestedBy: selectedRun.startedBy ?? {
              id: 'workspace',
              name: 'Workspace',
            },
            stdout: '',
            attribution:
              selectedRun.source === 'automatic'
                ? `Automatic · scheduled for ${formatDate(selectedRun.scheduledFor, selectedSchedule.timezone)}`
                : `Run now by @${selectedRun.startedBy?.name ?? 'member'}`,
          }}
          stepsPath={`/api/schedule-runs/${selectedRun.id}/steps`}
          liveSteps={[]}
          onClose={() => setSelectedRunId(undefined)}
          onCancel={() =>
            runScheduleAction(
              () => cancel(selectedRun.id),
              'Run cancelled',
              selectedSchedule.name,
            )
          }
        />
      )}
    </div>
  )
}
