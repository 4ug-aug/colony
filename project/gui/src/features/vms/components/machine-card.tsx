import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { ExternalLink, HardDrive, Network, Timer } from 'lucide-react'
import { running, type Machine } from '../types'
import { MachinePreviewThumbnail } from './machine-preview'
import { NukeMachineButton } from './nuke-machine-button'

export function MachineCard({
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
          <span className="truncate">{machine.id}</span>
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
