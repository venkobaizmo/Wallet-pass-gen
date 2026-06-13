import fs from 'fs';
import jwt from 'jsonwebtoken';
import axios, { AxiosInstance } from 'axios';
import { GoogleAuth } from 'google-auth-library';
import { BaseWalletPassProvider, PassStatus } from '../base.provider';
import { PassData, PassResult, WalletProvider } from '../../types/pass.types';
import { GoogleProviderConfig, CreatePassOptions, UpdatePassOptions } from '../../types/provider.types';
import { AuthenticationError, PassCreationError, PassNotFoundError } from '../../errors';
import { logger } from '../../utils/logger';
import { buildGooglePassObjects } from './google.pass-builder';
import { GoogleSaveJWTPayload } from './google.types';

const GOOGLE_WALLET_API = 'https://walletobjects.googleapis.com/walletobjects/v1';
const GOOGLE_SAVE_URL = 'https://pay.google.com/gp/v/save';
const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/wallet_object.issuer'];

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  [key: string]: unknown;
}

export class GoogleWalletProvider extends BaseWalletPassProvider {
  readonly providerType = WalletProvider.GOOGLE;
  private config: GoogleProviderConfig;
  private httpClient: AxiosInstance;
  private serviceAccount: ServiceAccountKey | null = null;

  constructor(config: GoogleProviderConfig) {
    super();
    this.config = config;
    this.httpClient = axios.create({
      baseURL: GOOGLE_WALLET_API,
      headers: { 'Content-Type': 'application/json' },
      timeout: 30_000,
    });
  }

  // ─── Service account ───────────────────────────────────────────────────────

  private async loadServiceAccount(): Promise<ServiceAccountKey> {
    if (this.serviceAccount) return this.serviceAccount;

    if (this.config.serviceAccountKey && this.config.serviceAccountEmail) {
      this.serviceAccount = {
        client_email: this.config.serviceAccountEmail,
        private_key: this.config.serviceAccountKey,
      };
      return this.serviceAccount;
    }

    if (this.config.serviceAccountKeyFile) {
      const raw = fs.readFileSync(this.config.serviceAccountKeyFile, 'utf8');
      this.serviceAccount = JSON.parse(raw) as ServiceAccountKey;
      return this.serviceAccount;
    }

    throw new AuthenticationError(
      'Google service account not configured — provide serviceAccountKey + serviceAccountEmail or serviceAccountKeyFile',
    );
  }

  private async getAccessToken(): Promise<string> {
    const sa = await this.loadServiceAccount();
    const auth = new GoogleAuth({
      credentials: {
        client_email: sa.client_email,
        private_key: sa.private_key,
      },
      scopes: GOOGLE_SCOPES,
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    if (!tokenResponse.token) {
      throw new AuthenticationError('Failed to obtain Google access token');
    }
    return tokenResponse.token;
  }

  private async authorizedClient(): Promise<AxiosInstance> {
    const token = await this.getAccessToken();
    return axios.create({
      baseURL: GOOGLE_WALLET_API,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      timeout: 30_000,
    });
  }

  // ─── API helpers ───────────────────────────────────────────────────────────

  private async upsertClass(endpoint: string, classData: unknown): Promise<void> {
    const client = await this.authorizedClient();
    const classId = (classData as { id: string }).id;
    try {
      await client.get(`/${endpoint}/${encodeURIComponent(classId)}`);
      // Class exists — update it
      await client.put(`/${endpoint}/${encodeURIComponent(classId)}`, classData);
      logger.debug(`Google class updated: ${classId}`);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        // Create new class
        await client.post(`/${endpoint}`, classData);
        logger.debug(`Google class created: ${classId}`);
      } else {
        throw err;
      }
    }
  }

  private async upsertObject(endpoint: string, objectData: unknown): Promise<void> {
    const client = await this.authorizedClient();
    const objectId = (objectData as { id: string }).id;
    try {
      await client.get(`/${endpoint}/${encodeURIComponent(objectId)}`);
      // Object exists — update it
      await client.put(`/${endpoint}/${encodeURIComponent(objectId)}`, objectData);
      logger.debug(`Google object updated: ${objectId}`);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        await client.post(`/${endpoint}`, objectData);
        logger.debug(`Google object created: ${objectId}`);
      } else {
        throw err;
      }
    }
  }

  // ─── JWT save link ─────────────────────────────────────────────────────────

  private async buildSaveJWT(passData: PassData): Promise<string> {
    const sa = await this.loadServiceAccount();
    const objects = buildGooglePassObjects(passData, this.config);

    const payload: GoogleSaveJWTPayload = {
      iss: sa.client_email,
      aud: 'google',
      typ: 'savetowallet',
      iat: Math.floor(Date.now() / 1000),
      payload: {},
    };

    switch (objects.objectType) {
      case 'generic':
        if (objects.genericClass) payload.payload.genericClasses = [objects.genericClass];
        if (objects.genericObject) payload.payload.genericObjects = [objects.genericObject];
        break;
      case 'eventTicket':
        if (objects.eventTicketClass) payload.payload.eventTicketClasses = [objects.eventTicketClass];
        if (objects.eventTicketObject) payload.payload.eventTicketObjects = [objects.eventTicketObject];
        break;
      case 'loyalty':
        if (objects.loyaltyClass) payload.payload.loyaltyClasses = [objects.loyaltyClass];
        if (objects.loyaltyObject) payload.payload.loyaltyObjects = [objects.loyaltyObject];
        break;
      case 'offer':
        if (objects.offerClass) payload.payload.offerClasses = [objects.offerClass];
        if (objects.offerObject) payload.payload.offerObjects = [objects.offerObject];
        break;
    }

    return jwt.sign(payload as object, sa.private_key, { algorithm: 'RS256' });
  }

  // ─── BaseWalletPassProvider implementation ─────────────────────────────────

  async createPass(passData: PassData, options?: CreatePassOptions): Promise<PassResult> {
    if (options?.validateBeforeCreate !== false) {
      this.validatePassData(passData);
    }

    try {
      const objects = buildGooglePassObjects(passData, this.config);

      // Push class + object to Google API
      switch (objects.objectType) {
        case 'generic':
          if (objects.genericClass) await this.upsertClass('genericClass', objects.genericClass);
          if (objects.genericObject) await this.upsertObject('genericObject', objects.genericObject);
          break;
        case 'eventTicket':
          if (objects.eventTicketClass) await this.upsertClass('eventTicketClass', objects.eventTicketClass);
          if (objects.eventTicketObject) await this.upsertObject('eventTicketObject', objects.eventTicketObject);
          break;
        case 'loyalty':
          if (objects.loyaltyClass) await this.upsertClass('loyaltyClass', objects.loyaltyClass);
          if (objects.loyaltyObject) await this.upsertObject('loyaltyObject', objects.loyaltyObject);
          break;
        case 'offer':
          if (objects.offerClass) await this.upsertClass('offerClass', objects.offerClass);
          if (objects.offerObject) await this.upsertObject('offerObject', objects.offerObject);
          break;
      }

      const token = await this.buildSaveJWT(passData);
      const saveUrl = `${GOOGLE_SAVE_URL}/${token}`;

      logger.info('Google pass created', { serialNumber: passData.info.serialNumber });

      return {
        passId: passData.info.serialNumber,
        provider: WalletProvider.GOOGLE,
        type: passData.type,
        saveUrl,
        metadata: {
          issuerId: this.config.issuerId,
          objectType: objects.objectType,
        },
        createdAt: new Date(),
      };
    } catch (err) {
      if (err instanceof PassCreationError || err instanceof AuthenticationError) throw err;
      throw new PassCreationError(
        `Failed to create Google pass: ${(err as Error).message}`,
        err,
      );
    }
  }

  async updatePass(
    passId: string,
    updates: Partial<PassData>,
    _options?: UpdatePassOptions,
  ): Promise<PassResult> {
    if (!updates.info) {
      throw new PassCreationError('updates.info is required for updatePass');
    }

    const passData = updates as PassData;
    passData.info.serialNumber = passId;
    return this.createPass(passData);
  }

  async voidPass(passId: string): Promise<void> {
    try {
      const client = await this.authorizedClient();
      const issuerId = this.config.issuerId;
      const objectId = `${issuerId}.${passId}`;

      // Try generic, eventTicket, loyalty, offer in sequence
      const endpoints = ['genericObject', 'eventTicketObject', 'loyaltyObject', 'offerObject'];
      for (const ep of endpoints) {
        try {
          await client.patch(`/${ep}/${encodeURIComponent(objectId)}`, { state: 'INACTIVE' });
          logger.info(`Google pass voided via ${ep}`, { passId });
          return;
        } catch (err) {
          if (axios.isAxiosError(err) && err.response?.status === 404) continue;
          throw err;
        }
      }

      throw new PassNotFoundError(passId);
    } catch (err) {
      if (err instanceof PassNotFoundError) throw err;
      throw new PassCreationError(
        `Failed to void Google pass: ${(err as Error).message}`,
        err,
      );
    }
  }

  async getSaveUrl(passData: PassData): Promise<string> {
    const token = await this.buildSaveJWT(passData);
    return `${GOOGLE_SAVE_URL}/${token}`;
  }

  async getPassStatus(passId: string): Promise<PassStatus> {
    const issuerId = this.config.issuerId;
    const objectId = `${issuerId}.${passId}`;
    const client = await this.authorizedClient();

    const endpoints = ['genericObject', 'eventTicketObject', 'loyaltyObject', 'offerObject'];
    for (const ep of endpoints) {
      try {
        const { data } = await client.get(`/${ep}/${encodeURIComponent(objectId)}`);
        const voided = data.state === 'INACTIVE';
        return {
          active: !voided,
          voided,
          updatedAt: data.hasLinkedDevice ? new Date() : undefined,
        };
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 404) continue;
        throw err;
      }
    }

    throw new PassNotFoundError(passId);
  }
}
