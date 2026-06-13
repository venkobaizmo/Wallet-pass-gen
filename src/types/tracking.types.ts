export enum TrackingEvent {
  INSTALL = 'install',
  OPEN = 'open',
  SCAN = 'scan',
  UPDATE = 'update',
  VOID = 'void',
  EXPIRATION = 'expiration',
}

export enum WebhookMethod {
  POST = 'POST',
  PUT = 'PUT',
}

export interface WebhookConfig {
  url: string;
  secret?: string;
  method?: WebhookMethod;
  headers?: Record<string, string>;
  events?: TrackingEvent[];
  retryAttempts?: number;
  retryDelay?: number;
  timeout?: number;
}

export interface TrackingEventData {
  event: TrackingEvent;
  passId: string;
  provider: string;
  timestamp: Date;
  deviceInfo?: {
    os?: string;
    osVersion?: string;
    deviceId?: string;
  };
  location?: {
    latitude?: number;
    longitude?: number;
  };
  metadata?: Record<string, unknown>;
}

export interface TrackingInfo {
  passId: string;
  installs: number;
  opens: number;
  scans: number;
  lastActivity?: Date;
  events: TrackingEventData[];
}

export interface TrackingConfig {
  storage?: 'memory' | 'custom';
  customStorage?: TrackingStorage;
  webhooks?: WebhookConfig[];
  maxEventsPerPass?: number;
}

export interface TrackingStorage {
  save(event: TrackingEventData): Promise<void>;
  getByPassId(passId: string): Promise<TrackingEventData[]>;
  getAll(): Promise<TrackingEventData[]>;
  delete(passId: string): Promise<void>;
}
