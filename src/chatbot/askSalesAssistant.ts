import { runTool, toolDeclarations } from './chatTools'
import type { AskOptions, AssistantErrorCode, GeminiContent } from '../types'

export class AssistantError extends Error {
  code: AssistantErrorCode
  constructor(code: AssistantErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

export const CANNOT_ANSWER_MESSAGE = "I can't answer that from the sales data I have."

/**
 * Gemini Flash models we try, fastest first (the bigger models can take 20+ seconds). Model names change over time, and a busy model answers
 * 503 or an old model answers 404, so the next model is tried automatically.
 * VITE_GEMINI_MODEL, when set, is tried first.
 */
const MODELS_TO_TRY = ['gemini-flash-lite-latest', 'gemini-3.5-flash', 'gemini-3-flash-preview']
const MAX_TOOL_ROUNDS = 4

const SYSTEM_PROMPT = `You are the sales assistant for a breakfast shop's staff.
Rules you must follow:
1. Answer ONLY by calling the provided tools. Never calculate, estimate or guess numbers yourself.
2. After a tool returns, say its result in one or two short plain sentences. Use the numbers exactly as given.
3. If no tool can answer the question (for example anything about customers, who bought, or the future), call describe_available_data, then say you cannot know it from this data. Never invent a name, a number or a trend.
4. If a tool returns an error, tell the user the error.`

/** Turns an HTTP failure into a message the staff can act on. */
function errorFromHttpStatus(status: number, text: string): AssistantError {
  if (status === 429) return new AssistantError('quota', 'The free Gemini quota is used up (429). Wait a minute and try again.')
  if (status === 401 || status === 403 || /api key not valid|API_KEY_INVALID/i.test(text)) {
    return new AssistantError('invalid_key', 'The Gemini API key is invalid. Check VITE_GEMINI_API_KEY in .env.local.')
  }
  return new AssistantError('bad_response', `Gemini returned an error (${status}). Try again in a moment.`)
}

/** Sends one request to Gemini. A busy (503) or retired (404) model makes us try the next model. */
async function sendToGemini(options: AskOptions, apiKey: string, requestBody: string): Promise<Response> {
  const sendRequest = options.fetchImpl ?? fetch
  const models = options.model ? [options.model, ...MODELS_TO_TRY] : MODELS_TO_TRY
  let lastResponse: Response | undefined
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
    try {
      lastResponse = await sendRequest(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: requestBody,
      })
    } catch {
      throw new AssistantError('network', 'Could not reach Gemini. Check your internet connection.')
    }
    if (lastResponse.status !== 503 && lastResponse.status !== 404) return lastResponse
  }
  return lastResponse as Response
}

export async function askSalesAssistant(options: AskOptions): Promise<string> {
  if (!options.apiKey) {
    throw new AssistantError('missing_key', 'No Gemini API key. Add VITE_GEMINI_API_KEY to .env.local and restart.')
  }

  const conversation: GeminiContent[] = [{ role: 'user', parts: [{ text: options.question }] }]
  let aToolWasCalled = false

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const requestBody = JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: conversation,
      tools: [{ functionDeclarations: toolDeclarations }],
      generationConfig: { temperature: 0 },
    })
    const response = await sendToGemini(options, options.apiKey, requestBody)
    if (!response.ok) throw errorFromHttpStatus(response.status, await response.text().catch(() => ''))

    const data = (await response.json()) as { candidates?: { content?: GeminiContent }[] }
    const reply = data.candidates?.[0]?.content
    if (!reply?.parts?.length) throw new AssistantError('bad_response', 'Gemini sent an empty answer.')

    const toolCalls = reply.parts.filter((part) => part.functionCall)
    if (toolCalls.length === 0) {
      const text = reply.parts.map((part) => part.text ?? '').join('').trim()
      // Safety net: numbers must come from our tools. A number with no tool call is a guess.
      if (!aToolWasCalled && /\d/.test(text)) return CANNOT_ANSWER_MESSAGE
      return text || CANNOT_ANSWER_MESSAGE
    }

    // The model picked tool(s): run them on the LATEST orders and send the results back
    aToolWasCalled = true
    const orders = await options.getOrders()
    conversation.push({ role: 'model', parts: reply.parts }) // keep the parts exactly as received
    conversation.push({
      role: 'user',
      parts: toolCalls.map((part) => ({
        functionResponse: {
          id: part.functionCall!.id,
          name: part.functionCall!.name,
          response: runTool(part.functionCall!.name, part.functionCall!.args ?? {}, orders, options.menu),
        },
      })),
    })
  }
  throw new AssistantError('bad_response', 'The assistant took too many steps. Try a simpler question.')
}
