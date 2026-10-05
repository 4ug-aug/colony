import { previewCron } from '#/features/schedules/cron'

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
