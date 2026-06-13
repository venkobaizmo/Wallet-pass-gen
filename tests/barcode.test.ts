import { BarcodeGenerator } from '../src/barcode/barcode.generator';
import { BarcodeType, BarcodeFormat } from '../src/types/barcode.types';
import { BarcodeGenerationError } from '../src/errors';

// Mock bwip-js — the module is imported as `import * as bwipjs`, so we expose
// toBuffer at the top level (not under `default`).
jest.mock('bwip-js', () => ({
  __esModule: true,
  toBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-png-data')),
}));

// Mock qrcode
jest.mock('qrcode', () => ({
  toBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-qr-png')),
  toString: jest.fn().mockResolvedValue('<svg>fake-qr-svg</svg>'),
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,ZmFrZS1xcg=='),
}));

describe('BarcodeGenerator', () => {
  let generator: BarcodeGenerator;

  beforeEach(() => {
    generator = new BarcodeGenerator();
    jest.resetAllMocks();
    // Re-establish default mock implementations after reset
    const bwipMock = jest.requireMock('bwip-js') as { toBuffer: jest.Mock };
    bwipMock.toBuffer.mockResolvedValue(Buffer.from('fake-png-data'));
    const QRCodeMock = jest.requireMock('qrcode') as {
      toBuffer: jest.Mock;
      toString: jest.Mock;
      toDataURL: jest.Mock;
    };
    QRCodeMock.toBuffer.mockResolvedValue(Buffer.from('fake-qr-png'));
    QRCodeMock.toString.mockResolvedValue('<svg>fake-qr-svg</svg>');
    QRCodeMock.toDataURL.mockResolvedValue('data:image/png;base64,ZmFrZS1xcg==');
  });

  describe('QR_CODE generation', () => {
    it('generates a PNG buffer for QR_CODE', async () => {
      const result = await generator.generate({
        type: BarcodeType.QR_CODE,
        value: 'https://example.com',
        format: BarcodeFormat.PNG,
      });

      expect(result.type).toBe(BarcodeType.QR_CODE);
      expect(result.format).toBe(BarcodeFormat.PNG);
      expect(Buffer.isBuffer(result.data)).toBe(true);
    });

    it('generates SVG for QR_CODE', async () => {
      const result = await generator.generate({
        type: BarcodeType.QR_CODE,
        value: 'https://example.com',
        format: BarcodeFormat.SVG,
      });

      expect(result.format).toBe(BarcodeFormat.SVG);
      expect(typeof result.data).toBe('string');
      expect(result.data as string).toContain('svg');
    });

    it('generates DATA_URL for QR_CODE', async () => {
      const result = await generator.generate({
        type: BarcodeType.QR_CODE,
        value: 'https://example.com',
        format: BarcodeFormat.DATA_URL,
      });

      expect(result.format).toBe(BarcodeFormat.DATA_URL);
      expect(typeof result.data).toBe('string');
      expect(result.data as string).toMatch(/^data:image\/png;base64,/);
    });

    it('uses default PNG format when not specified', async () => {
      const result = await generator.generate({
        type: BarcodeType.QR_CODE,
        value: 'test',
      });

      expect(result.format).toBe(BarcodeFormat.PNG);
    });
  });

  describe('bwip-js barcode types', () => {
    const bwipTypes = [
      BarcodeType.PDF_417,
      BarcodeType.AZTEC,
      BarcodeType.CODE_128,
      BarcodeType.CODE_39,
      BarcodeType.EAN_13,
      BarcodeType.UPC_A,
      BarcodeType.DATA_MATRIX,
    ];

    bwipTypes.forEach((barcodeType) => {
      it(`generates PNG for ${barcodeType}`, async () => {
        const result = await generator.generate({
          type: barcodeType,
          value: '123456789',
          format: BarcodeFormat.PNG,
        });

        expect(result.type).toBe(barcodeType);
        expect(result.format).toBe(BarcodeFormat.PNG);
        expect(Buffer.isBuffer(result.data)).toBe(true);
      });
    });

    it('generates DATA_URL for CODE_128', async () => {
      const result = await generator.generate({
        type: BarcodeType.CODE_128,
        value: '123456',
        format: BarcodeFormat.DATA_URL,
      });

      expect(result.format).toBe(BarcodeFormat.DATA_URL);
      expect(typeof result.data).toBe('string');
      expect(result.data as string).toMatch(/^data:image\/png;base64,/);
    });

    it('generates SVG for PDF_417 (wraps PNG in SVG)', async () => {
      const result = await generator.generate({
        type: BarcodeType.PDF_417,
        value: 'test-data',
        format: BarcodeFormat.SVG,
      });

      expect(result.format).toBe(BarcodeFormat.SVG);
      expect(typeof result.data).toBe('string');
      expect(result.data as string).toContain('<svg');
      expect(result.data as string).toContain('image/png;base64,');
    });
  });

  describe('convenience methods', () => {
    it('generateAsDataURL returns a data URL string', async () => {
      const dataUrl = await generator.generateAsDataURL({
        type: BarcodeType.QR_CODE,
        value: 'test',
      });

      expect(typeof dataUrl).toBe('string');
      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('generateAsSVG returns an SVG string', async () => {
      const svg = await generator.generateAsSVG({
        type: BarcodeType.QR_CODE,
        value: 'test',
      });

      expect(typeof svg).toBe('string');
      expect(svg).toContain('svg');
    });
  });

  describe('error handling', () => {
    it('throws BarcodeGenerationError when qrcode fails', async () => {
      const QRCode = jest.requireMock('qrcode') as {
        toBuffer: jest.Mock;
      };
      QRCode.toBuffer.mockRejectedValueOnce(new Error('qrcode failure'));

      await expect(
        generator.generate({ type: BarcodeType.QR_CODE, value: 'bad' }),
      ).rejects.toThrow(BarcodeGenerationError);
    });

    it('throws BarcodeGenerationError when bwip-js fails', async () => {
      const bwipMock = jest.requireMock('bwip-js') as { toBuffer: jest.Mock };
      bwipMock.toBuffer.mockRejectedValueOnce(new Error('bwip failure'));

      await expect(
        generator.generate({ type: BarcodeType.CODE_128, value: 'bad' }),
      ).rejects.toThrow(BarcodeGenerationError);
    });
  });

  describe('dimensions', () => {
    it('respects width and height options', async () => {
      const result = await generator.generate({
        type: BarcodeType.QR_CODE,
        value: 'test',
        width: 300,
        height: 300,
        format: BarcodeFormat.PNG,
      });

      expect(result.width).toBe(300);
      expect(result.height).toBe(300);
    });

    it('uses default dimensions when not specified', async () => {
      const result = await generator.generate({
        type: BarcodeType.QR_CODE,
        value: 'test',
        format: BarcodeFormat.PNG,
      });

      expect(result.width).toBe(200);
      expect(result.height).toBe(200);
    });
  });
});
