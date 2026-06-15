# wallet-pass-gen

A provider-agnostic npm module for generating **Apple Wallet** (`.pkpass`) and **Google Wallet** passes, with built-in barcode/QR code generation, pass tracking, and webhook support.

## Features

- **Layer abstraction** — single unified API for Apple and Google Wallet
- **Fluent `PassBuilder`** with static factory methods per pass type
- **Apple Wallet** — generates signed `.pkpass` ZIP archives (PKCS#7, SHA-1 manifest)
- **Google Wallet** — creates pass classes & objects via REST API, returns JWT save links
- **Barcode & QR generation** — QR, PDF417, Aztec, Code128, Code39, EAN-13, UPC-A, DataMatrix
- **Tracking** — in-memory (or custom) event store for installs, opens, and scans
- **Webhooks** — HMAC-SHA256 signed dispatch with retry and per-event filtering
- **TypeScript-first** — full type definitions included

---

## Installation

```bash
npm install wallet-pass-gen
```

Peer requirement: Node.js ≥ 18.

---

## Local Development / Linking

Use this if you are working on `wallet-pass-gen` itself and want to consume it from another local project without publishing to npm.

### Step 1 — Build and register the module globally

```bash
# Inside the wallet-pass-gen directory
npm install       # install dependencies
npm run build     # compile TypeScript → dist/
npm link          # registers the package in the global npm symlink store
```

### Step 2 — Link into your consuming project

```bash
# Inside your other project's directory
npm link wallet-pass-gen
```

Your project will now resolve `import ... from 'wallet-pass-gen'` to the local `dist/` folder. Any time you change source files, re-run `npm run build` in the module directory to pick up the changes.

### Alternative — install by path (no global link)

If you prefer not to use `npm link`, install the package directly from its local path:

```bash
# Inside your consuming project
npm install /absolute/path/to/wallet-pass-gen
```

Or with a relative path:

```bash
npm install ../wallet-pass-gen
```

This copies the built package into `node_modules`. Re-run the install command after each rebuild to refresh it.

### Alternative — use `package.json` `file:` reference

Add the dependency directly in your consuming project's `package.json`:

```json
{
  "dependencies": {
    "wallet-pass-gen": "file:../wallet-pass-gen"
  }
}
```

Then run `npm install`. With a `file:` reference, npm installs a symlink so changes in `dist/` are reflected immediately after a rebuild (same behaviour as `npm link`, but scoped to one project).

### Unlinking

```bash
# In the consuming project
npm unlink wallet-pass-gen

# In the wallet-pass-gen directory (removes the global registration)
npm unlink
```

---

## Quick Start

```typescript
import {
  WalletPassFactory,
  PassBuilder,
  WalletProvider,
  BarcodeType,
} from 'wallet-pass-gen';

// 1. Create factory and register providers
const factory = new WalletPassFactory();

factory.registerProvider(WalletProvider.APPLE, {
  certData: fs.readFileSync('./certs/pass.pem'),
  keyData: fs.readFileSync('./certs/pass.key'),
  wwdrData: fs.readFileSync('./certs/wwdr.pem'),
  teamIdentifier: 'ABCDE12345',
  passTypeIdentifier: 'pass.com.example.myapp',
});

factory.registerProvider(WalletProvider.GOOGLE, {
  issuerId: '3388000000022195225',
  serviceAccountEmail: 'wallet@my-project.iam.gserviceaccount.com',
  serviceAccountKey: '-----BEGIN PRIVATE KEY-----\n...',
});

// 2. Build the pass data
const pass = PassBuilder.eventTicket()
  .setInfo({
    serialNumber: 'evt-2024-001',
    description: 'Rock Concert — General Admission',
    organizationName: 'Acme Events',
  })
  .setStyle({
    backgroundColor: '#1a1a2e',
    foregroundColor: '#ffffff',
    labelColor: '#e94560',
  })
  .setBarcode({
    type: BarcodeType.QR_CODE,
    value: 'https://myapp.com/validate/evt-2024-001',
    alternateText: 'evt-2024-001',
  })
  .addHeaderField({ key: 'tier', label: 'TIER', value: 'General Admission' })
  .addPrimaryField({ key: 'event', label: 'EVENT', value: 'Rock Concert' })
  .addSecondaryField({ key: 'date', label: 'DATE', value: '2024-08-15' })
  .addSecondaryField({ key: 'venue', label: 'VENUE', value: 'Madison Square Garden' })
  .addBackField({ key: 'info', label: 'Info', value: 'Doors open at 7 PM.' })
  .build();

// 3. Create Apple pass (.pkpass Buffer)
const appleResult = await factory.createPass(WalletProvider.APPLE, pass);
fs.writeFileSync('ticket.pkpass', appleResult.buffer!);

// 4. Create Google Wallet save link
const googleResult = await factory.createPass(WalletProvider.GOOGLE, pass);
console.log(googleResult.saveUrl); // https://pay.google.com/gp/v/save/{jwt}
```

---

## PassBuilder

All builder methods return `this` for chaining. Call `.build()` at the end to get a validated `PassData` object.

### Static factory methods

```typescript
PassBuilder.eventTicket()   // concert tickets, sports events
PassBuilder.coupon()        // discounts, offers
PassBuilder.loyaltyCard()   // store cards, membership cards
PassBuilder.boardingPass()  // flights, trains
PassBuilder.generic()       // any other pass type
```

### Core methods

| Method | Description |
|---|---|
| `setType(PassType)` | Set pass type (redundant when using static factories) |
| `setInfo(PassInfo)` | Required. Serial number, description, organization |
| `setStyle(PassStyle)` | Background, foreground, label colors and logo text |
| `setBarcode(BarcodeConfig)` | Attach a barcode / QR code to the pass |
| `addImage(PassImage)` | Add logo, icon, background, strip, thumbnail, or footer image |
| `addLocation(PassLocation)` | Trigger pass notification near a location |
| `addBeacon(PassBeacon)` | Trigger notification near an iBeacon |
| `setNFC(PassNFC)` | Configure NFC payload (Apple only) |
| `setMaxDistance(meters)` | Limit location trigger radius |
| `build()` | Validate and return `PassData` |

### Field methods

Fields control the text displayed on the front and back of the pass.

```typescript
.addHeaderField({ key, label, value })     // top strip (1–2 items)
.addPrimaryField({ key, label, value })    // large prominent field
.addSecondaryField({ key, label, value })  // medium fields below primary
.addAuxiliaryField({ key, label, value })  // smaller supplemental fields
.addBackField({ key, label, value })       // back of the pass (tap to view)
```

Each `PassField` supports optional formatting:

```typescript
{
  key: 'price',
  label: 'TOTAL',
  value: 49.99,
  numberStyle: NumberStyle.DECIMAL,
  currencyCode: 'USD',
  textAlignment: TextAlignment.RIGHT,
}

{
  key: 'expires',
  label: 'EXPIRES',
  value: new Date('2025-12-31'),
  dateStyle: DateStyle.SHORT,
  timeStyle: DateStyle.NONE,
  isRelative: true,         // shows "in 6 months" rather than a date
}
```

---

## Pass Styling

```typescript
.setStyle({
  backgroundColor: '#1a1a2e',   // pass background
  foregroundColor: '#ffffff',   // text color
  labelColor: '#e94560',        // field label color
  stripColor: '#0f3460',        // strip image background (Apple)
  logoText: 'My App',           // text next to logo (Apple)
})
```

Accepts standard CSS hex colors (`#RRGGBB`). The module converts automatically to each provider's format (Apple uses `rgb(r,g,b)`; Google uses hex).

---

## Barcode Generation

Barcodes can be embedded in a pass via `setBarcode()` or generated as standalone images.

### Supported types

| Enum | Format | Typical use |
|---|---|---|
| `BarcodeType.QR_CODE` | QR | URLs, short text |
| `BarcodeType.PDF_417` | PDF417 | Airline boarding passes |
| `BarcodeType.AZTEC` | Aztec | Transit tickets |
| `BarcodeType.CODE_128` | Code 128 | Retail, logistics |
| `BarcodeType.CODE_39` | Code 39 | Industrial |
| `BarcodeType.EAN_13` | EAN-13 | Retail products |
| `BarcodeType.UPC_A` | UPC-A | North-American retail |
| `BarcodeType.DATA_MATRIX` | DataMatrix | Dense 2-D data |

### Standalone barcode generation

```typescript
import { BarcodeGenerator, BarcodeType, BarcodeFormat } from 'wallet-pass-gen';

const gen = new BarcodeGenerator();

// PNG Buffer
const result = await gen.generate({
  type: BarcodeType.QR_CODE,
  value: 'https://myapp.com/validate/123',
  format: BarcodeFormat.PNG,
  width: 300,
  height: 300,
});
fs.writeFileSync('qr.png', result.data as Buffer);

// Data URL (embed in HTML)
const dataUrl = await gen.generateAsDataURL({
  type: BarcodeType.PDF_417,
  value: 'M1DOE/JOHN            EABC123 LAXJFK AA 0001 150Y',
});

// SVG string
const svg = await gen.generateAsSVG({
  type: BarcodeType.CODE_128,
  value: 'ITEM-987654',
});
```

Via the factory:

```typescript
const gen = factory.getBarcodeGenerator();
```

---

## Apple Wallet

### Configuration

```typescript
factory.registerProvider(WalletProvider.APPLE, {
  // Certificate — provide file paths OR raw data (Buffer/string)
  certPath: './certs/pass.pem',       // or certData: Buffer | string
  keyPath: './certs/pass.key',        // or keyData: Buffer | string
  keyPassphrase: 'optional-password',
  wwdrPath: './certs/wwdr.pem',       // Apple WWDR cert (or wwdrData)

  teamIdentifier: 'ABCDE12345',       // Apple Team ID
  passTypeIdentifier: 'pass.com.example.myapp',

  // Optional: for push update notifications
  webServiceURL: 'https://myapp.com/wallet',
  authenticationToken: 'my-auth-token-32chars+',
});
```

### Getting your certificates

1. In Xcode / Apple Developer portal, create a **Pass Type ID** (`pass.com.yourapp.something`)
2. Generate a **Pass Certificate** and export as `.p12`
3. Extract PEM files:
   ```bash
   # Extract certificate
   openssl pkcs12 -in pass.p12 -clcerts -nokeys -out pass.pem

   # Extract private key
   openssl pkcs12 -in pass.p12 -nocerts -nodes -out pass.key

   # Download WWDR from Apple:
   # https://www.apple.com/certificateauthority/
   # Apple Worldwide Developer Relations — G4 (or current)
   curl -o wwdr.pem https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer
   openssl x509 -inform DER -in wwdr.pem -out wwdr.pem
   ```

### Creating a pass

```typescript
const result = await factory.createPass(WalletProvider.APPLE, passData);

result.buffer    // Buffer — the .pkpass ZIP archive
result.passId    // serial number

// Serve it from Express:
app.get('/passes/:id', async (req, res) => {
  const result = await factory.createPass(WalletProvider.APPLE, passData);
  res.setHeader('Content-Type', 'application/vnd.apple.pkpass');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.id}.pkpass"`);
  res.send(result.buffer);
});
```

### Adding images

```typescript
import fs from 'fs';

builder
  .addImage({ type: 'logo', data: fs.readFileSync('./logo.png'), scale: 2 })
  .addImage({ type: 'icon', data: fs.readFileSync('./icon.png'), scale: 3 })
  .addImage({ type: 'strip', data: fs.readFileSync('./strip.png') });
```

| Image type | Description | Recommended size |
|---|---|---|
| `icon` | App-switcher and notification icon | 29×29 pt |
| `logo` | Top-left of pass | 160×50 pt |
| `background` | Full pass background | 180×220 pt |
| `strip` | Strip behind primary fields | 375×98 pt |
| `thumbnail` | Thumbnail beside primary fields | 90×90 pt |
| `footer` | Above barcode | 286×15 pt |

Provide `@2x` and `@3x` variants by adding the same `type` with `scale: 2` and `scale: 3`.

### Push updates (web service)

When `webServiceURL` is set, Apple devices poll your server for updates. Implement the required endpoints:

```
GET  /v1/passes/{passTypeIdentifier}/{serialNumber}  → return updated .pkpass
GET  /v1/devices/{deviceId}/registrations/{passTypeId}?passesUpdatedSince=…
POST /v1/devices/{deviceId}/registrations/{passTypeId}/{serialNumber}
DELETE /v1/devices/{deviceId}/registrations/{passTypeId}/{serialNumber}
POST /v1/log
```

Use `TrackingService.createAppleWebhookMiddleware()` to handle registrations automatically.

---

## Google Wallet

### Configuration

```typescript
factory.registerProvider(WalletProvider.GOOGLE, {
  issuerId: '3388000000022195225',   // Issuer ID from Google Pay & Wallet Console

  // Service account — provide key string OR path to JSON key file
  serviceAccountEmail: 'wallet@my-project.iam.gserviceaccount.com',
  serviceAccountKey: '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----',
  // OR:
  serviceAccountKeyFile: './service-account.json',

  classId: 'my-default-class',      // optional default class ID
  applicationName: 'My App',        // optional
});
```

### Getting credentials

1. Go to the [Google Pay & Wallet Console](https://pay.google.com/business/console/)
2. Create an **Issuer account** and note the **Issuer ID**
3. In Google Cloud Console, create a **service account** and grant it the **Google Wallet Object Issuer** role
4. Download the JSON key file for the service account

### Creating a pass

```typescript
const result = await factory.createPass(WalletProvider.GOOGLE, passData);

result.saveUrl   // https://pay.google.com/gp/v/save/{jwt}
result.passId    // serialNumber

// Redirect user to the save link:
res.redirect(result.saveUrl!);

// Or embed a "Add to Google Wallet" button:
// <a href="${result.saveUrl}"><img src="add-to-google-wallet.svg"/></a>
```

### Supported pass types (Google)

| `PassType` | Google object type |
|---|---|
| `GENERIC` | `genericObject` |
| `EVENT_TICKET` | `eventTicketObject` |
| `LOYALTY_CARD` / `STORE_CARD` | `loyaltyObject` |
| `COUPON` | `offerObject` |
| `BOARDING_PASS` | `transitObject` |

---

## Tracking

Track pass lifecycle events (install, open, scan) using the built-in `TrackingService`.

### Basic usage

```typescript
const tracking = factory.getTrackingService();

// Record an event manually
await tracking.trackEvent({
  event: TrackingEvent.SCAN,
  passId: 'evt-2024-001',
  provider: 'apple',
  timestamp: new Date(),
  deviceInfo: { os: 'iOS', osVersion: '17.0' },
});

// Query tracking data
const info = await tracking.getTrackingInfo('evt-2024-001');
console.log(info.installs, info.opens, info.scans);
console.log(info.events); // full event log
```

### Listening to events

`TrackingService` is an `EventEmitter`:

```typescript
tracking.on('event', (data: TrackingEventData) => {
  console.log(`[${data.event}] pass ${data.passId} at ${data.timestamp}`);
});
```

### Custom storage

By default events are stored in memory. Provide a custom storage adapter (e.g. to persist in a database):

```typescript
class PostgresTrackingStorage implements TrackingStorage {
  async save(event: TrackingEventData) { /* INSERT */ }
  async getByPassId(passId: string) { /* SELECT */ }
  async getAll() { /* SELECT all */ }
  async delete(passId: string) { /* DELETE */ }
}

const factory = new WalletPassFactory({
  storage: 'custom',
  customStorage: new PostgresTrackingStorage(),
  maxEventsPerPass: 500,
});
```

### Apple web service middleware

Mount this Express middleware to receive registration and scan events from Apple:

```typescript
import express from 'express';

const app = express();
const tracking = factory.getTrackingService();

// Receives POST from Apple devices when a pass is added/removed
app.use('/wallet', tracking.createAppleWebhookMiddleware());
```

---

## Webhooks

Dispatch signed HTTP callbacks to your server (or third-party) on pass events.

### Configuration

```typescript
factory.configureWebhook('my-hook', {
  url: 'https://myapp.com/webhooks/wallet',
  secret: 'my-32-char-signing-secret',      // HMAC-SHA256 key
  method: WebhookMethod.POST,               // default POST
  events: [TrackingEvent.INSTALL, TrackingEvent.SCAN],  // filter; omit for all
  retryAttempts: 3,
  retryDelay: 1000,    // ms between retries (doubles each attempt)
  timeout: 5000,       // ms before request times out
  headers: { 'X-Source': 'wallet-pass-gen' },
});
```

Or pass webhooks at construction time:

```typescript
const factory = new WalletPassFactory({
  webhooks: [
    { url: 'https://myapp.com/hooks', secret: 'secret', events: ['install', 'scan'] },
  ],
});
```

### Webhook payload

Each request is a `POST` with JSON body:

```json
{
  "event": "scan",
  "passId": "evt-2024-001",
  "provider": "apple",
  "timestamp": "2024-08-15T20:30:00.000Z",
  "deviceInfo": { "os": "iOS", "osVersion": "17.0" },
  "location": { "latitude": 40.7505, "longitude": -73.9934 },
  "metadata": {}
}
```

The request includes an `X-Wallet-Signature` header (HMAC-SHA256 of the JSON body):

```
X-Wallet-Signature: sha256=<hex>
```

### Verifying incoming webhooks

```typescript
import { WebhookService } from 'wallet-pass-gen';

const webhookService = new WebhookService();

// Express handler that verifies signature and parses the event
app.post(
  '/webhooks/wallet',
  webhookService.createIncomingWebhookHandler('my-32-char-signing-secret'),
);
```

---

## Create Passes for All Providers at Once

```typescript
const results = await factory.createPassForAllProviders(passData);

const appleBuffer = results.get(WalletProvider.APPLE)?.buffer;
const googleUrl = results.get(WalletProvider.GOOGLE)?.saveUrl;
```

---

## Using Providers Directly

Skip the factory if you only need one provider:

```typescript
import { AppleWalletProvider, GoogleWalletProvider } from 'wallet-pass-gen';

const apple = new AppleWalletProvider({ certPath: '...', keyPath: '...', ... });
const result = await apple.createPass(passData);

const google = new GoogleWalletProvider({ issuerId: '...', serviceAccountKey: '...' });
const saveUrl = await google.getSaveUrl(passData);
```

### Provider interface

Both providers implement the same `BaseWalletPassProvider` API:

```typescript
createPass(passData, options?)     → Promise<PassResult>
updatePass(passId, updates, opts?) → Promise<PassResult>
voidPass(passId)                   → Promise<void>
getSaveUrl(passData)               → Promise<string>
getPassStatus(passId)              → Promise<{ active, voided, updatedAt? }>
```

---

## Error Handling

All errors extend `WalletPassError` and include a typed `code`:

```typescript
import {
  WalletPassError,
  PassValidationError,
  PassCreationError,
  AuthenticationError,
  BarcodeGenerationError,
  ProviderNotFoundError,
  TrackingError,
  WebhookError,
} from 'wallet-pass-gen';

try {
  const result = await factory.createPass(WalletProvider.APPLE, passData);
} catch (err) {
  if (err instanceof PassValidationError) {
    console.error('Invalid pass data:', err.message);   // err.code === 'PASS_VALIDATION_ERROR'
  } else if (err instanceof AuthenticationError) {
    console.error('Certificate issue:', err.message);   // err.code === 'AUTHENTICATION_ERROR'
  } else if (err instanceof PassCreationError) {
    console.error('Creation failed:', err.message, err.details);
  }
}
```

| Error class | `code` | Thrown when |
|---|---|---|
| `PassValidationError` | `PASS_VALIDATION_ERROR` | Required fields missing or invalid |
| `PassCreationError` | `PASS_CREATION_ERROR` | Signing, ZIP, or API failure |
| `AuthenticationError` | `AUTHENTICATION_ERROR` | Invalid certificates or service account |
| `BarcodeGenerationError` | `BARCODE_GENERATION_ERROR` | Barcode library error |
| `ProviderNotFoundError` | `PROVIDER_NOT_FOUND` | Provider not registered |
| `TrackingError` | `TRACKING_ERROR` | Storage failure |
| `WebhookError` | `WEBHOOK_ERROR` | Webhook dispatch permanently failed |
| `PassNotFoundError` | `PASS_NOT_FOUND` | Pass ID does not exist |

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `WALLET_PASS_DEBUG` | `false` | Set to `true` to enable verbose debug logging |

---

## TypeScript Types Reference

```typescript
// Enums
PassType        // GENERIC | EVENT_TICKET | COUPON | LOYALTY_CARD | BOARDING_PASS | STORE_CARD
WalletProvider  // APPLE | GOOGLE
BarcodeType     // QR_CODE | PDF_417 | AZTEC | CODE_128 | CODE_39 | EAN_13 | UPC_A | DATA_MATRIX
BarcodeFormat   // PNG | SVG | DATA_URL
TrackingEvent   // INSTALL | OPEN | SCAN | UPDATE | VOID | EXPIRATION
TextAlignment   // LEFT | CENTER | RIGHT | NATURAL
DateStyle       // NONE | SHORT | MEDIUM | LONG | FULL
NumberStyle     // DECIMAL | PERCENT | SCIENTIFIC | SPELL_OUT
WebhookMethod   // POST | PUT

// Core data shapes
PassData            // Full pass definition (input to createPass)
PassResult          // Output of createPass — buffer (Apple) or saveUrl (Google)
PassInfo            // Serial number, description, org name, expiration, etc.
PassStyle           // Background, foreground, label colors
PassField           // A single labelled field with value and formatting options
PassImage           // Image buffer with type (logo|icon|background|strip|thumbnail|footer)
PassLocation        // GPS coordinates for proximity notifications
PassBeacon          // iBeacon config for proximity notifications
PassNFC             // NFC message payload

// Provider config
AppleProviderConfig   // Certs, team ID, pass type identifier
GoogleProviderConfig  // Issuer ID, service account credentials

// Tracking
TrackingEventData     // Event record (event type, passId, timestamp, device info)
TrackingInfo          // Aggregated counts + full event list for a pass
TrackingConfig        // Storage adapter + webhook list
TrackingStorage       // Interface for custom storage backends
WebhookConfig         // URL, secret, events filter, retry config
```

---

## Architecture

```
wallet-pass-gen
├── WalletPassFactory          ← entry point; wires providers + services
│   ├── AppleWalletProvider    ← PKCS#7 signing, JSZip .pkpass builder
│   └── GoogleWalletProvider   ← Google Wallet REST API + JWT save links
├── PassBuilder                ← fluent builder; validates PassData
├── BarcodeGenerator           ← qrcode (QR) + bwip-js (all other types)
├── TrackingService            ← EventEmitter; in-memory or custom storage
└── WebhookService             ← HMAC-signed HTTP dispatch with retry
```

The `BaseWalletPassProvider` abstract class defines the common contract. Adding a new provider (e.g. Samsung Wallet) means implementing five methods and registering the new `WalletProvider` enum value.

---

## License

MIT
