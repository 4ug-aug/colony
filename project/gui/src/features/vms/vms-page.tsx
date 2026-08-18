import { StaticDither } from '#/components/static-dither'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '#/components/ui/alert-dialog'
import { Badge } from '#/components/ui/badge'
import { BrailleLoader } from '#/components/ui/braille-loader'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { apiJson, apiJsonBody } from '#/lib/api-transport'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  CircleX,
  ExternalLink,
  HardDrive,
  Network,
  Search,
  Skull,
  Timer,
  X,
} from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import {
  filterMachineLog,
  formatLogTime,
  parseMachineLog,
  type MachineLogLine,
} from './machine-log'
import { previewIframeSrc } from './preview-frame'

type Machine = {
  id: string
  state: string
  image: string
  createdAt: number
  mounts: number
  network: boolean
  previewUrl?: string
  previewReady?: boolean
  previewError?: string
}

type MachineLogs = {
  channels: { name: string; text: string }[]
}

const queryKey = ['vms'] as const
const running = (state: string) => state === 'running' || state === 'started'

const channelOrder = ['init', 'preview', 'docker'] as const
const channelLabel: Record<string, string> = {
  init: 'Init',
  preview: 'Preview',
  docker: 'Container',
}

function dockerRunning(text: string) {
  return text.includes('API listen on /var/run/docker.sock')
}

function logLevelClass(level: string) {
  const name = level.toLowerCase()
  if (name === 'error' || name === 'fatal' || name === 'panic')
    return 'text-destructive'
  if (name === 'warning' || name === 'warn')
    return 'text-amber-600 dark:text-amber-400'
  return 'text-muted-foreground'
}

function LogLines({ lines }: { lines: MachineLogLine[] }) {
  return (
    <ol className="space-y-1 font-mono text-xs leading-5">
      {lines.map((line, index) => (
        <li key={index} className="flex gap-2">
          {line.time && (
            <time
              className="shrink-0 text-muted-foreground tabular-nums"
              dateTime={line.time}
            >
              {formatLogTime(line.time)}
            </time>
          )}
          {line.level && (
            <span className={`w-12 shrink-0 ${logLevelClass(line.level)}`}>
              {line.level}
            </span>
          )}
          <span className="min-w-0 break-all">{line.message}</span>
        </li>
      ))}
    </ol>
  )
}

function useMachines() {
  return useQuery({
    queryKey,
    queryFn: () =>
      apiJson<{ machines: Machine[] }>(
        '/api/vms',
        undefined,
        'Could not load machines',
      ),
    refetchInterval: 2_000,
  })
}

function useNukeMachine(onNuked?: (id: string) => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiJsonBody<{ id: string }>(
        `/api/vms/${encodeURIComponent(id)}`,
        'DELETE',
        undefined,
        'Could not nuke machine',
      ),
    onSuccess: ({ id }) => {
      queryClient.setQueryData<{ machines: Machine[] }>(
        queryKey,
        (current) => ({
          machines:
            current?.machines.filter((machine) => machine.id !== id) ?? [],
        }),
      )
      onNuked?.(id)
    },
  })
}

function NukeMachineButton({
  machine,
  onNuked,
  stopPropagation,
}: {
  machine: Machine
  onNuked?: () => void
  stopPropagation?: boolean
}) {
  const nuke = useNukeMachine(() => onNuked?.())
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            aria-label={`Nuke ${machine.id}`}
            onClick={
              stopPropagation ? (event) => event.stopPropagation() : undefined
            }
          />
        }
      >
        <Skull />
      </AlertDialogTrigger>
      <AlertDialogContent
        onClick={
          stopPropagation ? (event) => event.stopPropagation() : undefined
        }
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Nuke this machine?</AlertDialogTitle>
          <AlertDialogDescription>
            This immediately stops {machine.id} and deletes its VM storage. The
            active run will fail.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {nuke.error && (
          <p className="text-xs break-all text-destructive" role="alert">
            {nuke.error instanceof Error
              ? nuke.error.message
              : 'Could not nuke machine'}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={nuke.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={nuke.isPending}
            onClick={() => nuke.mutate(machine.id)}
          >
            {nuke.isPending ? <BrailleLoader text="Nuking" /> : 'Nuke machine'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

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
        <StaticDither speed={0.35} />
      </div>
    )
  return (
    <div className="absolute inset-0 grid place-items-center bg-muted/50">
      <p className="text-sm text-muted-foreground">No Preview</p>
    </div>
  )
}

function MachinePreviewFill({ machine }: { machine: Machine }) {
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
function MachinePreviewThumbnail({ machine }: { machine: Machine }) {
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

function MachineConsole({ id }: { id: string }) {
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const { data, error, isPending } = useQuery({
    queryKey: ['vms', id, 'logs'],
    queryFn: () =>
      apiJson<MachineLogs>(
        `/api/vms/${encodeURIComponent(id)}/logs`,
        undefined,
        'Could not load machine logs',
      ),
    refetchInterval: 2_000,
  })
  const channels = data?.channels
    .map((channel) => ({
      ...channel,
      lines: filterMachineLog(parseMachineLog(channel.text), deferredSearch),
    }))
    .sort(
      (a, b) =>
        channelOrder.indexOf(a.name as (typeof channelOrder)[number]) -
        channelOrder.indexOf(b.name as (typeof channelOrder)[number]),
    )
  const searching = deferredSearch.trim().length > 0
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2 border-b px-4 py-3">
        <h3 className="text-xs font-semibold">
          Machine console
        </h3>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search console…"
            className="h-8 pr-8 pl-8 text-sm"
            aria-label="Search Machine console"
          />
          {search && (
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className="absolute top-1/2 right-1 -translate-y-1/2"
              aria-label="Clear search"
              onClick={() => setSearch('')}
            >
              <X />
            </Button>
          )}
        </div>
      </div>
      {isPending && !data && (
        <p className="px-4 py-3 text-sm text-muted-foreground" role="status">
          <BrailleLoader text="Loading logs" />
        </p>
      )}
      {error && (
        <p
          className="px-4 py-3 text-sm break-all text-destructive"
          role="alert"
        >
          {error instanceof Error
            ? error.message
            : 'Could not load machine logs'}
        </p>
      )}
      {channels && (
        <Tabs
          defaultValue="init"
          className="min-h-0 flex-1 gap-0 overflow-hidden"
        >
          <div className="shrink-0 px-4 pt-3">
            <TabsList className="w-full">
              {channels.map((channel) => (
                <TabsTrigger key={channel.name} value={channel.name}>
                  {channelLabel[channel.name] ?? channel.name}
                  {channel.name === 'docker' && dockerRunning(channel.text) && (
                    <Badge variant="success">running</Badge>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {channels.map((channel) => (
            <TabsContent
              key={channel.name}
              value={channel.name}
              className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
            >
              {channel.lines.length ? (
                <LogLines lines={channel.lines} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  {searching ? 'No matching lines.' : 'No output yet.'}
                </p>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  )
}

function MachineDetail({ machine }: { machine: Machine }) {
  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-h-0 min-w-0 basis-3/5">
        <MachinePreviewFill machine={machine} />
      </div>
      <div className="min-h-0 min-w-0 basis-2/5 border-l">
        <MachineConsole id={machine.id} />
      </div>
    </div>
  )
}

function MachineCard({
  machine,
  onOpen,
}: {
  machine: Machine
  onOpen: () => void
}) {
  return (
    <Card className="relative shadow-sm transition-shadow hover:ring-foreground/20">
      <button
        type="button"
        className="absolute inset-0 z-10 cursor-pointer rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        aria-label={`Open ${machine.id}`}
        onClick={onOpen}
      />
      {machine.previewUrl && <MachinePreviewThumbnail machine={machine} />}
      <CardHeader className="relative">
        <CardTitle className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono">{machine.id}</span>
          <Badge variant={running(machine.state) ? 'success' : 'secondary'}>
            {machine.state}
          </Badge>
        </CardTitle>
        <CardDescription className="truncate">{machine.image}</CardDescription>
        <CardAction className="relative z-20 flex gap-1">
          {machine.previewUrl && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Open ${machine.id} Preview`}
              render={
                <a
                  href={machine.previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                />
              }
            >
              <ExternalLink />
            </Button>
          )}
          <NukeMachineButton machine={machine} stopPropagation />
        </CardAction>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-3 gap-3 border-t pt-3 text-muted-foreground">
          <div>
            <dt className="flex items-center gap-1">
              <Timer className="size-3" /> Started
            </dt>
            <dd className="mt-1 text-foreground">
              {new Intl.DateTimeFormat([], {
                hour: '2-digit',
                minute: '2-digit',
              }).format(machine.createdAt)}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1">
              <HardDrive className="size-3" /> Mounts
            </dt>
            <dd className="mt-1 text-foreground">{machine.mounts}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1">
              <Network className="size-3" /> Network
            </dt>
            <dd className="mt-1 text-foreground">
              {machine.network ? 'On' : 'Off'}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  )
}

export function MachineSessionHeader({
  machineId,
  onBack,
}: {
  machineId: string
  onBack: () => void
}) {
  const { data } = useMachines()
  const machine = data?.machines.find((item) => item.id === machineId)
  return (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={onBack}>
        <ArrowLeft data-icon="inline-start" />
        Machines
      </Button>
      <p className="min-w-0 truncate font-mono text-sm font-semibold">
        {machineId}
      </p>
      {machine && (
        <Badge
          className="shrink-0"
          variant={running(machine.state) ? 'success' : 'secondary'}
        >
          {machine.state}
        </Badge>
      )}
      <div className="ml-auto flex items-center gap-1">
        {machine?.previewUrl && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Open ${machine.id} Preview`}
            render={
              <a href={machine.previewUrl} target="_blank" rel="noreferrer" />
            }
          >
            <ExternalLink />
          </Button>
        )}
        {machine && <NukeMachineButton machine={machine} onNuked={onBack} />}
      </div>
    </>
  )
}

export function VmsPage({
  selectedId,
  onSelectedIdChange,
}: {
  selectedId?: string
  onSelectedIdChange: (id: string | undefined) => void
}) {
  const { data, isPending, error } = useMachines()
  const machines = data?.machines ?? []

  if (selectedId) {
    const machine = machines.find((item) => item.id === selectedId)
    if (isPending && !data)
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
          <BrailleLoader text="Loading machine" />
        </div>
      )
    if (!machine)
      return (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-center">
          <HardDrive className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium">
            This machine is no longer running
          </p>
          <p className="text-xs text-muted-foreground">{selectedId}</p>
        </div>
      )
    return <MachineDetail machine={machine} />
  }

  if (isPending)
    return (
      <div className="p-8 text-sm text-muted-foreground" role="status">
        <BrailleLoader text="Loading machines" />
      </div>
    )

  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-5 sm:p-8">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">Machines</h1>
            <Badge variant="secondary">{machines.length} live</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Live VM sandboxes on this Colony server.
          </p>
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error instanceof Error ? error.message : 'Could not load machines'}
          </p>
        )}

        {!machines.length && !error && (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <HardDrive className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No machines running</p>
            <p className="mt-1 text-xs text-muted-foreground">
              A machine will appear here when an agent run starts.
            </p>
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-3 md:grid-cols-2 sm:grid-cols-1">
          {machines.map((machine) => (
            <MachineCard
              key={machine.id}
              machine={machine}
              onOpen={() => onSelectedIdChange(machine.id)}
            />
          ))}
        </div>
      </div>
    </main>
  )
}
