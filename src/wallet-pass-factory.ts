import { WalletProvider } from './types/pass.types';
import { PassData, PassResult } from './types/pass.types';
import {
  AppleProviderConfig,
  GoogleProviderConfig,
  CreatePassOptions,
} from './types/provider.types';
import { TrackingConfig, WebhookConfig } from './types/tracking.types';
import { BaseWalletPassProvider } from './providers/base.provider';
import { AppleWalletProvider } from './providers/apple/apple.provider';
import { GoogleWalletProvider } from './providers/google/google.provider';
import { BarcodeGenerator } from './barcode/barcode.generator';
import { TrackingService } from './tracking/tracking.service';
import { WebhookService } from './tracking/webhook.service';
import { ProviderNotFoundError } from './errors';
import { PassBuilder } from './pass-builder';
import { logger } from './utils/logger';

export class WalletPassFactory {
  private providers = new Map<WalletProvider, BaseWalletPassProvider>();
  private trackingService: TrackingService;
  private webhookService: WebhookService;
  private barcodeGenerator: BarcodeGenerator;

  constructor(trackingConfig?: TrackingConfig) {
    this.trackingService = new TrackingService(trackingConfig);
    this.webhookService = new WebhookService();
    this.barcodeGenerator = new BarcodeGenerator();

    // Wire webhooks configured in trackingConfig
    if (trackingConfig?.webhooks) {
      trackingConfig.webhooks.forEach((wh, idx) => {
        this.webhookService.registerWebhook(`webhook_${idx}`, wh);
      });
    }

    // Forward tracking events to the webhook service
    this.trackingService.on('event', (event) => {
      this.webhookService.dispatch(event).catch((err) => {
        logger.error('Webhook dispatch failed', err);
      });
    });
  }

  // ─── Provider registration (overloaded) ────────────────────────────────────

  registerProvider(type: WalletProvider.APPLE, config: AppleProviderConfig): this;
  registerProvider(type: WalletProvider.GOOGLE, config: GoogleProviderConfig): this;
  registerProvider(
    type: WalletProvider,
    config: AppleProviderConfig | GoogleProviderConfig,
  ): this {
    let provider: BaseWalletPassProvider;

    if (type === WalletProvider.APPLE) {
      provider = new AppleWalletProvider(config as AppleProviderConfig);
    } else if (type === WalletProvider.GOOGLE) {
      provider = new GoogleWalletProvider(config as GoogleProviderConfig);
    } else {
      throw new ProviderNotFoundError(type as string);
    }

    this.providers.set(type, provider);
    logger.info(`Provider registered: ${type}`);
    return this;
  }

  // ─── Provider access ───────────────────────────────────────────────────────

  getProvider(type: WalletProvider): BaseWalletPassProvider {
    const provider = this.providers.get(type);
    if (!provider) {
      throw new ProviderNotFoundError(type);
    }
    return provider;
  }

  // ─── Pass creation ─────────────────────────────────────────────────────────

  async createPass(
    provider: WalletProvider,
    passData: PassData,
    options?: CreatePassOptions,
  ): Promise<PassResult> {
    const p = this.getProvider(provider);
    const result = await p.createPass(passData, options);
    logger.info('Pass created via factory', {
      provider,
      passId: result.passId,
    });
    return result;
  }

  async createPassForAllProviders(
    passData: PassData,
    options?: CreatePassOptions,
  ): Promise<Map<WalletProvider, PassResult>> {
    const results = new Map<WalletProvider, PassResult>();
    const entries = Array.from(this.providers.entries());

    await Promise.all(
      entries.map(async ([type, provider]) => {
        const result = await provider.createPass(passData, options);
        results.set(type, result);
      }),
    );

    return results;
  }

  // ─── Services ──────────────────────────────────────────────────────────────

  getBarcodeGenerator(): BarcodeGenerator {
    return this.barcodeGenerator;
  }

  getTrackingService(): TrackingService {
    return this.trackingService;
  }

  configureWebhook(webhookId: string, config: WebhookConfig): this {
    this.webhookService.registerWebhook(webhookId, config);
    return this;
  }

  // ─── Static helpers ────────────────────────────────────────────────────────

  static builder(): PassBuilder {
    return new PassBuilder();
  }
}
