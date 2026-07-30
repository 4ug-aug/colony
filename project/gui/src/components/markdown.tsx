import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ReactNode } from 'react'

const mentionChip = (key: string, handle: string) => (
  <span
    key={key}
    className="rounded bg-muted px-1.5 py-0.5 text-sm font-medium text-muted-foreground"
  >
    @{handle}
  </span>
)

function withMentions(
  children: ReactNode,
  handles: Set<string>,
  mentionPattern: RegExp,
): ReactNode {
  if (!children) return children
  const nodes = Array.isArray(children) ? children : [children]
  const result: ReactNode[] = []
  let keyIndex = 0
  for (const child of nodes) {
    if (typeof child !== 'string') {
      result.push(child)
      continue
    }
    const parts = child.split(mentionPattern)
    for (const part of parts) {
      const handle = part.startsWith('@') ? part.slice(1) : undefined
      if (handle && handles.has(handle)) {
        result.push(mentionChip(`mention-${keyIndex++}`, handle))
      } else if (part) {
        result.push(part)
      }
    }
  }
  return result
}

export function Markdown({
  children,
  components,
  mentions = [],
}: {
  children: string
  components?: Components
  mentions?: string[]
}) {
  const handles = new Set(['software-engineer', ...mentions])
  const escaped = [...handles]
    .map((handle) => handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  const mentionPattern = new RegExp(
    `(?<![A-Za-z0-9_.@-])(@(?:${escaped})(?![A-Za-z0-9_.-]))`,
    'g',
  )
  const defaultComponents: Components = {
    p({ children: content, ...props }) {
      return <p {...props}>{withMentions(content, handles, mentionPattern)}</p>
    },
    li({ children: content, ...props }) {
      return (
        <li {...props}>{withMentions(content, handles, mentionPattern)}</li>
      )
    },
  }
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none break-words prose-p:my-0 prose-pre:my-1 prose-headings:my-1 prose-ul:my-1 prose-ol:my-1">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ ...defaultComponents, ...components }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
