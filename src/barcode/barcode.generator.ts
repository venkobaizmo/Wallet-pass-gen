import * as bwipjs from 'bwip-js';
import QRCode from 'qrcode';
import { BarcodeConfig, BarcodeFormat, BarcodeResult, BarcodeType } from '../types/barcode.types';
import { BarcodeGenerationError } from '../errors';
import { logger } from '../utils/logger';

/** Map our BarcodeType enum to bwip-js bcid strings */
const BWIPJS_BCID_MAP: Partial<Record<BarcodeType, string>> = {
  [BarcodeType.PDF_417]: 'pdf417',
  [BarcodeType.AZTEC]: 'azteccode',
  [BarcodeType.CODE_128]: 'code128',
  [BarcodeType.CODE_39]: 'code39',
  [BarcodeType.EAN_13]: 'ean13',
  [BarcodeType.UPC_A]: 'upca',
  [BarcodeType.DATA_MATRIX]: 'datamatrix',
};

export class BarcodeGenerator {
  /**
   * Generate a barcode according to the provided configuration.
   * Returns a BarcodeResult with the rendered data.
   */
  async generate(config: BarcodeConfig): Promise<BarcodeResult> {
    const format = config.format ?? BarcodeFormat.PNG;

    if (config.type === BarcodeType.QR_CODE) {
      return this.generateQRCode(config, format);
    }

    return this.generateBwipBarcode(config, format);
  }

  /**
   * Convenience method: always returns a data URL string (base64 PNG).
   */
  async generateAsDataURL(config: BarcodeConfig): Promise<string> {
    const result = await this.generate({ ...config, format: BarcodeFormat.DATA_URL });
    if (typeof result.data === 'string') {
      return result.data;
    }
    // If we got a Buffer back (shouldn't happen for DATA_URL), convert it
    return `data:image/png;base64,${(result.data as Buffer).toString('base64')}`;
  }

  /**
   * Convenience method: always returns an SVG string.
   */
  async generateAsSVG(config: BarcodeConfig): Promise<string> {
    const result = await this.generate({ ...config, format: BarcodeFormat.SVG });
    if (typeof result.data === 'string') {
      return result.data;
    }
    return result.data.toString('utf8');
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async generateQRCode(
    config: BarcodeConfig,
    format: BarcodeFormat,
  ): Promise<BarcodeResult> {
    const width = config.width ?? 200;
    const height = config.height ?? 200;

    try {
      let data: Buffer | string;

      if (format === BarcodeFormat.SVG) {
        data = await QRCode.toString(config.value, {
          type: 'svg',
          width,
          errorCorrectionLevel: 'M',
        });
      } else if (format === BarcodeFormat.DATA_URL) {
        data = await QRCode.toDataURL(config.value, {
          width,
          errorCorrectionLevel: 'M',
        });
      } else {
        // PNG
        data = await QRCode.toBuffer(config.value, {
          width,
          errorCorrectionLevel: 'M',
        });
      }

      logger.debug('QR code generated', { value: config.value, format });

      return {
        type: BarcodeType.QR_CODE,
        value: config.value,
        format,
        data,
        width,
        height,
      };
    } catch (err) {
      throw new BarcodeGenerationError(
        `Failed to generate QR code: ${(err as Error).message}`,
        err,
      );
    }
  }

  private async generateBwipBarcode(
    config: BarcodeConfig,
    format: BarcodeFormat,
  ): Promise<BarcodeResult> {
    const bcid = BWIPJS_BCID_MAP[config.type];
    if (!bcid) {
      throw new BarcodeGenerationError(
        `Unsupported barcode type: ${config.type}`,
        { type: config.type },
      );
    }

    const width = config.width ?? 200;
    const height = config.height ?? 100;
    const scale = config.scale ?? 3;

    try {
      const options: bwipjs.RenderOptions = {
        bcid,
        text: config.value,
        scale,
        height: Math.round(height / 10),
        includetext: !!config.alternateText,
        textxalign: 'center',
      };

      if (format === BarcodeFormat.SVG) {
        // bwip-js doesn't natively output SVG via toBuffer, so we use PNG and encode
        const pngBuffer = await bwipjs.toBuffer(options);
        const svgData = this.pngBufferToSvg(pngBuffer, width, height);
        logger.debug('Barcode SVG generated via bwip-js', { type: config.type });
        return {
          type: config.type,
          value: config.value,
          format: BarcodeFormat.SVG,
          data: svgData,
          width,
          height,
        };
      } else {
        const pngBuffer = await bwipjs.toBuffer(options);
        logger.debug('Barcode PNG generated via bwip-js', { type: config.type });

        if (format === BarcodeFormat.DATA_URL) {
          const dataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;
          return {
            type: config.type,
            value: config.value,
            format: BarcodeFormat.DATA_URL,
            data: dataUrl,
            width,
            height,
          };
        }

        return {
          type: config.type,
          value: config.value,
          format: BarcodeFormat.PNG,
          data: pngBuffer,
          width,
          height,
        };
      }
    } catch (err) {
      if (err instanceof BarcodeGenerationError) throw err;
      throw new BarcodeGenerationError(
        `Failed to generate barcode (${config.type}): ${(err as Error).message}`,
        err,
      );
    }
  }

  /**
   * Wraps a PNG buffer in a minimal SVG <image> element.
   */
  private pngBufferToSvg(pngBuffer: Buffer, width: number, height: number): string {
    const base64 = pngBuffer.toString('base64');
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" ` +
      `width="${width}" height="${height}" ` +
      `viewBox="0 0 ${width} ${height}">` +
      `<image href="data:image/png;base64,${base64}" ` +
      `width="${width}" height="${height}"/>` +
      `</svg>`
    );
  }
}
