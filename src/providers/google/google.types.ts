/** Google Wallet REST API types */

export interface GoogleLocalizedString {
  defaultValue: {
    language: string;
    value: string;
  };
  translatedValues?: Array<{ language: string; value: string }>;
}

export interface GoogleImageUri {
  uri: string;
  description?: string;
  localizedDescription?: GoogleLocalizedString;
}

export interface GoogleMoney {
  micros: string;
  currencyCode: string;
  kind?: string;
}

export interface GoogleBarcode {
  type: string;           // e.g. 'QR_CODE', 'PDF_417', 'AZTEC', 'CODE_128'
  value: string;
  alternateText?: string;
  renderEncoding?: string;
  showCodeText?: GoogleLocalizedString;
}

export interface GoogleTextModuleData {
  id?: string;
  header?: string;
  body: string;
  localizedHeader?: GoogleLocalizedString;
  localizedBody?: GoogleLocalizedString;
}

export interface GoogleImageModuleData {
  id?: string;
  mainImage: GoogleImageUri;
}

export interface GoogleLinksModuleData {
  uris: Array<{
    uri: string;
    description: string;
    id?: string;
    kind?: string;
    localizedDescription?: GoogleLocalizedString;
  }>;
}

export interface GoogleLatLongPoint {
  kind?: string;
  latitude: number;
  longitude: number;
}

export interface GoogleClassTemplateInfo {
  cardTemplateOverride?: {
    cardRowTemplateInfos?: unknown[];
  };
}

// ─── Generic class / object ──────────────────────────────────────────────────

export interface GoogleGenericClass {
  id: string;
  issuerName: string;
  reviewStatus?: string;
  enableSmartTap?: boolean;
  classTemplateInfo?: GoogleClassTemplateInfo;
  multipleDevicesAndHoldersAllowedStatus?: string;
}

export interface GoogleGenericObject {
  id: string;
  classId: string;
  genericType?: string;
  cardTitle?: GoogleLocalizedString;
  header?: GoogleLocalizedString;
  subheader?: GoogleLocalizedString;
  logo?: GoogleImageUri;
  heroImage?: GoogleImageUri;
  thumbnail?: GoogleImageUri;
  barcode?: GoogleBarcode;
  textModulesData?: GoogleTextModuleData[];
  imageModulesData?: GoogleImageModuleData[];
  linksModuleData?: GoogleLinksModuleData;
  validTimeInterval?: {
    start?: { date: string };
    end?: { date: string };
  };
  locations?: GoogleLatLongPoint[];
  hexBackgroundColor?: string;
  state?: string;
  hasLinkedDevice?: boolean;
  disableExpirationNotification?: boolean;
}

// ─── Event ticket class / object ─────────────────────────────────────────────

export interface GoogleEventTicketClass {
  id: string;
  issuerName: string;
  eventName: GoogleLocalizedString;
  logo?: GoogleImageUri;
  heroImage?: GoogleImageUri;
  venue?: { name?: GoogleLocalizedString; address?: GoogleLocalizedString };
  dateTime?: {
    start?: string;
    end?: string;
    doorsOpen?: string;
    doorsOpenLabel?: string;
  };
  reviewStatus?: string;
  hexBackgroundColor?: string;
}

export interface GoogleEventTicketObject {
  id: string;
  classId: string;
  ticketHolderName?: string;
  ticketNumber?: string;
  barcode?: GoogleBarcode;
  textModulesData?: GoogleTextModuleData[];
  imageModulesData?: GoogleImageModuleData[];
  linksModuleData?: GoogleLinksModuleData;
  validTimeInterval?: { start?: { date: string }; end?: { date: string } };
  hexBackgroundColor?: string;
  state?: string;
  seatInfo?: {
    seat?: GoogleLocalizedString;
    row?: GoogleLocalizedString;
    section?: GoogleLocalizedString;
    gate?: GoogleLocalizedString;
  };
}

// ─── Loyalty class / object ──────────────────────────────────────────────────

export interface GoogleLoyaltyClass {
  id: string;
  issuerName: string;
  programName: string;
  programLogo: GoogleImageUri;
  rewardsTierLabel?: string;
  rewardsTier?: string;
  reviewStatus?: string;
  hexBackgroundColor?: string;
}

export interface GoogleLoyaltyObject {
  id: string;
  classId: string;
  accountId?: string;
  accountName?: string;
  barcode?: GoogleBarcode;
  loyaltyPoints?: {
    balance?: { string?: string; double?: number; int?: number; money?: GoogleMoney };
    label?: string;
    localizedLabel?: GoogleLocalizedString;
  };
  textModulesData?: GoogleTextModuleData[];
  imageModulesData?: GoogleImageModuleData[];
  linksModuleData?: GoogleLinksModuleData;
  hexBackgroundColor?: string;
  state?: string;
}

// ─── Offer class / object ────────────────────────────────────────────────────

export interface GoogleOfferClass {
  id: string;
  issuerName: string;
  title: string;
  redemptionChannel: string;
  provider: string;
  reviewStatus?: string;
  hexBackgroundColor?: string;
}

export interface GoogleOfferObject {
  id: string;
  classId: string;
  barcode?: GoogleBarcode;
  textModulesData?: GoogleTextModuleData[];
  imageModulesData?: GoogleImageModuleData[];
  linksModuleData?: GoogleLinksModuleData;
  validTimeInterval?: { start?: { date: string }; end?: { date: string } };
  hexBackgroundColor?: string;
  state?: string;
}

/** JWT payload for Google Pay save link */
export interface GoogleSaveJWTPayload {
  iss: string;
  aud: string;
  typ: string;
  iat: number;
  origins?: string[];
  payload: {
    genericClasses?: GoogleGenericClass[];
    genericObjects?: GoogleGenericObject[];
    eventTicketClasses?: GoogleEventTicketClass[];
    eventTicketObjects?: GoogleEventTicketObject[];
    loyaltyClasses?: GoogleLoyaltyClass[];
    loyaltyObjects?: GoogleLoyaltyObject[];
    offerClasses?: GoogleOfferClass[];
    offerObjects?: GoogleOfferObject[];
  };
}

/** Google Wallet barcode type mapping from our BarcodeType enum */
export const GOOGLE_BARCODE_TYPE_MAP: Record<string, string> = {
  QR_CODE: 'QR_CODE',
  PDF_417: 'PDF_417',
  AZTEC: 'AZTEC',
  CODE_128: 'CODE_128',
  CODE_39: 'CODE_39',
  EAN_13: 'EAN_13',
  UPC_A: 'UPC_A',
  DATA_MATRIX: 'DATA_MATRIX',
};
