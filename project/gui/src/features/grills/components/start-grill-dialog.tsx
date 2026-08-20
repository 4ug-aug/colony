import { AgentMark } from '#/features/agents/agent-mark'
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { Textarea } from '#/components/ui/textarea'
import { toast } from '#/components/ui/toast'
import { useAgentDefinitions } from '#/features/agents/use-agent-definitions'
import type { FormEvent } from 'react'
import { useState } from 'react'
import type { Grill, GrillKind, GrillVisibility } from '../types'
import { useCreateGrill } from '../use-grills'

export function StartGrillDialog({
  open,
  onOpenChange,
  onStarted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onStarted: (grill: Grill) => void
}) {
  const { data: agents = [] } = useAgentDefinitions()
  const createGrill = useCreateGrill()
  const grillAgents = agents.filter((agent) => agent.skills.length > 0)
  const [kind, setKind] = useState<GrillKind>('general')
  const [visibility, setVisibility] =
    useState<GrillVisibility>('workspace-open')
  const [agentDefinitionId, setAgentDefinitionId] = useState('')
  const [baseRef, setBaseRef] = useState('main')
  const [initialRequest, setInitialRequest] = useState('')

  const selectedAgent = agentDefinitionId || grillAgents[0]?.id || ''

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!selectedAgent) {
      toast.add({
        title: 'Pick an agent with an attached Skill',
        type: 'error',
      })
      return
    }
    if (!initialRequest.trim()) {
      toast.add({
        title: 'Describe what you want to grill',
        type: 'error',
      })
      return
    }
    void createGrill
      .mutateAsync({
        kind,
        visibility,
        agentDefinitionId: selectedAgent,
        initialRequest: initialRequest.trim(),
        ...(kind === 'code' ? { baseRef: baseRef.trim() || 'main' } : {}),
      })
      .then((detail) => {
        onOpenChange(false)
        setInitialRequest('')
        onStarted(detail.grill)
      })
      .catch((reason) => {
        toast.add({
          title:
            reason instanceof Error ? reason.message : 'Unable to start Grill',
          type: 'error',
        })
      })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Enter the Grill</DialogTitle>
            <DialogDescription>
              Start from a design request. Round answers advance only when you
              submit.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              What are we grilling?
              <Textarea
                value={initialRequest}
                onChange={(event) => setInitialRequest(event.target.value)}
                placeholder="We are going to design X feature…"
                rows={3}
                required
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Kind
              <Select
                value={kind}
                onValueChange={(value) => {
                  if (value === 'code' || value === 'general') setKind(value)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General Grill</SelectItem>
                  <SelectItem value="code">Code Grill</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Visibility
              <Select
                value={visibility}
                onValueChange={(value) => {
                  if (value === 'invite-only' || value === 'workspace-open')
                    setVisibility(value)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="workspace-open">Workspace open</SelectItem>
                  <SelectItem value="invite-only">Invite only</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Grilling agent
              <Select
                value={selectedAgent}
                onValueChange={(value) => {
                  if (typeof value === 'string') setAgentDefinitionId(value)
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select agent" />
                </SelectTrigger>
                <SelectContent>
                  {grillAgents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      <AgentMark agentId={agent.id} />
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            {kind === 'code' && (
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Base ref
                <Input
                  value={baseRef}
                  onChange={(event) => setBaseRef(event.target.value)}
                  placeholder="main"
                />
              </label>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createGrill.isPending}>
              {createGrill.isPending ? 'Starting…' : 'Start Grill'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
