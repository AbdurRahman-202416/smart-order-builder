import { useRef, useState } from 'react'
import { api } from '../api/apiClient'
import { AssistantError, askSalesAssistant } from '../chatbot/askSalesAssistant'
import { toTitleCase } from '../logic/formatText'
import type { ChatMessage, Menu } from '../types'

const SUGGESTED_QUESTIONS = ['How Many Orders?', 'What Is The Total Revenue?', 'Best-Selling Option?', 'Who Is Our Best Customer?']

/** A chat box where shop staff ask questions about sales. */
export function SalesChat({ menu }: { menu: Menu }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [questionText, setQuestionText] = useState('')
  const [isWaiting, setIsWaiting] = useState(false)
  const isRequestRunning = useRef(false)

  async function sendQuestion(question: string) {
    const trimmedQuestion = question.trim()
    if (!trimmedQuestion || isRequestRunning.current) return
    isRequestRunning.current = true
    setIsWaiting(true)
    setQuestionText('')
    setMessages((old) => [...old, { from: 'you', text: toTitleCase(trimmedQuestion) }])
    try {
      const answer = await askSalesAssistant({
        question: trimmedQuestion,
        menu,
        getOrders: api.getOrders, // fresh orders for every question, so no reload is needed
        apiKey: import.meta.env.VITE_GEMINI_API_KEY as string | undefined,
        model: import.meta.env.VITE_GEMINI_MODEL as string | undefined,
      })
      setMessages((old) => [...old, { from: 'bot', text: toTitleCase(answer) }])
    } catch (error) {
      const errorText = error instanceof AssistantError ? error.message : 'Something went wrong. Try again.'
      setMessages((old) => [...old, { from: 'error', text: toTitleCase(errorText) }])
    } finally {
      isRequestRunning.current = false
      setIsWaiting(false)
    }
  }

  return (
    <section className="card" aria-labelledby="chat-title">
      <h2 id="chat-title">Sales Assistant</h2>
      <div className="chips">
        {SUGGESTED_QUESTIONS.map((question) => (
          <button type="button" key={question} onClick={() => void sendQuestion(question)} disabled={isWaiting}>
            {question}
          </button>
        ))}
      </div>
      <ul className="chat" aria-live="polite">
        {messages.map((message, index) => (
          <li key={index} className={`message ${message.from}`} role={message.from === 'error' ? 'alert' : undefined}>
            {message.text}
          </li>
        ))}
        {isWaiting && <li className="message bot muted">Thinking...</li>}
      </ul>
      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault()
          void sendQuestion(questionText)
        }}
      >
        <input value={questionText} onChange={(e) => setQuestionText(e.target.value)} placeholder="Ask About Sales..." aria-label="Question" />
        <button type="submit" disabled={isWaiting || !questionText.trim()}>
          Ask
        </button>
      </form>
    </section>
  )
}
