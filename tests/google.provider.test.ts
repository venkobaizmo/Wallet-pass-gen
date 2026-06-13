import { GoogleWalletProvider } from '../src/providers/google/google.provider';
import { PassBuilder } from '../src/pass-builder';
import { PassType, WalletProvider } from '../src/types/pass.types';
import { BarcodeType } from '../src/types/barcode.types';
import { AuthenticationError, PassNotFoundError } from '../src/errors';

// Mock google-auth-library
jest.mock('google-auth-library', () => ({
  GoogleAuth: jest.fn().mockImplementation(() => ({
    getClient: jest.fn().mockResolvedValue({
      getAccessToken: jest.fn().mockResolvedValue({ token: 'fake-access-token' }),
    }),
  })),
}));

// Mock jsonwebtoken
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('fake.jwt.token'),
}));

// Mock axios
const mockAxiosInstance = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  patch: jest.fn(),
  request: jest.fn(),
};

jest.mock('axios', () => {
  const actual = jest.requireActual('axios') as typeof import('axios');
  return {
    ...actual,
    create: jest.fn(() => mockAxiosInstance),
    isAxiosError: jest.fn((err: unknown) => (err as { isAxiosError?: boolean })?.isAxiosError === true),
    default: {
      create: jest.fn(() => mockAxiosInstance),
      isAxiosError: jest.fn((err: unknown) => (err as { isAxiosError?: boolean })?.isAxiosError === true),
    },
  };
});

const GOOGLE_CONFIG = {
  serviceAccountEmail: 'test@project.iam.gserviceaccount.com',
  serviceAccountKey: '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----\n',
  issuerId: '3388000000012345678',
};

const basePassData = PassBuilder.generic()
  .setInfo({
    serialNumber: 'google-test-001',
    description: 'Test Google Pass',
    organizationName: 'Test Org',
  })
  .setStyle({ backgroundColor: '#1976D2' })
  .addPrimaryField({ key: 'member', value: 'John Doe', label: 'Member' })
  .setBarcode({ type: BarcodeType.QR_CODE, value: 'https://example.com/pass' })
  .build();

describe('GoogleWalletProvider', () => {
  let provider: GoogleWalletProvider;

  beforeEach(() => {
    // resetAllMocks clears implementations + once queues, clearAllMocks only clears call history
    jest.resetAllMocks();
    provider = new GoogleWalletProvider(GOOGLE_CONFIG);

    // Re-establish GoogleAuth mock after reset
    const { GoogleAuth: MockGoogleAuth } = jest.requireMock('google-auth-library') as {
      GoogleAuth: jest.Mock;
    };
    MockGoogleAuth.mockImplementation(() => ({
      getClient: jest.fn().mockResolvedValue({
        getAccessToken: jest.fn().mockResolvedValue({ token: 'fake-access-token' }),
      }),
    }));

    // Default: object does not exist (404) → trigger create path
    const notFoundError = Object.assign(new Error('Not found'), {
      isAxiosError: true,
      response: { status: 404 },
    });
    mockAxiosInstance.get.mockRejectedValue(notFoundError);
    mockAxiosInstance.post.mockResolvedValue({ data: { id: 'created' } });
    mockAxiosInstance.put.mockResolvedValue({ data: { id: 'updated' } });
    mockAxiosInstance.patch.mockResolvedValue({ data: { id: 'patched' } });

    // Re-mock axios.create and isAxiosError after resetAllMocks
    const axios = jest.requireMock('axios') as {
      create: jest.Mock;
      isAxiosError: jest.Mock;
      default: { create: jest.Mock; isAxiosError: jest.Mock };
    };
    axios.create.mockReturnValue(mockAxiosInstance);
    axios.isAxiosError.mockImplementation(
      (err: unknown) => (err as { isAxiosError?: boolean })?.isAxiosError === true,
    );
    if (axios.default) {
      axios.default.create.mockReturnValue(mockAxiosInstance);
      axios.default.isAxiosError.mockImplementation(
        (err: unknown) => (err as { isAxiosError?: boolean })?.isAxiosError === true,
      );
    }

    // Re-mock jsonwebtoken
    const jwt = jest.requireMock('jsonwebtoken') as { sign: jest.Mock };
    jwt.sign.mockReturnValue('fake.jwt.token');
  });

  describe('providerType', () => {
    it('returns GOOGLE as provider type', () => {
      expect(provider.providerType).toBe(WalletProvider.GOOGLE);
    });
  });

  describe('createPass', () => {
    it('creates a generic pass and returns a PassResult with saveUrl', async () => {
      const result = await provider.createPass(basePassData);

      expect(result.passId).toBe('google-test-001');
      expect(result.provider).toBe(WalletProvider.GOOGLE);
      expect(result.type).toBe(PassType.GENERIC);
      expect(result.saveUrl).toContain('pay.google.com');
      expect(result.saveUrl).toContain('fake.jwt.token');
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('creates an event ticket pass', async () => {
      const eventPass = PassBuilder.eventTicket()
        .setInfo({
          serialNumber: 'evt-001',
          description: 'Concert',
          organizationName: 'Venue',
        })
        .build();

      const result = await provider.createPass(eventPass);
      expect(result.type).toBe(PassType.EVENT_TICKET);
      expect(result.metadata?.objectType).toBe('eventTicket');
    });

    it('creates a loyalty card pass', async () => {
      const loyaltyPass = PassBuilder.loyaltyCard()
        .setInfo({
          serialNumber: 'loyalty-001',
          description: 'Rewards Program',
          organizationName: 'Store',
        })
        .build();

      const result = await provider.createPass(loyaltyPass);
      expect(result.metadata?.objectType).toBe('loyalty');
    });

    it('creates a coupon pass', async () => {
      const couponPass = PassBuilder.coupon()
        .setInfo({
          serialNumber: 'coupon-001',
          description: '10% Discount',
          organizationName: 'Shop',
        })
        .build();

      const result = await provider.createPass(couponPass);
      expect(result.metadata?.objectType).toBe('offer');
    });

    it('updates an existing class/object when they already exist', async () => {
      // Override: object already exists (200)
      mockAxiosInstance.get.mockResolvedValue({ data: { id: 'existing', state: 'ACTIVE' } });

      const result = await provider.createPass(basePassData);
      expect(result.passId).toBe('google-test-001');
      expect(mockAxiosInstance.put).toHaveBeenCalled();
    });
  });

  describe('getSaveUrl', () => {
    it('returns a Google Pay save URL containing the JWT', async () => {
      const url = await provider.getSaveUrl(basePassData);

      expect(url).toMatch(/^https:\/\/pay\.google\.com\/gp\/v\/save\//);
      expect(url).toContain('fake.jwt.token');
    });
  });

  describe('JWT payload', () => {
    it('signs JWT with RS256 algorithm', async () => {
      const jwt = jest.requireMock('jsonwebtoken') as { sign: jest.Mock };
      await provider.getSaveUrl(basePassData);

      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          iss: GOOGLE_CONFIG.serviceAccountEmail,
          aud: 'google',
          typ: 'savetowallet',
        }),
        GOOGLE_CONFIG.serviceAccountKey,
        { algorithm: 'RS256' },
      );
    });

    it('includes genericObjects in the JWT payload for generic passes', async () => {
      const jwt = jest.requireMock('jsonwebtoken') as { sign: jest.Mock };
      await provider.getSaveUrl(basePassData);

      const callArgs = jwt.sign.mock.calls[0][0] as {
        payload: { genericObjects?: unknown[] };
      };
      expect(callArgs.payload.genericObjects).toBeDefined();
      expect(callArgs.payload.genericObjects).toHaveLength(1);
    });
  });

  describe('voidPass', () => {
    it('patches the pass state to INACTIVE', async () => {
      // voidPass calls patch directly (not get) — patch resolves by default from beforeEach
      await provider.voidPass('google-test-001');
      expect(mockAxiosInstance.patch).toHaveBeenCalledWith(
        expect.stringContaining('genericObject'),
        { state: 'INACTIVE' },
      );
    });

    it('throws PassNotFoundError when the pass does not exist in any endpoint', async () => {
      // All endpoints return 404
      const notFound = Object.assign(new Error('Not found'), {
        isAxiosError: true,
        response: { status: 404 },
      });
      mockAxiosInstance.patch.mockRejectedValue(notFound);

      await expect(provider.voidPass('non-existent')).rejects.toThrow();
    });
  });

  describe('getPassStatus', () => {
    it('returns active:true when state is ACTIVE', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { state: 'ACTIVE' } });

      const status = await provider.getPassStatus('google-test-001');
      expect(status.active).toBe(true);
      expect(status.voided).toBe(false);
    });

    it('returns voided:true when state is INACTIVE', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { state: 'INACTIVE' } });

      const status = await provider.getPassStatus('google-test-001');
      expect(status.active).toBe(false);
      expect(status.voided).toBe(true);
    });

    it('throws PassNotFoundError when the pass is not found in any endpoint', async () => {
      const notFound = Object.assign(new Error('Not found'), {
        isAxiosError: true,
        response: { status: 404 },
      });
      mockAxiosInstance.get.mockRejectedValue(notFound);

      await expect(provider.getPassStatus('non-existent')).rejects.toThrow(PassNotFoundError);
    });
  });

  describe('authentication', () => {
    it('throws AuthenticationError when no service account is configured', async () => {
      const badProvider = new GoogleWalletProvider({
        issuerId: '12345',
        // no serviceAccountEmail, serviceAccountKey, or serviceAccountKeyFile
      });

      await expect(badProvider.createPass(basePassData)).rejects.toThrow(AuthenticationError);
    });
  });
});
