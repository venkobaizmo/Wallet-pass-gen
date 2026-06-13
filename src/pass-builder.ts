import {
  PassData,
  PassType,
  PassInfo,
  PassStyle,
  PassField,
  PassImage,
  PassLocation,
  PassBeacon,
  PassNFC,
} from './types/pass.types';
import { BarcodeConfig } from './types/barcode.types';
import { PassValidationError } from './errors';
import { generateSerialNumber } from './utils/crypto.utils';

/** Deep clone that preserves Date, Buffer, and primitive values correctly. */
function deepClone<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return new Date(value.getTime()) as unknown as T;
  if (Buffer.isBuffer(value)) return Buffer.from(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => deepClone(v)) as unknown as T;
  if (typeof value === 'object') {
    const clone: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      clone[k] = deepClone(v);
    }
    return clone as T;
  }
  return value;
}

export class PassBuilder {
  private passData: Partial<PassData> = {};

  // ─── Type & info ───────────────────────────────────────────────────────────

  setType(type: PassType): this {
    this.passData.type = type;
    return this;
  }

  setInfo(info: PassInfo): this {
    this.passData.info = { ...info };
    return this;
  }

  // ─── Style ─────────────────────────────────────────────────────────────────

  setStyle(style: PassStyle): this {
    this.passData.style = { ...style };
    return this;
  }

  // ─── Barcode ───────────────────────────────────────────────────────────────

  setBarcode(barcode: BarcodeConfig): this {
    this.passData.barcode = { ...barcode };
    return this;
  }

  // ─── Fields ────────────────────────────────────────────────────────────────

  addHeaderField(field: PassField): this {
    this.passData.headerFields = [...(this.passData.headerFields ?? []), { ...field }];
    return this;
  }

  addPrimaryField(field: PassField): this {
    this.passData.primaryFields = [...(this.passData.primaryFields ?? []), { ...field }];
    return this;
  }

  addSecondaryField(field: PassField): this {
    this.passData.secondaryFields = [...(this.passData.secondaryFields ?? []), { ...field }];
    return this;
  }

  addAuxiliaryField(field: PassField): this {
    this.passData.auxiliaryFields = [...(this.passData.auxiliaryFields ?? []), { ...field }];
    return this;
  }

  addBackField(field: PassField): this {
    this.passData.backFields = [...(this.passData.backFields ?? []), { ...field }];
    return this;
  }

  // ─── Images ────────────────────────────────────────────────────────────────

  addImage(image: PassImage): this {
    this.passData.images = [...(this.passData.images ?? []), { ...image }];
    return this;
  }

  // ─── Location / Beacon / NFC ───────────────────────────────────────────────

  addLocation(location: PassLocation): this {
    this.passData.locations = [...(this.passData.locations ?? []), { ...location }];
    return this;
  }

  addBeacon(beacon: PassBeacon): this {
    this.passData.beacons = [...(this.passData.beacons ?? []), { ...beacon }];
    return this;
  }

  setNFC(nfc: PassNFC): this {
    this.passData.nfc = { ...nfc };
    return this;
  }

  setMaxDistance(meters: number): this {
    if (meters <= 0) {
      throw new PassValidationError('maxDistance must be a positive number');
    }
    this.passData.maxDistance = meters;
    return this;
  }

  // ─── Build ─────────────────────────────────────────────────────────────────

  build(): PassData {
    if (!this.passData.type) {
      throw new PassValidationError('Pass type is required — call setType() before build()');
    }
    if (!this.passData.info) {
      throw new PassValidationError('Pass info is required — call setInfo() before build()');
    }
    if (!this.passData.info.serialNumber) {
      // Auto-generate serial number if not provided
      this.passData.info = {
        ...this.passData.info,
        serialNumber: generateSerialNumber(),
      };
    }
    if (!this.passData.info.description) {
      throw new PassValidationError('Pass info.description is required');
    }
    if (!this.passData.info.organizationName) {
      throw new PassValidationError('Pass info.organizationName is required');
    }

    // Return a deep copy that preserves Date instances
    return deepClone(this.passData) as PassData;
  }

  // ─── Static factory methods ────────────────────────────────────────────────

  static eventTicket(): PassBuilder {
    return new PassBuilder().setType(PassType.EVENT_TICKET);
  }

  static coupon(): PassBuilder {
    return new PassBuilder().setType(PassType.COUPON);
  }

  static loyaltyCard(): PassBuilder {
    return new PassBuilder().setType(PassType.LOYALTY_CARD);
  }

  static boardingPass(): PassBuilder {
    return new PassBuilder().setType(PassType.BOARDING_PASS);
  }

  static generic(): PassBuilder {
    return new PassBuilder().setType(PassType.GENERIC);
  }
}
