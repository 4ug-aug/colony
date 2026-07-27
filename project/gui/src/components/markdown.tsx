import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ReactNode } from 'react'

const MENTION_RE = /(@software-engineer\b)/g

const mentionChip = (key: string) => (
  <span
    key={key}
    className="rounded bg-muted px-1.5 py-0.5 text-sm font-medium text-muted-foreground"
  >
    software engineer
  </span>
)

function withMentions(children: ReactNode): ReactNode {
  if (!children) return children
  const nodes = Array.isArray(children) ? children : [children]
  const result: ReactNode[] = []
  let keyIndex = 0
  for (const child of nodes) {
    if (typeof child !== 'string') {
      result.push(child)
      continue
    }
    const parts = child.split(MENTION_RE)
    for (const part of parts) {
      if (part === '@software-engineer') {
        result.push(mentionChip(`mention-${keyIndex++}`))
      } else if (part) {
        result.push(part)
      }
    }
  }
  return result
}

const defaultComponents: Components = {
  p({ children, ...props }) {
    return <p {...props}>{withMentions(children)}</p>
  },
  li({ children, ...props }) {
    return <li {...props}>{withMentions(children)}</li>
  },
}

export function Markdown({
  children,
  components,
}: {
  children: string
  components?: Components
}) {
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
