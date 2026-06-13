import { PassData, PassType, PassField } from '../../types/pass.types';
import { toGoogleHex } from '../../utils/crypto.utils';
import { GoogleProviderConfig } from '../../types/provider.types';
import {
  GoogleGenericObject,
  GoogleGenericClass,
  GoogleEventTicketClass,
  GoogleEventTicketObject,
  GoogleLoyaltyClass,
  GoogleLoyaltyObject,
  GoogleOfferClass,
  GoogleOfferObject,
  GoogleBarcode,
  GoogleLocalizedString,
  GoogleTextModuleData,
  GOOGLE_BARCODE_TYPE_MAP,
} from './google.types';

function localString(value: string, lang = 'en'): GoogleLocalizedString {
  return { defaultValue: { language: lang, value } };
}

function buildBarcode(passData: PassData): GoogleBarcode | undefined {
  if (!passData.barcode) return undefined;
  const { barcode } = passData;
  return {
    type: GOOGLE_BARCODE_TYPE_MAP[barcode.type] ?? 'QR_CODE',
    value: barcode.value,
    ...(barcode.alternateText ? { alternateText: barcode.alternateText } : {}),
    renderEncoding: barcode.messageEncoding ?? 'UTF_8',
  };
}

function buildTextModules(fields: PassField[]): GoogleTextModuleData[] {
  return fields.map((f, idx) => ({
    id: f.key || `field_${idx}`,
    header: f.label ?? f.key,
    body: f.value instanceof Date ? f.value.toISOString() : String(f.value),
  }));
}

function collectAllFields(passData: PassData): PassField[] {
  return [
    ...(passData.headerFields ?? []),
    ...(passData.primaryFields ?? []),
    ...(passData.secondaryFields ?? []),
    ...(passData.auxiliaryFields ?? []),
    ...(passData.backFields ?? []),
  ];
}

export interface GooglePassObjects {
  genericClass?: GoogleGenericClass;
  genericObject?: GoogleGenericObject;
  eventTicketClass?: GoogleEventTicketClass;
  eventTicketObject?: GoogleEventTicketObject;
  loyaltyClass?: GoogleLoyaltyClass;
  loyaltyObject?: GoogleLoyaltyObject;
  offerClass?: GoogleOfferClass;
  offerObject?: GoogleOfferObject;
  objectType: 'generic' | 'eventTicket' | 'loyalty' | 'offer';
}

export function buildGooglePassObjects(
  passData: PassData,
  config: GoogleProviderConfig,
): GooglePassObjects {
  const { info, style, type } = passData;
  const issuerId = config.issuerId;
  const classId = config.classId ?? `${issuerId}.${type}`;
  const objectId = `${issuerId}.${info.serialNumber}`;
  const bgColor = style?.backgroundColor ? toGoogleHex(style.backgroundColor) : undefined;

  const barcode = buildBarcode(passData);
  const allFields = collectAllFields(passData);
  const textModulesData = allFields.length > 0 ? buildTextModules(allFields) : undefined;

  const baseObjectProps = {
    id: objectId,
    classId,
    state: info.voided ? 'INACTIVE' : 'ACTIVE',
    ...(barcode ? { barcode } : {}),
    ...(textModulesData ? { textModulesData } : {}),
    ...(bgColor ? { hexBackgroundColor: bgColor } : {}),
    ...(info.expirationDate
      ? {
          validTimeInterval: {
            end: { date: info.expirationDate.toISOString() },
          },
        }
      : {}),
  };

  switch (type) {
    case PassType.EVENT_TICKET: {
      const eventClass: GoogleEventTicketClass = {
        id: classId,
        issuerName: info.organizationName,
        eventName: localString(info.description),
        reviewStatus: 'underReview',
        ...(bgColor ? { hexBackgroundColor: bgColor } : {}),
      };

      const eventObject: GoogleEventTicketObject = {
        ...baseObjectProps,
        ...(info.logoText ? { ticketHolderName: info.logoText } : {}),
      };

      return { eventTicketClass: eventClass, eventTicketObject: eventObject, objectType: 'eventTicket' };
    }

    case PassType.LOYALTY_CARD:
    case PassType.STORE_CARD: {
      const loyaltyClass: GoogleLoyaltyClass = {
        id: classId,
        issuerName: info.organizationName,
        programName: info.description,
        programLogo: {
          uri: 'https://example.com/logo.png',
          description: info.organizationName,
        },
        reviewStatus: 'underReview',
        ...(bgColor ? { hexBackgroundColor: bgColor } : {}),
      };

      const loyaltyObject: GoogleLoyaltyObject = {
        ...baseObjectProps,
        ...(info.logoText ? { accountName: info.logoText } : {}),
      };

      return { loyaltyClass, loyaltyObject, objectType: 'loyalty' };
    }

    case PassType.COUPON: {
      const offerClass: GoogleOfferClass = {
        id: classId,
        issuerName: info.organizationName,
        title: info.description,
        redemptionChannel: 'BOTH',
        provider: info.organizationName,
        reviewStatus: 'underReview',
        ...(bgColor ? { hexBackgroundColor: bgColor } : {}),
      };

      const offerObject: GoogleOfferObject = { ...baseObjectProps };

      return { offerClass, offerObject, objectType: 'offer' };
    }

    case PassType.BOARDING_PASS:
    case PassType.GENERIC:
    default: {
      const genericClass: GoogleGenericClass = {
        id: classId,
        issuerName: info.organizationName,
        reviewStatus: 'underReview',
        multipleDevicesAndHoldersAllowedStatus: 'ONE_USER_ALL_DEVICES',
      };

      const genericObject: GoogleGenericObject = {
        ...baseObjectProps,
        cardTitle: localString(info.organizationName),
        header: localString(info.description),
        ...(info.logoText ? { subheader: localString(info.logoText) } : {}),
      };

      return { genericClass, genericObject, objectType: 'generic' };
    }
  }
}
