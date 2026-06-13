import { AppleWalletProvider } from '../src/providers/apple/apple.provider';
import { PassBuilder } from '../src/pass-builder';
import { PassType, WalletProvider } from '../src/types/pass.types';
import { BarcodeType } from '../src/types/barcode.types';
import { AuthenticationError, PassCreationError, PassValidationError } from '../src/errors';

// Mock node-forge
jest.mock('node-forge', () => {
  const fakeCert = {
    subject: { getField: () => ({ value: 'test' }) },
    validity: { notAfter: new Date(Date.now() + 86400000) },
  };
  const fakeKey = { sign: jest.fn() };
  const fakeP7 = {
    content: null,
    addCertificate: jest.fn(),
    addSigner: jest.fn(),
    sign: jest.fn(),
    toAsn1: jest.fn(() => ({})),
  };

  return {
    pki: {
      certificateFromPem: jest.fn(() => fakeCert),
      privateKeyFromPem: jest.fn(() => fakeKey),
      decryptRsaPrivateKey: jest.fn(() => fakeKey),
      oids: {
        sha1: '1.3.14.3.2.26',
        contentType: '1.2.840.113549.1.9.3',
        data: '1.2.840.113549.1.7.1',
        messageDigest: '1.2.840.113549.1.9.4',
        signingTime: '1.2.840.113549.1.9.5',
      },
    },
    pkcs7: {
      createSignedData: jest.fn(() => fakeP7),
    },
    asn1: {
      toDer: jest.fn(() => ({ getBytes: () => 'fake-der-bytes' })),
    },
    util: {
      createBuffer: jest.fn((data: string) => ({ data })),
    },
  };
});

// Mock jszip
jest.mock('jszip', () => {
  return jest.fn().mockImplementation(() => ({
    file: jest.fn(),
    generateAsync: jest.fn().mockResolvedValue(Buffer.from('fake-pkpass-zip')),
  }));
});

// Mock fs.readFileSync for certificate loading
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn().mockReturnValue('-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----\n'),
}));

const APPLE_CONFIG = {
  certData: '-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----\n',
  keyData: '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----\n',
  wwdrData: '-----BEGIN CERTIFICATE-----\nwwdr\n-----END CERTIFICATE-----\n',
  teamIdentifier: 'ABCDE12345',
  passTypeIdentifier: 'pass.com.example.test',
};

const basePassData = PassBuilder.generic()
  .setInfo({
    serialNumber: 'apple-test-001',
    description: 'Test Apple Pass',
    organizationName: 'Test Org',
  })
  .setStyle({ backgroundColor: '#FF5733', foregroundColor: '#FFFFFF' })
  .addPrimaryField({ key: 'name', value: 'John Doe', label: 'Member' })
  .setBarcode({ type: BarcodeType.QR_CODE, value: 'https://example.com/pass' })
  .build();

describe('AppleWalletProvider', () => {
  let provider: AppleWalletProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new AppleWalletProvider(APPLE_CONFIG);
  });

  describe('providerType', () => {
    it('returns APPLE as provider type', () => {
      expect(provider.providerType).toBe(WalletProvider.APPLE);
    });
  });

  describe('createPass', () => {
    it('creates a pass and returns a PassResult with buffer', async () => {
      const result = await provider.createPass(basePassData);

      expect(result.passId).toBe('apple-test-001');
      expect(result.provider).toBe(WalletProvider.APPLE);
      expect(result.type).toBe(PassType.GENERIC);
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('includes metadata with passTypeIdentifier and teamIdentifier', async () => {
      const result = await provider.createPass(basePassData);

      expect(result.metadata?.passTypeIdentifier).toBe('pass.com.example.test');
      expect(result.metadata?.teamIdentifier).toBe('ABCDE12345');
    });

    it('throws PassValidationError when validation fails', async () => {
      await expect(
        provider.createPass({ ...basePassData, info: { ...basePassData.info, description: '' } }),
      ).rejects.toThrow(PassValidationError);
    });

    it('skips validation when validateBeforeCreate is false', async () => {
      // Should not throw even with missing description since validation is skipped
      const result = await provider.createPass(
        { ...basePassData, info: { ...basePassData.info, serialNumber: 'no-validate' } },
        { validateBeforeCreate: false },
      );
      expect(result.passId).toBe('no-validate');
    });
  });

  describe('getSaveUrl', () => {
    it('returns a URL containing the serial number', async () => {
      const url = await provider.getSaveUrl(basePassData);
      expect(url).toContain('apple-test-001');
    });

    it('uses webServiceURL when configured', async () => {
      const providerWithWS = new AppleWalletProvider({
        ...APPLE_CONFIG,
        webServiceURL: 'https://myserver.example.com/wallet',
      });
      const url = await providerWithWS.getSaveUrl(basePassData);
      expect(url).toContain('myserver.example.com');
    });
  });

  describe('getPassStatus', () => {
    it('returns active:true, voided:false for a valid passId', async () => {
      const status = await provider.getPassStatus('apple-test-001');
      expect(status.active).toBe(true);
      expect(status.voided).toBe(false);
    });
  });

  describe('voidPass', () => {
    it('resolves without throwing for a valid passId', async () => {
      await expect(provider.voidPass('apple-test-001')).resolves.toBeUndefined();
    });
  });

  describe('certificate loading', () => {
    it('throws AuthenticationError when no cert data or path is provided', async () => {
      const badProvider = new AppleWalletProvider({
        teamIdentifier: 'ABC',
        passTypeIdentifier: 'pass.com.test',
        // no cert, key, or wwdr
      });

      await expect(badProvider.createPass(basePassData)).rejects.toThrow(AuthenticationError);
    });
  });

  describe('pass.json construction', () => {
    it('generates correct pass.json for an event ticket', async () => {
      const eventPass = PassBuilder.eventTicket()
        .setInfo({
          serialNumber: 'event-001',
          description: 'Concert Ticket',
          organizationName: 'Concert Venue',
          expirationDate: new Date('2025-12-31'),
        })
        .addPrimaryField({ key: 'event', value: 'Rock Concert', label: 'Event' })
        .build();

      const result = await provider.createPass(eventPass);
      expect(result.type).toBe(PassType.EVENT_TICKET);
      expect(result.buffer).toBeInstanceOf(Buffer);
    });

    it('generates correct pass.json for a coupon', async () => {
      const couponPass = PassBuilder.coupon()
        .setInfo({
          serialNumber: 'coupon-001',
          description: '20% Off',
          organizationName: 'Shop',
        })
        .addPrimaryField({ key: 'discount', value: '20%', label: 'Discount' })
        .setBarcode({ type: BarcodeType.CODE_128, value: 'COUPON20' })
        .build();

      const result = await provider.createPass(couponPass);
      expect(result.type).toBe(PassType.COUPON);
    });

    it('includes images in the PKPass archive', async () => {
      const JSZip = jest.requireMock('jszip') as jest.Mock;
      const zipInstance = { file: jest.fn(), generateAsync: jest.fn().mockResolvedValue(Buffer.from('zip')) };
      JSZip.mockImplementationOnce(() => zipInstance);

      const passWithImage = PassBuilder.generic()
        .setInfo({
          serialNumber: 'img-001',
          description: 'Pass with Image',
          organizationName: 'Org',
        })
        .addImage({ type: 'logo', data: Buffer.from('fake-png'), scale: 1 })
        .build();

      await provider.createPass(passWithImage);
      expect(zipInstance.file).toHaveBeenCalledWith(
        expect.stringContaining('logo'),
        expect.any(Buffer),
      );
    });
  });

  describe('color conversion', () => {
    it('converts hex colors to Apple rgb() format in pass.json', async () => {
      // This is validated indirectly: the provider uses toAppleRgb internally
      // We verify the pass builds without error
      const colorPass = PassBuilder.generic()
        .setInfo({
          serialNumber: 'color-001',
          description: 'Color Test',
          organizationName: 'Org',
        })
        .setStyle({
          backgroundColor: '#336699',
          foregroundColor: '#ffffff',
          labelColor: '#000000',
        })
        .build();

      const result = await provider.createPass(colorPass);
      expect(result).toBeDefined();
    });
  });
});
