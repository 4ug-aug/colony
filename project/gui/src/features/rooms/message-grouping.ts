export function messagesAreGrouped(
  previous: { authorId: string; createdAt: number } | undefined,
  current: { authorId: string; createdAt: number },
) {
  return (
    previous?.authorId === current.authorId &&
    current.createdAt - previous.createdAt < 5 * 60 * 1000
  )
}
