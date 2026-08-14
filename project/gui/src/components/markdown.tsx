import { useAgentDefinitions } from '#/features/agents/use-agent-definitions'
import { Button } from '#/components/ui/button'
import { toast } from '#/components/ui/toast'
import { Check, Copy } from 'lucide-react'
import {
  Children,
  isValidElement,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'
import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

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

function languageFromCodeChild(children: ReactNode): string {
  const child = Children.toArray(children).find((node) => isValidElement(node))
  if (!isValidElement<{ className?: string }>(child)) return ''
  return /language-([a-zA-Z0-9_+-]+)/.exec(child.props.className ?? '')?.[1] ?? ''
}

function CodeBlock({
  children,
  node: _node,
  ...props
}: ComponentProps<'pre'> & { node?: unknown }) {
  const [copied, setCopied] = useState(false)
  const preRef = useRef<HTMLPreElement>(null)
  const language = languageFromCodeChild(children)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(preRef.current?.textContent ?? '')
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.add({ title: 'Copy failed', type: 'error' })
    }
  }

  return (
    <div className="md-code-block not-prose">
      <div className="md-code-block-header">
        <span className="md-code-block-lang">{language}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={copied ? 'Copied' : 'Copy code'}
          onClick={() => void copy()}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
      <pre ref={preRef} {...props}>
        {children}
      </pre>
    </div>
  )
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
  const { data: agents = [] } = useAgentDefinitions()
  const handles = new Set([
    ...agents.map((agent) => agent.id),
    ...mentions,
  ])
  const escaped = [...handles]
    .map((handle) => handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  const mentionPattern = new RegExp(
    `(?<![A-Za-z0-9_.@-])(@(?:${escaped || '$'})(?![A-Za-z0-9_.-]))`,
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
    pre: CodeBlock,
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
