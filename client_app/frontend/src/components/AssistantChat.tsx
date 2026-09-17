import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ArrowUp, MessageCircle, RotateCcw } from 'lucide-react'
import { assistantService } from '../services/assistant.service'

type Message = { role: 'user' | 'assistant'; text: string }

export default function AssistantChat({ language }: { language: string }) {
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      text: 'Ask about deepfake evidence, input formats, languages, or how to interpret a result.',
    },
  ])
  const mutation = useMutation({
    mutationFn: (value: string) => assistantService.ask(value, language),
    onSuccess: (data, value) =>
      setMessages((current) => [
        ...current,
        { role: 'user', text: value },
        { role: 'assistant', text: data.answer },
      ]),
  })

  const submit = () => {
    const value = question.trim()
    if (!value || mutation.isPending) return
    setQuestion('')
    mutation.mutate(value)
  }

  const promptSuggestions = [
    'How should I read an inconclusive result?',
    'What evidence is available?',
    'Which formats are supported?',
  ]

  return (
    <section className="rounded-[28px] border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/10 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-300">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">
              Decision support
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">Ask before you decide</h2>
          </div>
        </div>
        <button
          type="button"
          onClick={() =>
            setMessages([
              {
                role: 'assistant',
                text: 'Ask about deepfake evidence, input formats, languages, or how to interpret a result.',
              },
            ])
          }
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-white"
          title="Clear conversation"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-500">
        Get a grounded explanation of the evidence, limitations, and next steps for an inspection.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {promptSuggestions.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => setQuestion(prompt)}
            className="rounded-full border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs text-slate-400 transition hover:border-cyan-300/30 hover:text-cyan-200"
          >
            {prompt}
          </button>
        ))}
      </div>
      <div className="mt-5 max-h-64 space-y-3 overflow-y-auto rounded-2xl bg-slate-950/50 p-4">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <p
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'bg-cyan-300 text-slate-950' : 'bg-slate-800 text-slate-300'}`}
            >
              {message.text}
            </p>
          </div>
        ))}
        {mutation.isPending && (
          <p className="text-xs text-slate-500">Checking the available evidence...</p>
        )}
      </div>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask a focused question..."
          className="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/50"
        />
        <button
          type="submit"
          disabled={!question.trim() || mutation.isPending}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-300 text-slate-950 disabled:opacity-40"
          aria-label="Send question"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </form>
    </section>
  )
}
