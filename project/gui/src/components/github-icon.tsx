import { siGithub } from 'simple-icons'
import { cn } from '#/lib/utils'

export function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn('size-4 fill-current', className)}
      viewBox="0 0 24 24"
    >
      <path d={siGithub.path} />
    </svg>
  )
}
