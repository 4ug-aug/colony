import { describe, expect, test } from 'bun:test'
import {
  MessageSquarePlus,
  MessagesSquare,
  SquareTerminal,
  Wrench,
} from 'lucide-react'
import { getToolIcon } from './run-tool-icon'

describe('tool icons', () => {
  test('maps known tools and falls back for unknown tools', () => {
    expect(getToolIcon('shell')).toBe(SquareTerminal)
    expect(getToolIcon('workspace_read_messages')).toBe(MessagesSquare)
    expect(getToolIcon('workspace_post_message')).toBe(MessageSquarePlus)
    expect(getToolIcon('future_tool')).toBe(Wrench)
    expect(getToolIcon()).toBe(Wrench)
  })
})
