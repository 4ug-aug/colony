import { cn } from '#/lib/utils'
import { SquareTerminal, Wrench, type LucideIcon } from 'lucide-react'
import {
  siAsana,
  siGithub,
  siGrafana,
  siLinear,
  siOutline,
} from 'simple-icons'

// Microsoft Outlook was removed from simple-icons (brand permission). Keep the last published path.
const microsoftOutlookPath =
  'M7.88 12.04q0 .45-.11.87-.1.41-.33.74-.22.33-.58.52-.37.2-.87.2t-.85-.2q-.35-.21-.57-.55-.22-.33-.33-.75-.1-.42-.1-.86t.1-.87q.1-.43.34-.76.22-.34.59-.54.36-.2.87-.2t.86.2q.35.21.57.55.22.34.31.77.1.43.1.88zM24 12v9.38q0 .46-.33.8-.33.32-.8.32H7.13q-.46 0-.8-.33-.32-.33-.32-.8V18H1q-.41 0-.7-.3-.3-.29-.3-.7V7q0-.41.3-.7Q.58 6 1 6h6.5V2.55q0-.44.3-.75.3-.3.75-.3h12.9q.44 0 .75.3.3.3.3.75V10.85l1.24.72h.01q.1.07.18.18.07.12.07.25zm-6-8.25v3h3v-3zm0 4.5v3h3v-3zm0 4.5v1.83l3.05-1.83zm-5.25-9v3h3.75v-3zm0 4.5v3h3.75v-3zm0 4.5v2.03l2.41 1.5 1.34-.8v-2.73zM9 3.75V6h2l.13.01.12.04v-2.3zM5.98 15.98q.9 0 1.6-.3.7-.32 1.19-.86.48-.55.73-1.28.25-.74.25-1.61 0-.83-.25-1.55-.24-.71-.71-1.24t-1.15-.83q-.68-.3-1.55-.3-.92 0-1.64.3-.71.3-1.2.85-.5.54-.75 1.3-.25.74-.25 1.63 0 .85.26 1.56.26.72.74 1.23.48.52 1.17.81.69.3 1.56.3zM7.5 21h12.39L12 16.08V17q0 .41-.3.7-.29.3-.7.3H7.5zm15-.13v-7.24l-5.9 3.54Z'

const BRAND_PATHS: Record<string, string> = {
  asana: siAsana.path,
  github: siGithub.path,
  grafana: siGrafana.path,
  linear: siLinear.path,
  outlook: microsoftOutlookPath,
  outline: siOutline.path,
}

const LUCIDE_ICONS: Record<string, LucideIcon> = {
  shell: SquareTerminal,
}

function normalizeTool(tool?: string): string {
  return (tool ?? '').trim().toLowerCase()
}

function prefixed(name: string, prefix: string): boolean {
  return (
    name === prefix ||
    name.startsWith(`${prefix}.`) ||
    name.startsWith(`${prefix}_`)
  )
}

export function toolIconId(tool?: string): string {
  const name = normalizeTool(tool)
  if (!name) return 'wrench'
  if (prefixed(name, 'workspace')) return 'workspace'
  const brand = Object.keys(BRAND_PATHS).find((id) => prefixed(name, id))
  if (brand) return brand
  const lucide = name.includes('.') ? name : name.replace('_', '.')
  if (LUCIDE_ICONS[lucide]) return lucide
  return 'wrench'
}

function BrandGlyph({
  path,
  className,
}: {
  path: string
  className?: string
}) {
  return (
    <svg
      aria-hidden="true"
      className={cn('size-3.5 shrink-0 fill-current', className)}
      viewBox="0 0 24 24"
    >
      <path d={path} />
    </svg>
  )
}

export function ToolIcon({
  tool,
  className,
}: {
  tool?: string
  className?: string
}) {
  const id = toolIconId(tool)
  if (id === 'workspace') {
    return (
      <img
        src="/app-icon.png"
        alt=""
        className={cn('size-3.5 shrink-0 dark:invert', className)}
      />
    )
  }
  const brandPath = BRAND_PATHS[id]
  if (brandPath) return <BrandGlyph path={brandPath} className={className} />
  const Icon = LUCIDE_ICONS[id] ?? Wrench
  return (
    <Icon aria-hidden="true" className={cn('size-3.5 shrink-0', className)} />
  )
}
