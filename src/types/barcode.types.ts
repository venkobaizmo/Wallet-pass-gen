export enum BarcodeType {
  QR_CODE = 'QR_CODE',
  PDF_417 = 'PDF_417',
  AZTEC = 'AZTEC',
  CODE_128 = 'CODE_128',
  CODE_39 = 'CODE_39',
  EAN_13 = 'EAN_13',
  UPC_A = 'UPC_A',
  DATA_MATRIX = 'DATA_MATRIX',
}

export enum BarcodeFormat {
  PNG = 'PNG',
  SVG = 'SVG',
  DATA_URL = 'DATA_URL',
}

export interface BarcodeConfig {
  type: BarcodeType;
  value: string;
  alternateText?: string;
  messageEncoding?: string;
  format?: BarcodeFormat;
  width?: number;
  height?: number;
  scale?: number;
}

export interface BarcodeResult {
  type: BarcodeType;
  value: string;
  format: BarcodeFormat;
  data: Buffer | string;
  width: number;
  height: number;
}
