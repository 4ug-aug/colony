import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { cn } from '#/lib/utils'
import type { ReactNode } from 'react'

export function SettingsCard({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Card
      className={cn(
        'bg-card/90 shadow-sm backdrop-blur-sm animate-in fade-in-0 slide-in-from-bottom-2 duration-500 ease-out fill-mode-backwards motion-reduce:animate-none',
        className,
      )}
    >
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
