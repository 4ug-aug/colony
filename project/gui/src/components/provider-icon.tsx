import { siOpenai } from 'simple-icons'
import { cn } from '#/lib/utils'
import type { LlmProvider } from '#/lib/llm-provider'

export function ProviderIcon({
  provider,
  className,
}: {
  provider: LlmProvider
  className?: string
}) {
  return (
    <svg
      aria-hidden="true"
      className={cn('size-4 fill-current', className)}
      data-provider={provider}
      viewBox="0 0 24 24"
    >
      <path d={siOpenai.path} />
    </svg>
  )
}
