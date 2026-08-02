import { Cron } from 'croner'
import cronstrue from 'cronstrue'

export type CronPreview = { description: string; nextRuns: number[] }

export function previewCron(
  expression: string,
  timezone: string,
  from: number | Date = Date.now(),
): CronPreview {
  if (expression.trim().split(/\s+/).length !== 5)
    throw new Error('Cron expressions must contain exactly five fields')
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format()
  } catch {
    throw new Error('Invalid IANA timezone')
  }
  try {
    const cron = new Cron(expression.trim(), { mode: '5-part', timezone })
    const nextRuns = cron.nextRuns(
      3,
      from instanceof Date ? from : new Date(from),
    )
    if (nextRuns.length < 3) throw new Error('Cron has no future occurrence')
    return {
      description: cronstrue.toString(expression.trim()),
      nextRuns: nextRuns.map((date) => date.getTime()),
    }
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : 'Invalid cron expression',
    )
  }
}
