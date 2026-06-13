import { PassData, PassType, PassField } from '../../types/pass.types';
import { toAppleRgb } from '../../utils/crypto.utils';
import {
  ApplePassJSON,
  ApplePassStructure,
  ApplePassField,
  AppleBarcode,
  APPLE_BARCODE_FORMAT_MAP,
} from './apple.types';
import { AppleProviderConfig } from '../../types/provider.types';

function convertField(field: PassField): ApplePassField {
  const f: ApplePassField = {
    key: field.key,
    value:
      field.value instanceof Date
        ? field.value.toISOString()
        : (field.value as string | number),
  };
  if (field.label !== undefined) f.label = field.label;
  if (field.changeMessage !== undefined) f.changeMessage = field.changeMessage;
  if (field.textAlignment !== undefined) f.textAlignment = field.textAlignment;
  if (field.dateStyle !== undefined) f.dateStyle = field.dateStyle;
  if (field.timeStyle !== undefined) f.timeStyle = field.timeStyle;
  if (field.numberStyle !== undefined) f.numberStyle = field.numberStyle;
  if (field.currencyCode !== undefined) f.currencyCode = field.currencyCode;
  if (field.isRelative !== undefined) f.isRelative = field.isRelative;
  return f;
}

function buildStructure(passData: PassData): ApplePassStructure {
  const structure: ApplePassStructure = {};
  if (passData.headerFields?.length) {
    structure.headerFields = passData.headerFields.map(convertField);
  }
  if (passData.primaryFields?.length) {
    structure.primaryFields = passData.primaryFields.map(convertField);
  }
  if (passData.secondaryFields?.length) {
    structure.secondaryFields = passData.secondaryFields.map(convertField);
  }
  if (passData.auxiliaryFields?.length) {
    structure.auxiliaryFields = passData.auxiliaryFields.map(convertField);
  }
  if (passData.backFields?.length) {
    structure.backFields = passData.backFields.map(convertField);
  }
  return structure;
}

function buildBarcode(passData: PassData): AppleBarcode | undefined {
  if (!passData.barcode) return undefined;
  const { barcode } = passData;
  const format = APPLE_BARCODE_FORMAT_MAP[barcode.type] ?? 'PKBarcodeFormatQR';
  return {
    format,
    message: barcode.value,
    messageEncoding: barcode.messageEncoding ?? 'iso-8859-1',
    ...(barcode.alternateText ? { altText: barcode.alternateText } : {}),
  };
}

export function buildApplePassJSON(
  passData: PassData,
  config: AppleProviderConfig,
): ApplePassJSON {
  const structure = buildStructure(passData);
  const { info, style, type } = passData;

  const passJSON: ApplePassJSON = {
    formatVersion: 1,
    passTypeIdentifier: config.passTypeIdentifier,
    serialNumber: info.serialNumber,
    teamIdentifier: config.teamIdentifier,
    description: info.description,
    organizationName: info.organizationName,
  };

  // Style
  if (style?.backgroundColor) passJSON.backgroundColor = toAppleRgb(style.backgroundColor);
  if (style?.foregroundColor) passJSON.foregroundColor = toAppleRgb(style.foregroundColor);
  if (style?.labelColor) passJSON.labelColor = toAppleRgb(style.labelColor);
  if (style?.logoText ?? info.logoText) {
    passJSON.logoText = style?.logoText ?? info.logoText;
  }

  // Pass type structure
  switch (type) {
    case PassType.GENERIC:
      passJSON.generic = structure;
      break;
    case PassType.EVENT_TICKET:
      passJSON.eventTicket = structure;
      break;
    case PassType.COUPON:
      passJSON.coupon = structure;
      break;
    case PassType.LOYALTY_CARD:
    case PassType.STORE_CARD:
      passJSON.storeCard = structure;
      break;
    case PassType.BOARDING_PASS:
      passJSON.boardingPass = { ...structure, transitType: 'PKTransitTypeAir' };
      break;
    default:
      passJSON.generic = structure;
  }

  // Barcode
  const barcode = buildBarcode(passData);
  if (barcode) {
    passJSON.barcodes = [barcode];
    passJSON.barcode = barcode; // backwards compat
  }

  // Dates
  if (info.relevantDate) {
    passJSON.relevantDate =
      info.relevantDate instanceof Date
        ? info.relevantDate.toISOString()
        : new Date(info.relevantDate as unknown as string).toISOString();
  }
  if (info.expirationDate) {
    passJSON.expirationDate =
      info.expirationDate instanceof Date
        ? info.expirationDate.toISOString()
        : new Date(info.expirationDate as unknown as string).toISOString();
  }
  if (info.voided !== undefined) {
    passJSON.voided = info.voided;
  }

  // Locations
  if (passData.locations?.length) {
    passJSON.locations = passData.locations.map((loc) => ({
      latitude: loc.latitude,
      longitude: loc.longitude,
      ...(loc.altitude !== undefined ? { altitude: loc.altitude } : {}),
      ...(loc.relevantText ? { relevantText: loc.relevantText } : {}),
    }));
  }

  // Beacons
  if (passData.beacons?.length) {
    passJSON.beacons = passData.beacons.map((b) => ({
      proximityUUID: b.proximityUUID,
      ...(b.major !== undefined ? { major: b.major } : {}),
      ...(b.minor !== undefined ? { minor: b.minor } : {}),
      ...(b.relevantText ? { relevantText: b.relevantText } : {}),
    }));
  }

  // Max distance
  if (passData.maxDistance !== undefined) {
    passJSON.maxDistance = passData.maxDistance;
  }

  // NFC
  if (passData.nfc) {
    passJSON.nfc = {
      message: passData.nfc.message,
      ...(passData.nfc.encryptionPublicKey
        ? { encryptionPublicKey: passData.nfc.encryptionPublicKey }
        : {}),
      ...(passData.nfc.requiresAuthentication !== undefined
        ? { requiresAuthentication: passData.nfc.requiresAuthentication }
        : {}),
    };
  }

  // Web service
  const wsUrl = info.webServiceURL ?? config.webServiceURL;
  const authToken = info.authenticationToken ?? config.authenticationToken;
  if (wsUrl) passJSON.webServiceURL = wsUrl;
  if (authToken) passJSON.authenticationToken = authToken;

  // App integration
  if (info.appLaunchURL) passJSON.appLaunchURL = info.appLaunchURL;
  if (info.associatedStoreIdentifiers?.length) {
    passJSON.associatedStoreIdentifiers = info.associatedStoreIdentifiers;
  }
  if (info.userInfo) passJSON.userInfo = info.userInfo;

  return passJSON;
}
