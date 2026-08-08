export type DocActor = { id: string; name: string; image?: string }

export type Doc = {
  id: string
  title: string
  body: string
  createdBy: DocActor
  createdAt: number
  updatedAt: number
}
