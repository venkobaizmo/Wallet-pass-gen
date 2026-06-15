import fs from 'fs';
import JSZip from 'jszip';
import forge from 'node-forge';
import { BaseWalletPassProvider, PassStatus } from '../base.provider';
import { PassData, PassResult, WalletProvider } from '../../types/pass.types';
import { AppleProviderConfig, CreatePassOptions, UpdatePassOptions } from '../../types/provider.types';
import { AuthenticationError, PassCreationError, PassNotFoundError } from '../../errors';
import { hashSHA1 } from '../../utils/crypto.utils';
import { logger } from '../../utils/logger';
import { buildApplePassJSON } from './apple.pass-builder';
import { ApplePassJSON } from './apple.types';

interface CertStore {
  cert: forge.pki.Certificate;
  key: forge.pki.rsa.PrivateKey;
  wwdr: forge.pki.Certificate;
}

export class AppleWalletProvider extends BaseWalletPassProvider {
  readonly providerType = WalletProvider.APPLE;
  private config: AppleProviderConfig;
  private certStore: CertStore | null = null;

  constructor(config: AppleProviderConfig) {
    super();
    this.config = config;
  }

  // ─── Certificate loading ───────────────────────────────────────────────────

  private async loadCertificates(): Promise<CertStore> {
    if (this.certStore) return this.certStore;

    try {
      const wwdrPem = await this.loadPem(this.config.wwdrData, this.config.wwdrPath, 'WWDR certificate');
      const wwdr = forge.pki.certificateFromPem(wwdrPem);

      let cert: forge.pki.Certificate;
      let key: forge.pki.rsa.PrivateKey;

      if (this.config.p12Path || this.config.p12Data) {
        ({ cert, key } = this.loadFromP12(wwdr));
      } else {
        ({ cert, key } = await this.loadFromPem());
      }

      this.certStore = { cert, key, wwdr };
      logger.debug('Apple certificates loaded successfully');
      return this.certStore;
    } catch (err) {
      if (err instanceof AuthenticationError) throw err;
      throw new AuthenticationError(
        `Failed to load Apple certificates: ${(err as Error).message}`,
        err,
      );
    }
  }

  private loadFromP12(wwdr: forge.pki.Certificate): { cert: forge.pki.Certificate; key: forge.pki.rsa.PrivateKey } {
    const raw = this.config.p12Data
      ? this.config.p12Data
      : fs.readFileSync(this.config.p12Path!);

    const p12Der = raw.toString('binary');
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const passphrase = this.config.p12Passphrase ?? '';

    let p12: forge.pkcs12.Pkcs12Pfx;
    try {
      p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, passphrase);
    } catch {
      throw new AuthenticationError(
        'Failed to parse .p12 file — wrong passphrase or corrupt file',
      );
    }

    // Extract the signing certificate (the one that is NOT the WWDR cert)
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
    const signingBag = certBags.find((bag) => {
      const subject = bag.cert?.subject.getField('CN')?.value as string | undefined;
      return subject && !subject.toLowerCase().includes('apple worldwide');
    });

    if (!signingBag?.cert) {
      throw new AuthenticationError(
        'No signing certificate found in .p12 — make sure you exported the Pass Certificate, not just the WWDR',
      );
    }

    // Extract the private key (either pkcs8ShroudedKeyBag or keyBag)
    const keyBags =
      p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ??
      p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ??
      [];

    if (!keyBags.length || !keyBags[0].key) {
      throw new AuthenticationError('No private key found in .p12 file');
    }

    // Suppress the unused `wwdr` parameter warning — callers still need it
    void wwdr;

    return {
      cert: signingBag.cert,
      key: keyBags[0].key as forge.pki.rsa.PrivateKey,
    };
  }

  private async loadFromPem(): Promise<{ cert: forge.pki.Certificate; key: forge.pki.rsa.PrivateKey }> {
    const certPem = await this.loadPem(this.config.certData, this.config.certPath, 'certificate');
    const keyPem = await this.loadPem(this.config.keyData, this.config.keyPath, 'private key');

    const cert = forge.pki.certificateFromPem(certPem);
    const key = this.config.keyPassphrase
      ? forge.pki.decryptRsaPrivateKey(keyPem, this.config.keyPassphrase)
      : (forge.pki.privateKeyFromPem(keyPem) as forge.pki.rsa.PrivateKey);

    if (!key) {
      throw new AuthenticationError('Failed to parse private key — check keyPassphrase');
    }

    return { cert, key };
  }

  private async loadPem(
    data: Buffer | string | undefined,
    filePath: string | undefined,
    label: string,
  ): Promise<string> {
    if (data) {
      return Buffer.isBuffer(data) ? data.toString('utf8') : data;
    }
    if (filePath) {
      return fs.readFileSync(filePath, 'utf8');
    }
    throw new AuthenticationError(
      `No ${label} provided — set ${label === 'WWDR certificate' ? 'wwdrPath/wwdrData' : 'certPath/certData or keyPath/keyData'}`,
    );
  }

  // ─── Manifest & signing ────────────────────────────────────────────────────

  private createManifest(files: Map<string, Buffer>): string {
    const manifest: Record<string, string> = {};
    for (const [filename, data] of files.entries()) {
      manifest[filename] = hashSHA1(data);
    }
    return JSON.stringify(manifest);
  }

  private async signManifest(manifestJson: string, certs: CertStore): Promise<Buffer> {
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(manifestJson, 'utf8');

    p7.addCertificate(certs.wwdr);
    p7.addCertificate(certs.cert);

    p7.addSigner({
      key: certs.key,
      certificate: certs.cert,
      digestAlgorithm: forge.pki.oids.sha1,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.messageDigest },
        { type: forge.pki.oids.signingTime, value: new Date().toUTCString() },
      ],
    });

    p7.sign();

    // Detached DER signature
    const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
    return Buffer.from(der, 'binary');
  }

  // ─── PKPass builder ────────────────────────────────────────────────────────

  private async buildPKPass(passData: PassData): Promise<Buffer> {
    const certs = await this.loadCertificates();

    // 1. Build pass.json
    const passJSON: ApplePassJSON = buildApplePassJSON(passData, this.config);
    const passJsonBuffer = Buffer.from(JSON.stringify(passJSON, null, 2), 'utf8');

    // 2. Collect files
    const files = new Map<string, Buffer>();
    files.set('pass.json', passJsonBuffer);

    // Add images
    if (passData.images?.length) {
      for (const image of passData.images) {
        const scale = image.scale ?? 1;
        const suffix = scale === 1 ? '' : `@${scale}x`;
        const ext = image.mimeType === 'image/jpeg' ? 'jpg' : 'png';
        const filename = `${image.type}${suffix}.${ext}`;
        files.set(filename, image.data);
      }
    }

    // 3. Manifest
    const manifestJson = this.createManifest(files);
    const manifestBuffer = Buffer.from(manifestJson, 'utf8');

    // 4. Sign
    const signatureBuffer = await this.signManifest(manifestJson, certs);

    // 5. ZIP
    const zip = new JSZip();
    for (const [filename, data] of files.entries()) {
      zip.file(filename, data);
    }
    zip.file('manifest.json', manifestBuffer);
    zip.file('signature', signatureBuffer);

    const pkpassBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });

    logger.debug('PKPass archive built', {
      serialNumber: passData.info.serialNumber,
      fileCount: files.size + 2,
    });

    return pkpassBuffer;
  }

  // ─── BaseWalletPassProvider implementation ─────────────────────────────────

  async createPass(passData: PassData, options?: CreatePassOptions): Promise<PassResult> {
    if (options?.validateBeforeCreate !== false) {
      this.validatePassData(passData);
    }

    try {
      const buffer = await this.buildPKPass(passData);

      logger.info('Apple pass created', { serialNumber: passData.info.serialNumber });

      return {
        passId: passData.info.serialNumber,
        provider: WalletProvider.APPLE,
        type: passData.type,
        buffer,
        metadata: {
          passTypeIdentifier: this.config.passTypeIdentifier,
          teamIdentifier: this.config.teamIdentifier,
        },
        createdAt: new Date(),
      };
    } catch (err) {
      if (err instanceof PassCreationError || err instanceof AuthenticationError) throw err;
      throw new PassCreationError(
        `Failed to create Apple pass: ${(err as Error).message}`,
        err,
      );
    }
  }

  async updatePass(
    passId: string,
    updates: Partial<PassData>,
    _options?: UpdatePassOptions,
  ): Promise<PassResult> {
    // In a real implementation this would fetch the existing pass from a store,
    // merge updates, re-sign and push a notification via the web service URL.
    // Here we reconstruct from the updates (all required fields must be provided).
    if (!updates.info) {
      throw new PassCreationError('updates.info is required for updatePass');
    }

    const passData = updates as PassData;
    passData.info.serialNumber = passId;

    return this.createPass(passData);
  }

  async voidPass(_passId: string): Promise<void> {
    // In production this would call the web service to mark the pass as voided
    // and push a notification. Here we just log.
    logger.info('Apple pass voided (stub — implement web service call)', {
      passId: _passId,
    });
  }

  async getSaveUrl(passData: PassData): Promise<string> {
    // Apple passes are distributed as .pkpass files; the "save URL" is
    // typically a download link to the hosted .pkpass. This returns a
    // placeholder that callers can override once they host the file.
    const wsUrl = passData.info.webServiceURL ?? this.config.webServiceURL;
    if (wsUrl) {
      const base = wsUrl.replace(/\/$/, '');
      return `${base}/passes/${this.config.passTypeIdentifier}/${passData.info.serialNumber}`;
    }
    return `https://example.com/passes/${passData.info.serialNumber}.pkpass`;
  }

  async getPassStatus(passId: string): Promise<PassStatus> {
    // Stub — in production this queries the web service / database.
    logger.debug('getPassStatus (stub)', { passId });
    if (!passId) {
      throw new PassNotFoundError(passId);
    }
    return { active: true, voided: false };
  }
}
