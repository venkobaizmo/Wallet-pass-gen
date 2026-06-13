import axios, { AxiosInstance } from 'axios';
import { WebhookConfig, TrackingEvent, TrackingEventData, WebhookMethod } from '../types/tracking.types';
import { WebhookError } from '../errors';
import { generateHmacSignature } from '../utils/crypto.utils';
import { logger } from '../utils/logger';

export interface WebhookDispatchResult {
  webhookId: string;
  url: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  attempts: number;
}

export class WebhookService {
  private webhooks = new Map<string, WebhookConfig>();
  private httpClient: AxiosInstance;

  constructor() {
    this.httpClient = axios.create({
      timeout: 10_000,
    });
  }

  // ─── Registration ──────────────────────────────────────────────────────────

  registerWebhook(id: string, config: WebhookConfig): void {
    this.webhooks.set(id, config);
    logger.debug('Webhook registered', { id, url: config.url });
  }

  unregisterWebhook(id: string): void {
    this.webhooks.delete(id);
    logger.debug('Webhook unregistered', { id });
  }

  // ─── Dispatch ──────────────────────────────────────────────────────────────

  async dispatch(event: TrackingEventData): Promise<WebhookDispatchResult[]> {
    const results: WebhookDispatchResult[] = [];

    for (const [id, config] of this.webhooks.entries()) {
      if (!this.shouldSendEvent(config, event.event)) continue;
      const result = await this.sendWebhook(id, config, event);
      results.push(result);
    }

    return results;
  }

  // ─── Incoming webhook handler ──────────────────────────────────────────────

  /**
   * Returns an Express/Koa-compatible middleware that verifies the
   * X-Wallet-Signature header against the raw body and parses the event.
   */
  createIncomingWebhookHandler(
    secret: string,
  ): (req: unknown, res: unknown, next?: unknown) => Promise<void> {
    return async (req: unknown, res: unknown, next?: unknown) => {
      const request = req as {
        headers?: Record<string, string>;
        body?: TrackingEventData | string;
        rawBody?: string;
      };
      const response = res as {
        status: (code: number) => { json: (body: unknown) => void };
        json: (body: unknown) => void;
      };
      const nextFn = next as (() => void) | undefined;

      try {
        const signature =
          request.headers?.['x-wallet-signature'] ??
          request.headers?.['X-Wallet-Signature'];

        const rawBody =
          request.rawBody ??
          (typeof request.body === 'string'
            ? request.body
            : JSON.stringify(request.body ?? {}));

        if (secret && signature) {
          const expected = this.signPayload(rawBody, secret);
          if (expected !== signature) {
            response.status(401).json({ error: 'Invalid signature' });
            return;
          }
        }

        const body: TrackingEventData =
          typeof request.body === 'string'
            ? (JSON.parse(request.body) as TrackingEventData)
            : (request.body as TrackingEventData);

        // Attach parsed event for downstream middleware
        (request as Record<string, unknown>).walletEvent = body;

        if (nextFn) nextFn();
        else response.status(200).json({ status: 'ok' });
      } catch (err) {
        logger.error('Incoming webhook handler failed', err);
        response.status(500).json({ error: 'Internal server error' });
      }
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async sendWebhook(
    id: string,
    config: WebhookConfig,
    event: TrackingEventData,
  ): Promise<WebhookDispatchResult> {
    const payload = JSON.stringify(event);
    const maxAttempts = (config.retryAttempts ?? 0) + 1;
    const retryDelay = config.retryDelay ?? 1000;
    const method = config.method ?? WebhookMethod.POST;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(config.headers ?? {}),
    };

    if (config.secret) {
      headers['X-Wallet-Signature'] = this.signPayload(payload, config.secret);
    }

    let lastError: string | undefined;
    let lastStatus: number | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await this.httpClient.request({
          method,
          url: config.url,
          data: payload,
          headers,
          timeout: config.timeout ?? 10_000,
        });

        lastStatus = response.status;
        logger.debug('Webhook delivered', { id, url: config.url, status: lastStatus, attempt });

        return {
          webhookId: id,
          url: config.url,
          success: true,
          statusCode: lastStatus,
          attempts: attempt,
        };
      } catch (err) {
        lastError = (err as Error).message;
        if (axios.isAxiosError(err)) {
          lastStatus = err.response?.status;
          lastError = `HTTP ${lastStatus ?? 'unknown'}: ${err.message}`;
        }
        logger.warn('Webhook delivery failed', {
          id,
          url: config.url,
          attempt,
          error: lastError,
        });

        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      }
    }

    logger.error('Webhook permanently failed', { id, url: config.url, attempts: maxAttempts });

    return {
      webhookId: id,
      url: config.url,
      success: false,
      statusCode: lastStatus,
      error: lastError,
      attempts: maxAttempts,
    };
  }

  private signPayload(payload: string, secret: string): string {
    return generateHmacSignature(payload, secret);
  }

  private shouldSendEvent(config: WebhookConfig, event: TrackingEvent): boolean {
    if (!config.events || config.events.length === 0) return true;
    return config.events.includes(event);
  }

  // ─── Expose webhook error class for consumers ─────────────────────────────

  createWebhookError(message: string, details?: unknown): WebhookError {
    return new WebhookError(message, details);
  }
}
