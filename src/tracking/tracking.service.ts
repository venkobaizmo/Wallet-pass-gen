import { EventEmitter } from 'events';
import {
  TrackingConfig,
  TrackingEvent,
  TrackingEventData,
  TrackingInfo,
  TrackingStorage,
} from '../types/tracking.types';
import { TrackingError } from '../errors';
import { logger } from '../utils/logger';

const DEFAULT_MAX_EVENTS = 1000;

export interface AppleWebhookBody {
  serialNumbers?: string[];
  pushToken?: string;
  deviceLibraryIdentifier?: string;
  passTypeIdentifier?: string;
  lastUpdated?: string;
}

/** In-memory TrackingStorage implementation */
class MemoryStorage implements TrackingStorage {
  private store = new Map<string, TrackingEventData[]>();

  async save(event: TrackingEventData): Promise<void> {
    const events = this.store.get(event.passId) ?? [];
    events.push(event);
    this.store.set(event.passId, events);
  }

  async getByPassId(passId: string): Promise<TrackingEventData[]> {
    return this.store.get(passId) ?? [];
  }

  async getAll(): Promise<TrackingEventData[]> {
    const all: TrackingEventData[] = [];
    for (const events of this.store.values()) {
      all.push(...events);
    }
    return all;
  }

  async delete(passId: string): Promise<void> {
    this.store.delete(passId);
  }
}

export class TrackingService extends EventEmitter {
  private storage: TrackingStorage;
  private config: TrackingConfig;
  private maxEventsPerPass: number;

  constructor(config?: TrackingConfig) {
    super();
    this.config = config ?? {};
    this.maxEventsPerPass = config?.maxEventsPerPass ?? DEFAULT_MAX_EVENTS;

    if (config?.storage === 'custom' && config.customStorage) {
      this.storage = config.customStorage;
    } else {
      this.storage = new MemoryStorage();
    }
  }

  /**
   * Record a tracking event and emit it to listeners.
   */
  async trackEvent(event: TrackingEventData): Promise<void> {
    try {
      // Enforce per-pass event cap
      const existing = await this.storage.getByPassId(event.passId);
      if (existing.length >= this.maxEventsPerPass) {
        logger.warn('Max events per pass reached — oldest event will not be trimmed (storage-dependent)', {
          passId: event.passId,
          limit: this.maxEventsPerPass,
        });
      }

      await this.storage.save(event);
      this.emit('event', event);
      this.emit(event.event, event);

      logger.debug('Tracking event recorded', {
        event: event.event,
        passId: event.passId,
      });
    } catch (err) {
      throw new TrackingError(
        `Failed to track event: ${(err as Error).message}`,
        err,
      );
    }
  }

  /**
   * Get aggregated tracking info for a specific pass.
   */
  async getTrackingInfo(passId: string): Promise<TrackingInfo> {
    const events = await this.storage.getByPassId(passId);
    return this.aggregateEvents(passId, events);
  }

  /**
   * Get tracking info for all passes.
   */
  async getAllTrackingInfo(): Promise<TrackingInfo[]> {
    const allEvents = await this.storage.getAll();
    const byPass = new Map<string, TrackingEventData[]>();

    for (const event of allEvents) {
      const list = byPass.get(event.passId) ?? [];
      list.push(event);
      byPass.set(event.passId, list);
    }

    return Array.from(byPass.entries()).map(([passId, events]) =>
      this.aggregateEvents(passId, events),
    );
  }

  /**
   * Remove all tracking data for a pass.
   */
  async clearPassTracking(passId: string): Promise<void> {
    await this.storage.delete(passId);
    logger.debug('Tracking cleared', { passId });
  }

  /**
   * Handle an Apple push notification webhook body (e.g. device registration
   * or pass-updated callbacks from the web service).
   */
  async handleAppleWebhook(requestBody: AppleWebhookBody): Promise<void> {
    const serialNumbers = requestBody.serialNumbers ?? [];
    for (const serialNumber of serialNumbers) {
      const event: TrackingEventData = {
        event: TrackingEvent.OPEN,
        passId: serialNumber,
        provider: 'apple',
        timestamp: new Date(),
        deviceInfo: {
          deviceId: requestBody.deviceLibraryIdentifier,
        },
      };
      await this.trackEvent(event);
    }
  }

  /**
   * Returns an Express/Koa-compatible middleware that handles Apple web service
   * webhook calls (device registration / pass update callbacks).
   */
  createAppleWebhookMiddleware(): (req: unknown, res: unknown) => Promise<void> {
    return async (req: unknown, res: unknown) => {
      const request = req as { body?: AppleWebhookBody; method?: string };
      const response = res as {
        status: (code: number) => { json: (body: unknown) => void };
        json: (body: unknown) => void;
      };

      try {
        const body: AppleWebhookBody = request.body ?? {};
        await this.handleAppleWebhook(body);
        response.status(200).json({ status: 'ok' });
      } catch (err) {
        logger.error('Apple webhook handling failed', err);
        response.status(500).json({ error: 'Internal server error' });
      }
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private aggregateEvents(passId: string, events: TrackingEventData[]): TrackingInfo {
    let installs = 0;
    let opens = 0;
    let scans = 0;
    let lastActivity: Date | undefined;

    for (const ev of events) {
      if (ev.event === TrackingEvent.INSTALL) installs++;
      if (ev.event === TrackingEvent.OPEN) opens++;
      if (ev.event === TrackingEvent.SCAN) scans++;

      if (!lastActivity || ev.timestamp > lastActivity) {
        lastActivity = ev.timestamp;
      }
    }

    return { passId, installs, opens, scans, lastActivity, events };
  }
}
