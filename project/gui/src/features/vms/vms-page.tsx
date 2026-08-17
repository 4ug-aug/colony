import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
import { apiJson, apiJsonBody } from '#/lib/api-transport'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CircleX,
  ExternalLink,
  HardDrive,
  Network,
  ScrollText,
  Skull,
  Timer,
} from 'lucide-react'
import { useState } from 'react'

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

const channelLabel: Record<string, string> = {
  preview: 'Preview',
  init: 'Init',
  docker: 'Docker',
}

function dockerRunning(text: string) {
  return text.includes('API listen on /var/run/docker.sock')
}

function MachineConsole({ id, open }: { id: string; open: boolean }) {
  const { data, error, isPending } = useQuery({
    queryKey: ['vms', id, 'logs'],
    queryFn: () =>
      apiJson<MachineLogs>(
        `/api/vms/${encodeURIComponent(id)}/logs`,
        undefined,
        'Could not load machine logs',
      ),
    enabled: open,
    refetchInterval: open ? 2_000 : false,
  })
  if (!open) return null
  return (
    <div className="border-t px-6 py-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Machine console
      </h3>
      {isPending && (
        <p className="text-sm text-muted-foreground" role="status">
          <BrailleLoader text="Loading logs" />
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error instanceof Error
            ? error.message
            : 'Could not load machine logs'}
        </p>
      )}
      {data?.channels.map((channel) => (
        <section key={channel.name} className="mb-3 last:mb-0">
          <h4 className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            {channelLabel[channel.name] ?? channel.name}
            {channel.name === 'docker' && dockerRunning(channel.text) && (
              <Badge variant="success">running</Badge>
            )}
          </h4>
          <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs leading-5">
            {channel.text.trim() || 'No output yet.'}
          </pre>
        </section>
      ))}
    </div>
  )
}

function MachineCard({
  machine,
  onNuke,
}: {
  machine: Machine
  onNuke: () => void
}) {
  const [consoleOpen, setConsoleOpen] = useState(false)
  return (
    <Card className="shadow-sm">
      {machine.previewUrl && (
        <div className="px-3">
          <div className="relative aspect-video overflow-hidden rounded-md bg-background shadow-sm ring-1 ring-foreground/10">
            {machine.previewError ? (
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
            ) : machine.previewReady ? (
              <iframe
                src={machine.previewUrl}
                title={`${machine.id} Preview`}
                className="absolute inset-0 size-full"
                sandbox="allow-downloads allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
              />
            ) : (
              <div
                className="absolute inset-0 grid place-items-center bg-muted/50"
                role="status"
              >
                <BrailleLoader text="Waiting for Preview" />
              </div>
            )}
          </div>
        </div>
      )}
      <CardHeader>
        <CardTitle className="flex min-w-0 items-center gap-2">
          <span
            className={`size-2 shrink-0 rounded-full ${running(machine.state) ? 'bg-green-500' : 'bg-amber-500'}`}
          />
          <span className="truncate font-mono">{machine.id}</span>
          <Badge variant={running(machine.state) ? 'success' : 'secondary'}>
            {machine.state}
          </Badge>
        </CardTitle>
        <CardDescription className="truncate">{machine.image}</CardDescription>
        <CardAction className="flex gap-1">
          <Button
            size="icon-sm"
            variant={consoleOpen ? 'secondary' : 'ghost'}
            aria-label={`${consoleOpen ? 'Hide' : 'Show'} ${machine.id} logs`}
            aria-pressed={consoleOpen}
            onClick={() => setConsoleOpen((open) => !open)}
          >
            <ScrollText />
          </Button>
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
                />
              }
            >
              <ExternalLink />
            </Button>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            aria-label={`Nuke ${machine.id}`}
            onClick={onNuke}
          >
            <Skull />
          </Button>
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
      <MachineConsole id={machine.id} open={consoleOpen} />
    </Card>
  )
}

export function VmsPage() {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Machine>()
  const { data, isPending, error } = useQuery({
    queryKey,
    queryFn: () =>
      apiJson<{ machines: Machine[] }>(
        '/api/vms',
        undefined,
        'Could not load machines',
      ),
    refetchInterval: 2_000,
  })
  const nuke = useMutation({
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
      setSelected(undefined)
    },
  })

  if (isPending)
    return (
      <div className="p-8 text-sm text-muted-foreground" role="status">
        <BrailleLoader text="Loading machines" />
      </div>
    )

  const machines = data?.machines ?? []

  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-5 sm:p-8">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">Machines</h1>
            <Badge variant="secondary">{machines.length} live</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Live smolvm sandboxes on this Colony server. Refreshes every 2
            seconds.
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

        <div className="grid gap-4 lg:grid-cols-2">
          {machines.map((machine) => (
            <MachineCard
              key={machine.id}
              machine={machine}
              onNuke={() => setSelected(machine)}
            />
          ))}
        </div>
      </div>

      <AlertDialog
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nuke this machine?</AlertDialogTitle>
            <AlertDialogDescription>
              This immediately stops {selected?.id} and deletes its VM storage.
              The active run will fail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {nuke.error && (
            <p className="text-xs text-destructive" role="alert">
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
              onClick={() => selected && nuke.mutate(selected.id)}
            >
              {nuke.isPending ? (
                <BrailleLoader text="Nuking" />
              ) : (
                'Nuke machine'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
