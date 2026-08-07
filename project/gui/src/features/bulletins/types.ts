export type BulletinActor = {
  id: string
  name: string
  image?: string
}

export type Bulletin = {
  id: string
  body: string
  x: number
  y: number
  createdBy: BulletinActor
  createdAt: number
  updatedAt: number
}
