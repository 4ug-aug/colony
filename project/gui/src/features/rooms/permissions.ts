export type User = { id: string; role?: string }
export type OwnedRoom = { id: string; createdBy?: string }

export const canDeleteRoom = (user: User, room: OwnedRoom): boolean =>
  room.id !== 'general' &&
  (user.role === 'admin' || room.createdBy === user.id)
