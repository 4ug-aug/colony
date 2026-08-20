import type {
  RoomServerMessage,
  WorkspaceRoom,
  WorkspaceServerMessage,
} from '#/server/protocol'
import type { RoomStore, RoomUser } from './room-store'
import { json, readBody } from '#/server/http/respond'

export function createMembersHttp(deps: {
  store: RoomStore
  broadcastWorkspaceToUsers: (
    userIds: Set<string>,
    message: WorkspaceServerMessage,
  ) => void
  broadcastRoom: (roomId: string, message: RoomServerMessage) => void
  broadcastAttention: (userId: string, roomId: string) => void
}): (
  request: Request,
  url: URL,
  user: RoomUser,
) => Promise<Response | undefined> {
  return async (
    request: Request,
    url: URL,
    user: RoomUser,
  ): Promise<Response | undefined> => {
    if (url.pathname === '/api/workspace/members' && request.method === 'GET')
      return json({ users: deps.store.listWorkspaceUsers() })
    const mentionablesRoute = url.pathname.match(
      /^\/api\/rooms\/([^/]+)\/mentionable-accounts$/,
    )
    if (mentionablesRoute && request.method === 'GET') {
      const roomId = mentionablesRoute[1]!
      if (!deps.store.canAccessRoom(roomId, user.id))
        return json({ error: 'Room not found' }, 404)
      return json({
        accounts: deps.store
          .listMentionableAccounts(roomId)
          .filter(({ id }) => id !== user.id),
      })
    }
    const acknowledgeRoute = url.pathname.match(
      /^\/api\/rooms\/([^/]+)\/attention\/acknowledge$/,
    )
    if (acknowledgeRoute && request.method === 'POST') {
      const roomId = acknowledgeRoute[1]!
      if (!deps.store.canAccessRoom(roomId, user.id))
        return json({ error: 'Room not found' }, 404)
      deps.store.acknowledgeRoomAttention(roomId, user.id, Date.now())
      deps.broadcastAttention(user.id, roomId)
      return json({
        attentionCount:
          deps.store.listAttentionCounts(user.id).get(roomId) ?? 0,
        mentionCount:
          deps.store.listAttentionCounts(user.id, 'mention').get(roomId) ?? 0,
      })
    }
    const threadAcknowledgeRoute = url.pathname.match(
      /^\/api\/rooms\/([^/]+)\/threads\/([^/]+)\/attention\/acknowledge$/,
    )
    if (threadAcknowledgeRoute && request.method === 'POST') {
      const roomId = threadAcknowledgeRoute[1]!
      const rootId = threadAcknowledgeRoute[2]!
      if (!deps.store.canAccessRoom(roomId, user.id))
        return json({ error: 'Room not found' }, 404)
      deps.store.acknowledgeThreadAttention(roomId, rootId, user.id, Date.now())
      deps.broadcastAttention(user.id, roomId)
      return json({
        attentionCount:
          deps.store.listAttentionCounts(user.id).get(roomId) ?? 0,
        mentionCount:
          deps.store.listAttentionCounts(user.id, 'mention').get(roomId) ?? 0,
      })
    }
    const membersRoute = url.pathname.match(/^\/api\/rooms\/([^/]+)\/members$/)
    if (membersRoute && request.method === 'GET') {
      const roomId = membersRoute[1]!
      if (!deps.store.canAccessRoom(roomId, user.id))
        return json({ error: 'Room not found' }, 404)
      return json({ members: deps.store.listMembers(roomId) })
    }
    if (membersRoute && request.method === 'POST') {
      const roomId = membersRoute[1]!
      if (!deps.store.canAccessRoom(roomId, user.id))
        return json({ error: 'Room not found' }, 404)
      const room = deps.store.getRoom(roomId)
      if (!room) return json({ error: 'Room not found' }, 404)
      if (room.visibility !== 'private')
        return json({ error: 'Room is not private' }, 400)
      const body = await readBody(request)
      const userId =
        body && typeof body.userId === 'string' && body.userId.trim()
          ? body.userId.trim()
          : undefined
      if (!userId) return json({ error: 'Unknown user' }, 400)
      const workspaceUsers = deps.store.listWorkspaceUsers()
      if (!workspaceUsers.some((u) => u.id === userId))
        return json({ error: 'Unknown user' }, 400)
      deps.store.addMember(roomId, userId, user.id)
      const updatedRoom = deps.store.getRoom(roomId)!
      deps.broadcastWorkspaceToUsers(new Set([userId]), {
        type: 'room.created',
        room: {
          ...updatedRoom,
          attentionCount: 0,
          mentionCount: 0,
        } satisfies WorkspaceRoom,
      })
      deps.broadcastRoom(roomId, { type: 'room.members.changed', roomId })
      return json({ members: deps.store.listMembers(roomId) }, 201)
    }
    const memberRoute = url.pathname.match(
      /^\/api\/rooms\/([^/]+)\/members\/([^/]+)$/,
    )
    if (memberRoute && request.method === 'DELETE') {
      const roomId = memberRoute[1]!
      const targetUserId = memberRoute[2]!
      if (!deps.store.canAccessRoom(roomId, user.id))
        return json({ error: 'Room not found' }, 404)
      const room = deps.store.getRoom(roomId)
      if (!room) return json({ error: 'Room not found' }, 404)
      if (room.visibility !== 'private')
        return json({ error: 'Room is not private' }, 400)
      if (targetUserId !== user.id && !deps.store.isOwner(roomId, user.id))
        return json({ error: 'Only the room owner can remove members' }, 403)
      deps.store.removeMember(roomId, targetUserId)
      deps.broadcastWorkspaceToUsers(new Set([targetUserId]), {
        type: 'room.removed',
        roomId,
      })
      deps.broadcastRoom(roomId, { type: 'room.members.changed', roomId })
      return json({ ok: true })
    }
    return undefined
  }
}
