import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { MachineConsole } from './machine-console'
import { MachinePreviewFill } from './machine-preview'
import { NukeMachineButton } from './nuke-machine-button'
import { running, type Machine } from '../types'
import { useMachines } from '../use-machines'

export function MachineDetail({ machine }: { machine: Machine }) {
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
