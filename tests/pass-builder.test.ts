import { PassBuilder } from '../src/pass-builder';
import { PassType, TextAlignment } from '../src/types/pass.types';
import { BarcodeType } from '../src/types/barcode.types';
import { PassValidationError } from '../src/errors';

const baseInfo = {
  serialNumber: 'test-serial-001',
  description: 'Test Pass',
  organizationName: 'Test Org',
};

describe('PassBuilder', () => {
  describe('basic construction', () => {
    it('builds a valid PassData with required fields', () => {
      const pass = new PassBuilder()
        .setType(PassType.GENERIC)
        .setInfo(baseInfo)
        .build();

      expect(pass.type).toBe(PassType.GENERIC);
      expect(pass.info.serialNumber).toBe('test-serial-001');
      expect(pass.info.description).toBe('Test Pass');
      expect(pass.info.organizationName).toBe('Test Org');
    });

    it('auto-generates a serialNumber if not provided', () => {
      const pass = new PassBuilder()
        .setType(PassType.GENERIC)
        .setInfo({ description: 'Auto Serial', organizationName: 'Org', serialNumber: '' })
        .build();

      expect(pass.info.serialNumber).toBeTruthy();
      expect(pass.info.serialNumber.length).toBeGreaterThan(0);
    });

    it('throws PassValidationError if type is missing', () => {
      expect(() =>
        new PassBuilder().setInfo(baseInfo).build(),
      ).toThrow(PassValidationError);
    });

    it('throws PassValidationError if info is missing', () => {
      expect(() =>
        new PassBuilder().setType(PassType.GENERIC).build(),
      ).toThrow(PassValidationError);
    });

    it('throws PassValidationError if description is missing', () => {
      expect(() =>
        new PassBuilder()
          .setType(PassType.GENERIC)
          .setInfo({ ...baseInfo, description: '' })
          .build(),
      ).toThrow(PassValidationError);
    });

    it('throws PassValidationError if organizationName is missing', () => {
      expect(() =>
        new PassBuilder()
          .setType(PassType.GENERIC)
          .setInfo({ ...baseInfo, organizationName: '' })
          .build(),
      ).toThrow(PassValidationError);
    });
  });

  describe('style', () => {
    it('sets style correctly', () => {
      const pass = new PassBuilder()
        .setType(PassType.COUPON)
        .setInfo(baseInfo)
        .setStyle({ backgroundColor: '#FF0000', foregroundColor: '#FFFFFF' })
        .build();

      expect(pass.style?.backgroundColor).toBe('#FF0000');
      expect(pass.style?.foregroundColor).toBe('#FFFFFF');
    });
  });

  describe('fields', () => {
    it('adds header, primary, secondary, auxiliary and back fields', () => {
      const pass = new PassBuilder()
        .setType(PassType.EVENT_TICKET)
        .setInfo(baseInfo)
        .addHeaderField({ key: 'h1', value: 'Header', label: 'HDR' })
        .addPrimaryField({ key: 'p1', value: 'Primary', label: 'PRI' })
        .addSecondaryField({ key: 's1', value: 'Secondary', label: 'SEC' })
        .addAuxiliaryField({ key: 'a1', value: 'Aux', label: 'AUX' })
        .addBackField({ key: 'b1', value: 'Back', label: 'BCK' })
        .build();

      expect(pass.headerFields).toHaveLength(1);
      expect(pass.primaryFields).toHaveLength(1);
      expect(pass.secondaryFields).toHaveLength(1);
      expect(pass.auxiliaryFields).toHaveLength(1);
      expect(pass.backFields).toHaveLength(1);
      expect(pass.headerFields![0].key).toBe('h1');
    });

    it('accumulates multiple fields of the same type', () => {
      const pass = new PassBuilder()
        .setType(PassType.GENERIC)
        .setInfo(baseInfo)
        .addPrimaryField({ key: 'p1', value: 'first', label: 'First' })
        .addPrimaryField({ key: 'p2', value: 'second', label: 'Second' })
        .build();

      expect(pass.primaryFields).toHaveLength(2);
    });

    it('supports textAlignment in fields', () => {
      const pass = new PassBuilder()
        .setType(PassType.GENERIC)
        .setInfo(baseInfo)
        .addPrimaryField({
          key: 'p1',
          value: 'centered',
          textAlignment: TextAlignment.CENTER,
        })
        .build();

      expect(pass.primaryFields![0].textAlignment).toBe(TextAlignment.CENTER);
    });
  });

  describe('barcode', () => {
    it('sets barcode configuration', () => {
      const pass = new PassBuilder()
        .setType(PassType.COUPON)
        .setInfo(baseInfo)
        .setBarcode({ type: BarcodeType.QR_CODE, value: 'https://example.com' })
        .build();

      expect(pass.barcode?.type).toBe(BarcodeType.QR_CODE);
      expect(pass.barcode?.value).toBe('https://example.com');
    });
  });

  describe('images', () => {
    it('adds images', () => {
      const fakeBuffer = Buffer.from('fake-image-data');
      const pass = new PassBuilder()
        .setType(PassType.GENERIC)
        .setInfo(baseInfo)
        .addImage({ type: 'logo', data: fakeBuffer, scale: 2 })
        .build();

      expect(pass.images).toHaveLength(1);
      expect(pass.images![0].type).toBe('logo');
    });
  });

  describe('locations & beacons', () => {
    it('adds locations', () => {
      const pass = new PassBuilder()
        .setType(PassType.GENERIC)
        .setInfo(baseInfo)
        .addLocation({ latitude: 37.33, longitude: -122.03, relevantText: 'Near Apple HQ' })
        .build();

      expect(pass.locations).toHaveLength(1);
      expect(pass.locations![0].latitude).toBe(37.33);
    });

    it('adds beacons', () => {
      const pass = new PassBuilder()
        .setType(PassType.GENERIC)
        .setInfo(baseInfo)
        .addBeacon({
          proximityUUID: '11111111-1111-1111-1111-111111111111',
          major: 1,
          minor: 2,
        })
        .build();

      expect(pass.beacons).toHaveLength(1);
      expect(pass.beacons![0].major).toBe(1);
    });
  });

  describe('NFC', () => {
    it('sets NFC configuration', () => {
      const pass = new PassBuilder()
        .setType(PassType.GENERIC)
        .setInfo(baseInfo)
        .setNFC({ message: 'nfc-message', requiresAuthentication: true })
        .build();

      expect(pass.nfc?.message).toBe('nfc-message');
      expect(pass.nfc?.requiresAuthentication).toBe(true);
    });
  });

  describe('maxDistance', () => {
    it('sets maxDistance', () => {
      const pass = new PassBuilder()
        .setType(PassType.GENERIC)
        .setInfo(baseInfo)
        .setMaxDistance(500)
        .build();

      expect(pass.maxDistance).toBe(500);
    });

    it('throws if maxDistance is not positive', () => {
      expect(() =>
        new PassBuilder()
          .setType(PassType.GENERIC)
          .setInfo(baseInfo)
          .setMaxDistance(-1),
      ).toThrow(PassValidationError);
    });
  });

  describe('static factory methods', () => {
    it('PassBuilder.eventTicket() sets EVENT_TICKET type', () => {
      const pass = PassBuilder.eventTicket().setInfo(baseInfo).build();
      expect(pass.type).toBe(PassType.EVENT_TICKET);
    });

    it('PassBuilder.coupon() sets COUPON type', () => {
      const pass = PassBuilder.coupon().setInfo(baseInfo).build();
      expect(pass.type).toBe(PassType.COUPON);
    });

    it('PassBuilder.loyaltyCard() sets LOYALTY_CARD type', () => {
      const pass = PassBuilder.loyaltyCard().setInfo(baseInfo).build();
      expect(pass.type).toBe(PassType.LOYALTY_CARD);
    });

    it('PassBuilder.boardingPass() sets BOARDING_PASS type', () => {
      const pass = PassBuilder.boardingPass().setInfo(baseInfo).build();
      expect(pass.type).toBe(PassType.BOARDING_PASS);
    });

    it('PassBuilder.generic() sets GENERIC type', () => {
      const pass = PassBuilder.generic().setInfo(baseInfo).build();
      expect(pass.type).toBe(PassType.GENERIC);
    });
  });

  describe('method chaining', () => {
    it('supports full fluent chain', () => {
      const pass = PassBuilder.generic()
        .setInfo(baseInfo)
        .setStyle({ backgroundColor: '#000' })
        .addPrimaryField({ key: 'name', value: 'John', label: 'Name' })
        .addSecondaryField({ key: 'date', value: '2024-01-01', label: 'Date' })
        .setBarcode({ type: BarcodeType.QR_CODE, value: 'test' })
        .build();

      expect(pass.type).toBe(PassType.GENERIC);
      expect(pass.style?.backgroundColor).toBe('#000');
      expect(pass.primaryFields).toHaveLength(1);
      expect(pass.secondaryFields).toHaveLength(1);
      expect(pass.barcode?.value).toBe('test');
    });
  });
});
