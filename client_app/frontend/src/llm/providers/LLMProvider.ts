import type { LLMProviderConfig, LLMRequest, LLMResponse, PrivacyPolicy } from '../types'

// ─── LLM Provider Interface ─────────────────────────────────────────────────

export interface ILLMProvider {
  readonly type: string
  readonly isAvailable: boolean

  /**
   * Send a request to the LLM provider
   */
  complete(request: LLMRequest): Promise<LLMResponse>

  /**
   * Check if the provider is reachable
   */
  healthCheck(): Promise<boolean>

  /**
   * Get the privacy policy for this provider
   */
  getPrivacyPolicy(): PrivacyPolicy

  /**
   * Check if the provider can handle the request given privacy constraints
   */
  canHandleRequest(request: LLMRequest): boolean
}

// ─── Base Provider ───────────────────────────────────────────────────────────

export abstract class BaseLLMProvider implements ILLMProvider {
  readonly type: string
  protected config: LLMProviderConfig
  protected _isAvailable = false

  constructor(config: LLMProviderConfig) {
    this.config = config
    this.type = config.type
  }

  get isAvailable(): boolean {
    return this._isAvailable
  }

  abstract complete(request: LLMRequest): Promise<LLMResponse>

  async healthCheck(): Promise<boolean> {
    try {
      await this.complete({
        prompt: 'ping',
        systemPrompt: 'Respond with pong',
        maxTokens: 10,
      })
      this._isAvailable = true
      return true
    } catch {
      this._isAvailable = false
      return false
    }
  }

  getPrivacyPolicy(): PrivacyPolicy {
    return (
      this.config.privacyPolicy || {
        allowSendingContent: false,
        allowSendingMetadata: false,
        allowSendingEvidence: false,
        requiresConsent: true,
      }
    )
  }

  canHandleRequest(request: LLMRequest): boolean {
    const policy = this.getPrivacyPolicy()

    if (policy.requiresConsent) {
      return false
    }

    // Check if content is being sent
    if (!policy.allowSendingContent && request.prompt.length > 0) {
      return false
    }

    return true
  }

  protected async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      })
      return response
    } finally {
      clearTimeout(timeoutId)
    }
  }
}
