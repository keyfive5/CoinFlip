// Copies the App Review contact details from the Boxing Rounds submission to
// this app's editable version, sets sign-in-not-required, and configures
// automatic release. Values are copied API-to-API and never printed.
// Run: node scripts/asc-review-details.mjs
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const KEY_ID = 'SVTXG8P9K9';
const ISSUER_ID = 'c46619e9-74be-420a-aaeb-746a63af1a11';
const APP_ID = '6789685146'; // Pomodoro Rounds
const SOURCE_APP_ID = '6786947702'; // Boxing Rounds
const API = 'https://api.appstoreconnect.apple.com/v1';

const b64url = (buf) => Buffer.from(buf).toString('base64url');
function makeJwt() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iss: ISSUER_ID, iat: now - 30, exp: now + 900, aud: 'appstoreconnect-v1' }));
  const input = `${header}.${payload}`;
  const key = createPrivateKey(readFileSync(join(ROOT, `AuthKey_${KEY_ID}.p8`), 'utf8'));
  return `${input}.${b64url(sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' }))}`;
}
const jwt = makeJwt();

async function asc(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json.errors ?? json).slice(0, 600)}`);
  return json;
}

// Source review details from Boxing Rounds (any state)
const srcVersions = (await asc('GET', `/apps/${SOURCE_APP_ID}/appStoreVersions?limit=5`)).data;
let srcDetail = null;
for (const v of srcVersions) {
  try {
    const d = (await asc('GET', `/appStoreVersions/${v.id}/appStoreReviewDetail`)).data;
    if (d && d.attributes.contactEmail) {
      srcDetail = d;
      break;
    }
  } catch {}
}
if (!srcDetail) throw new Error('No source review detail found on Boxing Rounds');
const a = srcDetail.attributes;
console.log('Found source review contact (values not shown)');

// Target version
const version = (await asc('GET', `/apps/${APP_ID}/appStoreVersions?filter[appStoreState]=PREPARE_FOR_SUBMISSION&limit=1`)).data[0];

const attributes = {
  contactFirstName: a.contactFirstName,
  contactLastName: a.contactLastName,
  contactPhone: a.contactPhone,
  contactEmail: a.contactEmail,
  demoAccountRequired: false,
  notes: 'Simple offline coin flip app. No account or sign-in. No network requests — all data stays on device. Tap anywhere to flip the coin; long-press the bottom tally to reset it.',
};

let existing = null;
try {
  existing = (await asc('GET', `/appStoreVersions/${version.id}/appStoreReviewDetail`)).data;
} catch {}
if (existing) {
  await asc('PATCH', `/appStoreReviewDetails/${existing.id}`, {
    data: { type: 'appStoreReviewDetails', id: existing.id, attributes },
  });
} else {
  await asc('POST', '/appStoreReviewDetails', {
    data: {
      type: 'appStoreReviewDetails',
      attributes,
      relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } } },
    },
  });
}
console.log('Review contact set; demo account marked not required');

// Automatic release after approval
await asc('PATCH', `/appStoreVersions/${version.id}`, {
  data: { type: 'appStoreVersions', id: version.id, attributes: { releaseType: 'AFTER_APPROVAL' } },
});
console.log('Release type: automatic after approval');
console.log('done');
