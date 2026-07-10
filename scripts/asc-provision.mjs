// Sets up local iOS signing credentials for EAS build, without any interactive
// prompts and without ever logging secret values:
//  1. Ensures the bundle ID is registered on the Apple Developer Portal.
//  2. Reuses the existing distribution certificate (.p12 from the Pomodoro
//     project; its password is carried JSON->JSON, never printed).
//  3. Creates a fresh App Store provisioning profile via the ASC API.
//  4. Writes ./credentials.json + ./credentials/ for credentialsSource=local.
// Run from the project root: node scripts/asc-provision.mjs
import { createPrivateKey, sign } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const ROOT = process.cwd();
const KEY_ID = 'SVTXG8P9K9';
const ISSUER_ID = 'c46619e9-74be-420a-aaeb-746a63af1a11';
const P8_PATH = join(ROOT, `AuthKey_${KEY_ID}.p8`);
const BUNDLE_ID = 'com.hasanzafar.coinflip';
const SOURCE_CREDS = 'D:/Pomodoro Timer/credentials.json';
const SOURCE_ROOT = 'D:/Pomodoro Timer';
const API = 'https://api.appstoreconnect.apple.com/v1';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function makeJwt() {
  // iat backdated 30s (Apple 401s on clock skew); provisioning endpoints
  // reject 20-min lifetimes, so keep exp short.
  const now = Math.floor(Date.now() / 1000) - 30;
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({ iss: ISSUER_ID, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' })
  );
  const input = `${header}.${payload}`;
  const key = createPrivateKey(readFileSync(P8_PATH, 'utf8'));
  const sig = sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' });
  return `${input}.${b64url(sig)}`;
}

const jwt = makeJwt();

async function asc(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json.errors ?? json).slice(0, 500)}`);
  }
  return json;
}

// 1. Bundle ID
let bundle = (await asc('GET', `/bundleIds?filter[identifier]=${BUNDLE_ID}`)).data.find(
  (b) => b.attributes.identifier === BUNDLE_ID
);
if (!bundle) {
  bundle = (
    await asc('POST', '/bundleIds', {
      data: {
        type: 'bundleIds',
        attributes: { identifier: BUNDLE_ID, name: 'Coin Flip', platform: 'IOS' },
      },
    })
  ).data;
  console.log(`Registered bundle ID: ${bundle.id}`);
} else {
  console.log(`Bundle ID already registered: ${bundle.id}`);
}

// (No push/notifications capability needed — this app has no notifications.)

// 1b. Remove stale profiles for this app
const stale = (await asc('GET', '/profiles?filter[profileType]=IOS_APP_STORE&limit=200')).data.filter(
  (p) => p.attributes.name.startsWith('CoinFlip AppStore')
);
for (const p of stale) {
  await asc('DELETE', `/profiles/${p.id}`);
  console.log(`Deleted stale profile ${p.id} (${p.attributes.name})`);
}

// 2. Distribution certificate (must match the .p12 we hold the key for)
const certs = (await asc('GET', '/certificates?filter[certificateType]=IOS_DISTRIBUTION,DISTRIBUTION&limit=20')).data.filter(
  (c) => new Date(c.attributes.expirationDate) > new Date()
);
console.log(`Valid distribution certificates on team: ${certs.length} [${certs.map((c) => `${c.id} exp ${c.attributes.expirationDate.slice(0, 10)}`).join(', ')}]`);
if (certs.length === 0) throw new Error('No valid distribution certificate found');

// 3. Provisioning profile
const profile = (
  await asc('POST', '/profiles', {
    data: {
      type: 'profiles',
      attributes: { name: `CoinFlip AppStore ${Date.now()}`, profileType: 'IOS_APP_STORE' },
      relationships: {
        bundleId: { data: { type: 'bundleIds', id: bundle.id } },
        certificates: { data: certs.map((c) => ({ type: 'certificates', id: c.id })) },
      },
    },
  })
).data;
console.log(`Created provisioning profile: ${profile.id} (${profile.attributes.name})`);

mkdirSync(join(ROOT, 'credentials'), { recursive: true });
const profilePath = 'credentials/coinflip.mobileprovision';
writeFileSync(join(ROOT, profilePath), Buffer.from(profile.attributes.profileContent, 'base64'));
console.log(`Wrote ${profilePath}`);

// 4. credentials.json — reuse the dist cert file + password from Pomodoro
const src = JSON.parse(readFileSync(SOURCE_CREDS, 'utf8'));
const srcCert = src.ios.distributionCertificate;
const certFile = basename(srcCert.path);
copyFileSync(join(SOURCE_ROOT, srcCert.path), join(ROOT, 'credentials', certFile));
writeFileSync(
  join(ROOT, 'credentials.json'),
  JSON.stringify(
    {
      ios: {
        provisioningProfilePath: profilePath,
        distributionCertificate: { path: `credentials/${certFile}`, password: srcCert.password },
      },
    },
    null,
    2
  )
);
console.log(`Copied dist cert -> credentials/${certFile}; wrote credentials.json (password carried over, not shown)`);
