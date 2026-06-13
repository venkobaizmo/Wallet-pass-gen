export type WalletPassErrorCode =
  | 'PROVIDER_NOT_FOUND'
  | 'PASS_VALIDATION_ERROR'
  | 'PASS_CREATION_ERROR'
  | 'BARCODE_GENERATION_ERROR'
  | 'TRACKING_ERROR'
  | 'WEBHOOK_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'PASS_NOT_FOUND';

export interface WalletPassErrorJSON {
  name: string;
  code: WalletPassErrorCode;
  message: string;
  details?: unknown;
}

export class WalletPassError extends Error {
  public readonly code: WalletPassErrorCode;
  public readonly details?: unknown;

  constructor(code: WalletPassErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'WalletPassError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): WalletPassErrorJSON {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      ...(this.details !== undefined && { details: this.details }),
    };
  }
}

export class ProviderNotFoundError extends WalletPassError {
  constructor(provider: string, details?: unknown) {
    super('PROVIDER_NOT_FOUND', `Wallet provider '${provider}' is not registered`, details);
    this.name = 'ProviderNotFoundError';
  }
}

export class PassValidationError extends WalletPassError {
  constructor(message: string, details?: unknown) {
    super('PASS_VALIDATION_ERROR', message, details);
    this.name = 'PassValidationError';
  }
}

export class PassCreationError extends WalletPassError {
  constructor(message: string, details?: unknown) {
    super('PASS_CREATION_ERROR', message, details);
    this.name = 'PassCreationError';
  }
}

export class BarcodeGenerationError extends WalletPassError {
  constructor(message: string, details?: unknown) {
    super('BARCODE_GENERATION_ERROR', message, details);
    this.name = 'BarcodeGenerationError';
  }
}

export class TrackingError extends WalletPassError {
  constructor(message: string, details?: unknown) {
    super('TRACKING_ERROR', message, details);
    this.name = 'TrackingError';
  }
}

export class WebhookError extends WalletPassError {
  constructor(message: string, details?: unknown) {
    super('WEBHOOK_ERROR', message, details);
    this.name = 'WebhookError';
  }
}

export class AuthenticationError extends WalletPassError {
  constructor(message: string, details?: unknown) {
    super('AUTHENTICATION_ERROR', message, details);
    this.name = 'AuthenticationError';
  }
}

export class PassNotFoundError extends WalletPassError {
  constructor(passId: string, details?: unknown) {
    super('PASS_NOT_FOUND', `Pass with ID '${passId}' was not found`, details);
    this.name = 'PassNotFoundError';
  }
}
