import { queryOptions, useQuery } from '@tanstack/react-query'
import type { Step } from '#/features/runs/step-label'

export type RoomLiveSteps = {
  latestStepByRun: Map<string, Step>
  liveStepsByRun: Map<string, Step[]>
}

export const roomLiveStepsQueryKey = (roomId: string) =>
  ['room-live-steps', roomId] as const

const emptyRoomLiveSteps = () => ({
  latestStepByRun: new Map<string, Step>(),
  liveStepsByRun: new Map<string, Step[]>(),
})

export function roomLiveStepsQueryOptions(roomId: string) {
  return queryOptions<RoomLiveSteps>({
    queryKey: roomLiveStepsQueryKey(roomId),
    queryFn: emptyRoomLiveSteps,
    initialData: emptyRoomLiveSteps,
    staleTime: Infinity,
    gcTime: 0,
  })
}

export function useRoomLiveSteps(roomId: string) {
  return useQuery(roomLiveStepsQueryOptions(roomId)).data
}
