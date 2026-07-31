declare module '@dot-loaders/react' {
  import type { ReactElement } from 'react'

  export interface LoaderProps {
    loader: string
    className?: string
    fallbackLabel?: string
    renderer?: 'text' | 'svg-grid'
    rendererOptions?: Record<string, unknown>
    speed?: number
  }

  export function Loader(props: LoaderProps): ReactElement
}
