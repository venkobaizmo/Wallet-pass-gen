import { TrackingService } from '../src/tracking/tracking.service';
import { WebhookService } from '../src/tracking/webhook.service';
import { TrackingEvent, TrackingEventData, WebhookMethod } from '../src/types/tracking.types';
import { TrackingError } from '../src/errors';

// Mock axios for WebhookService
const mockAxiosRequest = jest.fn();
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    request: mockAxiosRequest,
  })),
  isAxiosError: jest.fn(
    (err: unknown) => (err as { isAxiosError?: boolean })?.isAxiosError === true,
  ),
  default: {
    create: jest.fn(() => ({ request: mockAxiosRequest })),
    isAxiosError: jest.fn(
      (err: unknown) => (err as { isAxiosError?: boolean })?.isAxiosError === true,
    ),
  },
}));

function makeEvent(
  passId: string,
  event: TrackingEvent = TrackingEvent.INSTALL,
  provider = 'apple',
): TrackingEventData {
  return {
    event,
    passId,
    provider,
    timestamp: new Date(),
  };
}

// ─── TrackingService ──────────────────────────────────────────────────────────

describe('TrackingService', () => {
  let service: TrackingService;

  beforeEach(() => {
    service = new TrackingService();
  });

  describe('trackEvent', () => {
    it('stores an event and emits "event"', async () => {
      const listener = jest.fn();
      service.on('event', listener);

      await service.trackEvent(makeEvent('pass-1'));
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].passId).toBe('pass-1');
    });

    it('emits the specific event type as well', async () => {
      const scanListener = jest.fn();
      service.on(TrackingEvent.SCAN, scanListener);

      await service.trackEvent(makeEvent('pass-2', TrackingEvent.SCAN));
      expect(scanListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('getTrackingInfo', () => {
    it('aggregates installs, opens and scans correctly', async () => {
      const passId = 'aggregate-pass';
      await service.trackEvent(makeEvent(passId, TrackingEvent.INSTALL));
      await service.trackEvent(makeEvent(passId, TrackingEvent.INSTALL));
      await service.trackEvent(makeEvent(passId, TrackingEvent.OPEN));
      await service.trackEvent(makeEvent(passId, TrackingEvent.SCAN));

      const info = await service.getTrackingInfo(passId);
      expect(info.passId).toBe(passId);
      expect(info.installs).toBe(2);
      expect(info.opens).toBe(1);
      expect(info.scans).toBe(1);
      expect(info.events).toHaveLength(4);
    });

    it('returns zeroed counts for an unknown passId', async () => {
      const info = await service.getTrackingInfo('unknown-pass');
      expect(info.installs).toBe(0);
      expect(info.opens).toBe(0);
      expect(info.scans).toBe(0);
      expect(info.events).toHaveLength(0);
    });

    it('sets lastActivity to the most recent event timestamp', async () => {
      const passId = 'time-pass';
      const earlier = new Date('2024-01-01T10:00:00Z');
      const later = new Date('2024-06-15T18:00:00Z');

      await service.trackEvent({ ...makeEvent(passId), timestamp: earlier });
      await service.trackEvent({ ...makeEvent(passId, TrackingEvent.OPEN), timestamp: later });

      const info = await service.getTrackingInfo(passId);
      expect(info.lastActivity).toEqual(later);
    });
  });

  describe('getAllTrackingInfo', () => {
    it('returns info for all tracked passes', async () => {
      await service.trackEvent(makeEvent('pass-a', TrackingEvent.INSTALL));
      await service.trackEvent(makeEvent('pass-b', TrackingEvent.SCAN));

      const all = await service.getAllTrackingInfo();
      expect(all.length).toBe(2);
      const passIds = all.map((i) => i.passId).sort();
      expect(passIds).toEqual(['pass-a', 'pass-b']);
    });
  });

  describe('clearPassTracking', () => {
    it('removes all events for a specific pass', async () => {
      const passId = 'clear-pass';
      await service.trackEvent(makeEvent(passId));
      await service.clearPassTracking(passId);

      const info = await service.getTrackingInfo(passId);
      expect(info.events).toHaveLength(0);
    });
  });

  describe('handleAppleWebhook', () => {
    it('tracks OPEN events for each serial number', async () => {
      await service.handleAppleWebhook({
        serialNumbers: ['serial-1', 'serial-2'],
        deviceLibraryIdentifier: 'device-abc',
      });

      const info1 = await service.getTrackingInfo('serial-1');
      const info2 = await service.getTrackingInfo('serial-2');

      expect(info1.opens).toBe(1);
      expect(info2.opens).toBe(1);
    });
  });

  describe('createAppleWebhookMiddleware', () => {
    it('returns 200 on success', async () => {
      const middleware = service.createAppleWebhookMiddleware();
      const req = { body: { serialNumbers: ['sn-1'] } };
      const jsonMock = jest.fn();
      const statusMock = jest.fn(() => ({ json: jsonMock }));
      const res = { status: statusMock, json: jest.fn() };

      await middleware(req, res);
      expect(statusMock).toHaveBeenCalledWith(200);
    });
  });

  describe('custom storage', () => {
    it('uses provided custom storage', async () => {
      const store: TrackingEventData[] = [];
      const customStorage = {
        save: jest.fn(async (ev: TrackingEventData) => { store.push(ev); }),
        getByPassId: jest.fn(async (id: string) => store.filter((e) => e.passId === id)),
        getAll: jest.fn(async () => [...store]),
        delete: jest.fn(async (id: string) => {
          const idx = store.findIndex((e) => e.passId === id);
          if (idx !== -1) store.splice(idx, 1);
        }),
      };

      const svc = new TrackingService({ storage: 'custom', customStorage });
      await svc.trackEvent(makeEvent('custom-pass'));

      expect(customStorage.save).toHaveBeenCalledTimes(1);
    });
  });
});

// ─── WebhookService ───────────────────────────────────────────────────────────

describe('WebhookService', () => {
  let service: WebhookService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WebhookService();
  });

  describe('registerWebhook / unregisterWebhook', () => {
    it('registers and unregisters a webhook', async () => {
      service.registerWebhook('wh-1', { url: 'https://example.com/hook' });

      mockAxiosRequest.mockResolvedValueOnce({ status: 200, data: {} });
      const results = await service.dispatch(makeEvent('p1'));
      expect(results).toHaveLength(1);

      service.unregisterWebhook('wh-1');
      const results2 = await service.dispatch(makeEvent('p1'));
      expect(results2).toHaveLength(0);
    });
  });

  describe('dispatch', () => {
    it('sends event to all registered webhooks', async () => {
      service.registerWebhook('wh-a', { url: 'https://a.com/hook' });
      service.registerWebhook('wh-b', { url: 'https://b.com/hook' });

      mockAxiosRequest.mockResolvedValue({ status: 200, data: {} });
      const results = await service.dispatch(makeEvent('multi-pass'));

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.success)).toBe(true);
    });

    it('filters events by the webhook events whitelist', async () => {
      service.registerWebhook('scan-only', {
        url: 'https://example.com/hook',
        events: [TrackingEvent.SCAN],
      });

      mockAxiosRequest.mockResolvedValue({ status: 200 });

      // INSTALL event should NOT be sent
      const results = await service.dispatch(makeEvent('p', TrackingEvent.INSTALL));
      expect(results).toHaveLength(0);

      // SCAN event should be sent
      const results2 = await service.dispatch(makeEvent('p', TrackingEvent.SCAN));
      expect(results2).toHaveLength(1);
    });

    it('returns success:false when the endpoint fails', async () => {
      service.registerWebhook('fail-hook', { url: 'https://fail.com/hook' });

      const axiosErr = Object.assign(new Error('Network error'), { isAxiosError: true });
      mockAxiosRequest.mockRejectedValue(axiosErr);

      const results = await service.dispatch(makeEvent('fail-pass'));
      expect(results[0].success).toBe(false);
    });

    it('retries on failure according to retryAttempts', async () => {
      service.registerWebhook('retry-hook', {
        url: 'https://retry.com/hook',
        retryAttempts: 2,
        retryDelay: 0,
      });

      const axiosErr = Object.assign(new Error('Network error'), { isAxiosError: true });
      mockAxiosRequest
        .mockRejectedValueOnce(axiosErr)
        .mockRejectedValueOnce(axiosErr)
        .mockResolvedValueOnce({ status: 200 });

      const results = await service.dispatch(makeEvent('retry-pass'));
      expect(results[0].success).toBe(true);
      expect(results[0].attempts).toBe(3);
    });

    it('adds X-Wallet-Signature header when secret is configured', async () => {
      service.registerWebhook('signed-hook', {
        url: 'https://secure.com/hook',
        secret: 'my-secret',
      });

      mockAxiosRequest.mockResolvedValue({ status: 200 });
      await service.dispatch(makeEvent('signed-pass'));

      const callArgs = mockAxiosRequest.mock.calls[0][0] as { headers: Record<string, string> };
      expect(callArgs.headers['X-Wallet-Signature']).toBeDefined();
      expect(callArgs.headers['X-Wallet-Signature']).toMatch(/^[0-9a-f]{64}$/);
    });

    it('uses POST method by default', async () => {
      service.registerWebhook('method-hook', { url: 'https://example.com/hook' });
      mockAxiosRequest.mockResolvedValue({ status: 200 });

      await service.dispatch(makeEvent('method-pass'));

      const callArgs = mockAxiosRequest.mock.calls[0][0] as { method: string };
      expect(callArgs.method).toBe(WebhookMethod.POST);
    });
  });

  describe('createIncomingWebhookHandler', () => {
    it('returns 200 when signature is valid', async () => {
      const handler = service.createIncomingWebhookHandler('secret-key');
      const event = makeEvent('incoming-pass');
      const payload = JSON.stringify(event);

      // Compute expected signature
      const crypto = await import('crypto');
      const sig = crypto.createHmac('sha256', 'secret-key').update(payload).digest('hex');

      const req = {
        headers: { 'x-wallet-signature': sig },
        body: event,
        rawBody: payload,
      };
      const jsonMock = jest.fn();
      const statusMock = jest.fn(() => ({ json: jsonMock }));
      const res = { status: statusMock, json: jest.fn() };
      const next = jest.fn();

      await handler(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('returns 401 when signature is invalid', async () => {
      const handler = service.createIncomingWebhookHandler('secret-key');
      const req = {
        headers: { 'x-wallet-signature': 'bad-signature' },
        body: makeEvent('test'),
        rawBody: '{}',
      };
      const jsonMock = jest.fn();
      const statusMock = jest.fn(() => ({ json: jsonMock }));
      const res = { status: statusMock, json: jest.fn() };

      await handler(req, res, undefined);
      expect(statusMock).toHaveBeenCalledWith(401);
    });
  });
});
