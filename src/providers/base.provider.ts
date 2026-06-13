import { PassData, PassResult, WalletProvider } from '../types/pass.types';
import { CreatePassOptions, UpdatePassOptions } from '../types/provider.types';
import { PassValidationError } from '../errors';
import { toAppleRgb, toGoogleHex } from '../utils/crypto.utils';

export interface PassStatus {
  active: boolean;
  voided: boolean;
  updatedAt?: Date;
}

export abstract class BaseWalletPassProvider {
  abstract readonly providerType: WalletProvider;

  abstract createPass(passData: PassData, options?: CreatePassOptions): Promise<PassResult>;

  abstract updatePass(
    passId: string,
    updates: Partial<PassData>,
    options?: UpdatePassOptions,
  ): Promise<PassResult>;

  abstract voidPass(passId: string): Promise<void>;

  abstract getSaveUrl(passData: PassData): Promise<string>;

  abstract getPassStatus(passId: string): Promise<PassStatus>;

  /**
   * Normalise a CSS colour string to the provider-specific format.
   * Apple uses `rgb(r, g, b)` and Google uses `#RRGGBB`.
   */
  protected normalizeColor(color: string): string {
    if (this.providerType === WalletProvider.APPLE) {
      return toAppleRgb(color);
    }
    return toGoogleHex(color);
  }

  /**
   * Light validation of the required PassData fields.
   * Concrete providers may extend this with their own checks.
   */
  protected validatePassData(passData: PassData): void {
    if (!passData) {
      throw new PassValidationError('PassData must not be null or undefined');
    }
    if (!passData.type) {
      throw new PassValidationError('PassData.type is required');
    }
    if (!passData.info) {
      throw new PassValidationError('PassData.info is required');
    }
    if (!passData.info.serialNumber) {
      throw new PassValidationError('PassData.info.serialNumber is required');
    }
    if (!passData.info.description) {
      throw new PassValidationError('PassData.info.description is required');
    }
    if (!passData.info.organizationName) {
      throw new PassValidationError('PassData.info.organizationName is required');
    }
  }
}
