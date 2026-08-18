export type Machine = {
  id: string
  state: string
  image: string
  createdAt: number
  mounts: number
  network: boolean
  previewUrl?: string
  previewReady?: boolean
  previewError?: string
}

export const running = (state: string) =>
  state === 'running' || state === 'started'
