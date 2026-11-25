// The Gemini sales assistant.

import type { Menu } from './menuTypes'
import type { StoredOrder } from './orderTypes'

export type AssistantErrorCode = 'missing_key' | 'invalid_key' | 'quota' | 'network' | 'bad_response'

export interface GeminiPart {
  text?: string
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> }
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> }
}

export interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

export interface AskOptions {
  question: string
  /** Called for EVERY question, so new checkouts show up with no reload. */
  getOrders: () => Promise<StoredOrder[]>
  menu: Menu
  apiKey: string | undefined
  model?: string
  fetchImpl?: typeof fetch
}

export interface ToolDeclaration {
  name: string
  description: string
  parameters: {
    type: 'OBJECT'
    properties: Record<string, { type: 'STRING'; description: string }>
    required?: string[]
  }
}

export type ToolResult = Record<string, unknown>

export interface ChatMessage {
  from: 'you' | 'bot' | 'error'
  text: string
}
