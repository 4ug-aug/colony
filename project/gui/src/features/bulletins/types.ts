export type BulletinActor = {
  id: string
  name: string
  image?: string
}

// Mirrors Poll in src/server/features/bulletins/bulletin-store.ts — keep both in sync.
export type Poll = {
  multi?: boolean
  options: string[]
  votes: Record<string, number[]>
}

export type Bulletin = {
  id: string
  body: string
  x: number
  y: number
  poll: Poll | null
  createdBy: BulletinActor
  createdAt: number
  updatedAt: number
}
