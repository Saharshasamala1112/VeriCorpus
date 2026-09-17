import type { LLMProviderConfig, LLMRequest, LLMResponse, PrivacyPolicy } from '../types'
import { BaseLLMProvider } from './LLMProvider'

// ─── Ollama Provider ─────────────────────────────────────────────────────────

export class OllamaProvider extends BaseLLMProvider {
  private readonly baseUrl: string
  private readonly model: string

  constructor(config: LLMProviderConfig) {
    super(config)
    this.baseUrl = config.baseUrl || 'http://localhost:11434'
    this.model = config.model || 'llama3.1:8b'
  }

  override getPrivacyPolicy(): PrivacyPolicy {
    return {
      allowSendingContent: true,
      allowSendingMetadata: true,
      allowSendingEvidence: true,
      requiresConsent: false,
    }
  }

  override canHandleRequest(_request: LLMRequest): boolean {
    // Ollama runs locally, so privacy is not a concern
    return true
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now()

    const body = {
      model: this.model,
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
      stream: false,
      options: {
        temperature: request.temperature ?? this.config.temperature ?? 0.3,
        num_predict: request.maxTokens ?? this.config.maxTokens ?? 4096,
      },
      format: request.responseFormat === 'json' ? 'json' : undefined,
    }

    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/api/chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      this.config.timeout || 60000,
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    const latencyMs = Date.now() - startTime

    return {
      content: data.message?.content || '',
      model: this.model,
      usage: {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
      latencyMs,
    }
  }

  override async healthCheck(): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/api/tags`,
        {
          method: 'GET',
        },
        5000,
      )

      if (response.ok) {
        this._isAvailable = true
        return true
      }

      this._isAvailable = false
      return false
    } catch {
      this._isAvailable = false
      return false
    }
  }
}
