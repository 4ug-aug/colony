import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { DragDropProvider, useDroppable } from '@dnd-kit/react'
import type { DragEndEvent } from '@dnd-kit/react'
import { RestrictToElement } from '@dnd-kit/dom/modifiers'
import { BrailleLoader } from '#/components/ui/braille-loader'
import { toast } from '#/components/ui/toast'
import { BulletinCard } from './bulletin-card'
import {
  useBulletins,
  useCreateBulletin,
  useDeleteBulletin,
  useUpdateBulletin,
} from './use-bulletins'

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function BulletinBoardSurface({
  boardRef,
  children,
}: {
  boardRef: RefObject<HTMLDivElement | null>
  children: ReactNode
}) {
  const { ref: droppableRef } = useDroppable({ id: 'bulletin-board' })
  return (
    <div
      ref={(node) => {
        boardRef.current = node
        droppableRef(node)
      }}
      className="relative h-full w-full overflow-hidden"
      style={{
        backgroundImage:
          'radial-gradient(circle, color-mix(in oklab, var(--border) 70%, transparent) 1px, transparent 1px)',
        backgroundSize: '16px 16px',
      }}
    >
      {children}
    </div>
  )
}

export type BulletinsPageHandle = {
  addBulletin: () => void
}

export const BulletinsPage = forwardRef<BulletinsPageHandle>(
  function BulletinsPage(_props, ref) {
    const boardRef = useRef<HTMLDivElement>(null)
    const { data: bulletins = [], isPending, isError, error } = useBulletins()
    const createBulletin = useCreateBulletin()
    const updateBulletin = useUpdateBulletin()
    const deleteBulletin = useDeleteBulletin()
    const [editingId, setEditingId] = useState<string>()
    const [paintOrder, setPaintOrder] = useState<string[]>([])

    const ordered = [...bulletins].sort((a, b) => {
      const aIndex = paintOrder.indexOf(a.id)
      const bIndex = paintOrder.indexOf(b.id)
      if (aIndex === -1 && bIndex === -1) return a.updatedAt - b.updatedAt
      if (aIndex === -1) return -1
      if (bIndex === -1) return 1
      return aIndex - bIndex
    })

    const raise = (id: string) => {
      setPaintOrder((current) => [...current.filter((item) => item !== id), id])
    }

    const addBulletin = () => {
      void createBulletin
        .mutateAsync({
          body: '',
          x: 0.42 + Math.random() * 0.12,
          y: 0.38 + Math.random() * 0.12,
        })
        .then((bulletin) => {
          raise(bulletin.id)
          setEditingId(bulletin.id)
        })
        .catch((reason) => {
          toast.add({
            title:
              reason instanceof Error
                ? reason.message
                : 'Unable to create bulletin',
            type: 'error',
          })
        })
    }

    useImperativeHandle(ref, () => ({ addBulletin }))

    const commitBody = (id: string, body: string) => {
      setEditingId(undefined)
      if (!body.trim()) {
        void deleteBulletin.mutateAsync(id).catch((reason) => {
          toast.add({
            title:
              reason instanceof Error
                ? reason.message
                : 'Unable to delete bulletin',
            type: 'error',
          })
        })
        return
      }
      void updateBulletin.mutateAsync({ id, body }).catch((reason) => {
        toast.add({
          title:
            reason instanceof Error
              ? reason.message
              : 'Unable to update bulletin',
          type: 'error',
        })
      })
    }

    const onDragEnd = (event: DragEndEvent) => {
      if (event.canceled) return
      const source = event.operation.source
      const id = source?.id
      if (typeof id !== 'string') return
      const bulletin = bulletins.find((item) => item.id === id)
      const board = boardRef.current
      if (!bulletin || !board || !source) return
      const boardRect = board.getBoundingClientRect()
      if (boardRect.width <= 0 || boardRect.height <= 0) return
      const cardRect = source.element?.getBoundingClientRect()
      const cardWidth = cardRect?.width ?? 240
      const cardHeight = cardRect?.height ?? 48
      const maxX = Math.max(0, 1 - cardWidth / boardRect.width)
      const maxY = Math.max(0, 1 - cardHeight / boardRect.height)
      const transform = event.operation.transform
      const x = clamp(bulletin.x + transform.x / boardRect.width, 0, maxX)
      const y = clamp(bulletin.y + transform.y / boardRect.height, 0, maxY)
      if (x === bulletin.x && y === bulletin.y) return
      raise(id)
      void updateBulletin.mutateAsync({ id, x, y }).catch((reason) => {
        toast.add({
          title:
            reason instanceof Error
              ? reason.message
              : 'Unable to move bulletin',
          type: 'error',
        })
      })
    }

    if (isPending) {
      return (
        <div
          className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground"
          role="status"
        >
          <BrailleLoader text="Loading bulletins…" />
        </div>
      )
    }

    if (isError) {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-sm text-destructive">
          {error instanceof Error ? error.message : 'Unable to load bulletins'}
        </div>
      )
    }

    return (
      <div className="min-h-0 flex-1">
        <DragDropProvider
          modifiers={[
            RestrictToElement.configure({
              element: () => boardRef.current,
            }),
          ]}
          onDragStart={(event) => {
            const id = event.operation.source?.id
            if (typeof id === 'string') raise(id)
          }}
          onDragEnd={onDragEnd}
        >
          <BulletinBoardSurface boardRef={boardRef}>
            {ordered.map((bulletin, index) => (
              <BulletinCard
                key={bulletin.id}
                bulletin={bulletin}
                editing={editingId === bulletin.id}
                zIndex={index + 1}
                onBeginEdit={() => setEditingId(bulletin.id)}
                onCommitBody={(body) => commitBody(bulletin.id, body)}
                onDelete={() => {
                  setEditingId((current) =>
                    current === bulletin.id ? undefined : current,
                  )
                  void deleteBulletin
                    .mutateAsync(bulletin.id)
                    .catch((reason) => {
                      toast.add({
                        title:
                          reason instanceof Error
                            ? reason.message
                            : 'Unable to delete bulletin',
                        type: 'error',
                      })
                    })
                }}
              />
            ))}
          </BulletinBoardSurface>
        </DragDropProvider>
      </div>
    )
  },
)
