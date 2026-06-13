/** Apple PKPass JSON schema types */

export interface AppleBarcode {
  format: string;               // e.g. 'PKBarcodeFormatQR'
  message: string;
  messageEncoding: string;
  altText?: string;
}

export interface AppleLocation {
  latitude: number;
  longitude: number;
  altitude?: number;
  relevantText?: string;
}

export interface AppleBeacon {
  proximityUUID: string;
  major?: number;
  minor?: number;
  relevantText?: string;
}

export interface AppleNFC {
  message: string;
  encryptionPublicKey?: string;
  requiresAuthentication?: boolean;
}

export interface ApplePassField {
  key: string;
  label?: string;
  value: string | number;
  changeMessage?: string;
  textAlignment?: string;
  dateStyle?: string;
  timeStyle?: string;
  numberStyle?: string;
  currencyCode?: string;
  isRelative?: boolean;
}

export interface ApplePassStructure {
  headerFields?: ApplePassField[];
  primaryFields?: ApplePassField[];
  secondaryFields?: ApplePassField[];
  auxiliaryFields?: ApplePassField[];
  backFields?: ApplePassField[];
}

export interface ApplePassJSON {
  formatVersion: 1;
  passTypeIdentifier: string;
  serialNumber: string;
  teamIdentifier: string;
  description: string;
  organizationName: string;

  // Style
  backgroundColor?: string;
  foregroundColor?: string;
  labelColor?: string;
  logoText?: string;

  // Pass structure (one of these keys based on pass type)
  generic?: ApplePassStructure;
  eventTicket?: ApplePassStructure;
  coupon?: ApplePassStructure;
  storeCard?: ApplePassStructure;
  boardingPass?: ApplePassStructure & { transitType?: string };

  // Barcode(s)
  barcodes?: AppleBarcode[];
  barcode?: AppleBarcode;   // deprecated but still supported

  // Metadata
  relevantDate?: string;
  expirationDate?: string;
  voided?: boolean;
  locations?: AppleLocation[];
  beacons?: AppleBeacon[];
  maxDistance?: number;
  nfc?: AppleNFC;

  // Web service
  webServiceURL?: string;
  authenticationToken?: string;

  // App integration
  appLaunchURL?: string;
  associatedStoreIdentifiers?: number[];
  userInfo?: Record<string, unknown>;
}

/** Map from our BarcodeType enum values to Apple's PKBarcodeFormat strings */
export const APPLE_BARCODE_FORMAT_MAP: Record<string, string> = {
  QR_CODE: 'PKBarcodeFormatQR',
  PDF_417: 'PKBarcodeFormatPDF417',
  AZTEC: 'PKBarcodeFormatAztec',
  CODE_128: 'PKBarcodeFormatCode128',
  CODE_39: 'PKBarcodeFormatCode128', // Apple doesn't have CODE_39 natively; fall back
  EAN_13: 'PKBarcodeFormatCode128',
  UPC_A: 'PKBarcodeFormatCode128',
  DATA_MATRIX: 'PKBarcodeFormatAztec',
};
