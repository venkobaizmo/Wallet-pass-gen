import { BarcodeConfig } from './barcode.types';

export enum PassType {
  GENERIC = 'generic',
  EVENT_TICKET = 'eventTicket',
  COUPON = 'coupon',
  LOYALTY_CARD = 'storeCard',
  BOARDING_PASS = 'boardingPass',
  STORE_CARD = 'storeCard',
}

export enum WalletProvider {
  APPLE = 'apple',
  GOOGLE = 'google',
}

export enum TextAlignment {
  LEFT = 'PKTextAlignmentLeft',
  CENTER = 'PKTextAlignmentCenter',
  RIGHT = 'PKTextAlignmentRight',
  NATURAL = 'PKTextAlignmentNatural',
}

export enum DateStyle {
  NONE = 'PKDateStyleNone',
  SHORT = 'PKDateStyleShort',
  MEDIUM = 'PKDateStyleMedium',
  LONG = 'PKDateStyleLong',
  FULL = 'PKDateStyleFull',
}

export enum NumberStyle {
  DECIMAL = 'PKNumberStyleDecimal',
  PERCENT = 'PKNumberStylePercent',
  SCIENTIFIC = 'PKNumberStyleScientific',
  SPELL_OUT = 'PKNumberStyleSpellOut',
}

export interface PassStyle {
  backgroundColor?: string;
  foregroundColor?: string;
  labelColor?: string;
  stripColor?: string;
  logoText?: string;
}

export interface PassField {
  key: string;
  label?: string;
  value: string | number | Date;
  changeMessage?: string;
  textAlignment?: TextAlignment;
  dateStyle?: DateStyle;
  timeStyle?: DateStyle;
  numberStyle?: NumberStyle;
  currencyCode?: string;
  isRelative?: boolean;
}

export interface PassImage {
  type: 'logo' | 'icon' | 'background' | 'strip' | 'thumbnail' | 'footer';
  data: Buffer;
  scale?: 1 | 2 | 3;
  mimeType?: 'image/png' | 'image/jpeg';
}

export interface PassLocation {
  latitude: number;
  longitude: number;
  altitude?: number;
  relevantText?: string;
}

export interface PassBeacon {
  proximityUUID: string;
  major?: number;
  minor?: number;
  relevantText?: string;
}

export interface PassNFC {
  message: string;
  encryptionPublicKey?: string;
  requiresAuthentication?: boolean;
}

export interface PassInfo {
  serialNumber: string;
  description: string;
  organizationName: string;
  logoText?: string;
  relevantDate?: Date;
  expirationDate?: Date;
  voided?: boolean;
  userInfo?: Record<string, unknown>;
  appLaunchURL?: string;
  associatedStoreIdentifiers?: number[];
  webServiceURL?: string;
  authenticationToken?: string;
}

export interface PassData {
  type: PassType;
  info: PassInfo;
  style?: PassStyle;
  headerFields?: PassField[];
  primaryFields?: PassField[];
  secondaryFields?: PassField[];
  auxiliaryFields?: PassField[];
  backFields?: PassField[];
  barcode?: BarcodeConfig;
  images?: PassImage[];
  locations?: PassLocation[];
  beacons?: PassBeacon[];
  nfc?: PassNFC;
  maxDistance?: number;
}

export interface PassResult {
  passId: string;
  provider: WalletProvider;
  type: PassType;
  buffer?: Buffer;
  saveUrl?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}
