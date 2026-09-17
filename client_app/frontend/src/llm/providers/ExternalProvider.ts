import type { LLMProviderConfig, LLMRequest, LLMResponse } from '../types'
import { BaseLLMProvider } from './LLMProvider'

// ─── External Provider ───────────────────────────────────────────────────────

export class ExternalProvider extends BaseLLMProvider {
  private readonly apiKey: string
  private readonly apiEndpoint: string

  constructor(config: LLMProviderConfig) {
    super(config)
    this.apiKey = config.apiKey || ''
    this.apiEndpoint = this.getApiEndpoint(config.type)
  }

  private getApiEndpoint(type: string): string {
    const endpoints: Record<string, string> = {
      openai: 'https://api.openai.com/v1/chat/completions',
      anthropic: 'https://api.anthropic.com/v1/messages',
      groq: 'https://api.groq.com/openai/v1/chat/completions',
      gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
    }

    return this.config.baseUrl || endpoints[type] || ''
  }

  override canHandleRequest(request: LLMRequest): boolean {
    const policy = this.getPrivacyPolicy()

    if (policy.requiresConsent) {
      return false
    }

    // Check if content is being sent when not allowed
    if (!policy.allowSendingContent) {
      // We can still send structured evidence (not raw content)
      // Check if the prompt contains raw content markers
      const hasRawContent =
        request.prompt.includes('[RAW_CONTENT]') || request.prompt.includes('[ORIGINAL_TEXT]')

      if (hasRawContent) {
        return false
      }
    }

    return true
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new Error('API key is required for external LLM provider')
    }

    const startTime = Date.now()

    // Route to appropriate API format
    let response: Response

    if (this.config.type === 'anthropic') {
      response = await this.callAnthropic(request)
    } else {
      response = await this.callOpenAICompatible(request)
    }

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`External LLM API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const latencyMs = Date.now() - startTime

    return this.parseResponse(data, latencyMs)
  }

  private async callOpenAICompatible(request: LLMRequest): Promise<Response> {
    const body = {
      model: this.config.model,
      messages: [
        {
          role: 'system',
          content: request.systemPrompt,
        },
        {
          role: 'user',
          content: request.prompt,
        },
      ],
      temperature: request.temperature ?? this.config.temperature ?? 0.3,
      max_tokens: request.maxTokens ?? this.config.maxTokens ?? 4096,
      response_format: request.responseFormat === 'json' ? { type: 'json_object' } : undefined,
    }

    return this.fetchWithTimeout(
      this.apiEndpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      },
      this.config.timeout || 60000,
    )
  }

  private async callAnthropic(request: LLMRequest): Promise<Response> {
    const body = {
      model: this.config.model,
      max_tokens: request.maxTokens ?? this.config.maxTokens ?? 4096,
      system: request.systemPrompt,
      messages: [
        {
          role: 'user',
          content: request.prompt,
        },
      ],
      temperature: request.temperature ?? this.config.temperature ?? 0.3,
    }

    return this.fetchWithTimeout(
      this.apiEndpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      },
      this.config.timeout || 60000,
    )
  }

  private parseResponse(data: Record<string, unknown>, latencyMs: number): LLMResponse {
    // Handle OpenAI-compatible format
    if (data.choices && Array.isArray(data.choices)) {
      const choice = data.choices[0] as Record<string, unknown>
      const message = choice.message as Record<string, unknown>

      return {
        content: (message.content as string) || '',
        model: (data.model as string) || this.config.model,
        usage: data.usage
          ? {
              promptTokens: (data.usage as Record<string, number>).prompt_tokens || 0,
              completionTokens: (data.usage as Record<string, number>).completion_tokens || 0,
              totalTokens: (data.usage as Record<string, number>).total_tokens || 0,
            }
          : undefined,
        latencyMs,
      }
    }

    // Handle Anthropic format
    if (data.content && Array.isArray(data.content)) {
      const contentBlock = data.content[0] as Record<string, unknown>

      return {
        content: (contentBlock.text as string) || '',
        model: (data.model as string) || this.config.model,
        usage: data.usage
          ? {
              promptTokens: (data.usage as Record<string, number>).input_tokens || 0,
              completionTokens: (data.usage as Record<string, number>).output_tokens || 0,
              totalTokens:
                ((data.usage as Record<string, number>).input_tokens || 0) +
                ((data.usage as Record<string, number>).output_tokens || 0),
            }
          : undefined,
        latencyMs,
      }
    }

    throw new Error('Unsupported response format')
  }
}
