import { previewCron } from '#/features/schedules/cron'
import type { ScheduleState } from './schedule-store'

/**
 * A new schedule from an untrusted body (the Schedules page or an agent's
 * tool call). Throws with a message the caller can show.
 */
export function newScheduleInput(
  body: Record<string, unknown>,
  now: number,
  isKnownAgent: (id: string) => boolean,
) {
  const text = (value: unknown) =>
    typeof value === 'string' ? value.trim() : ''
  const name = text(body.name)
  const task = text(body.task)
  const agentDefinitionId = text(body.agentDefinitionId)
  const cronExpression = text(body.cronExpression)
  const timezone = text(body.timezone)
  if (!name || name.length > 50 || !task || task.length > 10_000)
    throw new Error('Invalid schedule name or task')
  if (!isKnownAgent(agentDefinitionId))
    throw new Error('Unknown agent definition')
  const preview = previewCron(cronExpression, timezone, now)
  return {
    name,
    task,
    agentDefinitionId,
    cronExpression,
    timezone,
    nextRunAt: preview.nextRuns[0]!,
  }
}

/**
 * A partial schedule update from an untrusted body; only the fields present
 * change. Throws with a message the caller can show.
 */
export function scheduleUpdateInput(
  body: Record<string, unknown>,
  current: { cronExpression: string; timezone: string },
  now: number,
  isKnownAgent: (id: string) => boolean,
) {
  const text = (key: string) => {
    const value = body[key]
    return value === undefined
      ? undefined
      : typeof value === 'string'
        ? value.trim()
        : ''
  }
  const name = text('name')
  const task = text('task')
  const agentDefinitionId = text('agentDefinitionId')
  const cronExpression = text('cronExpression')
  const timezone = text('timezone')
  const state = body.state as ScheduleState | undefined
  if (name !== undefined && (!name || name.length > 50))
    throw new Error('Invalid schedule name')
  if (task !== undefined && (!task || task.length > 10_000))
    throw new Error('Invalid schedule task')
  if (agentDefinitionId !== undefined && !isKnownAgent(agentDefinitionId))
    throw new Error('Unknown agent definition')
  if (cronExpression !== undefined || timezone !== undefined)
    previewCron(
      cronExpression ?? current.cronExpression,
      timezone ?? current.timezone,
      now,
    )
  if (state !== undefined && !['active', 'paused', 'archived'].includes(state))
    throw new Error('Invalid schedule state')
  return {
    ...(name === undefined ? {} : { name }),
    ...(task === undefined ? {} : { task }),
    ...(agentDefinitionId === undefined ? {} : { agentDefinitionId }),
    ...(cronExpression === undefined ? {} : { cronExpression }),
    ...(timezone === undefined ? {} : { timezone }),
    ...(state === undefined ? {} : { state }),
  }
}
