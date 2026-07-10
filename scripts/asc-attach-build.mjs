// Attaches the latest processed build to the editable App Store version and
// declares content rights. Run: node scripts/asc-attach-build.mjs
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const KEY_ID = 'SVTXG8P9K9';
const ISSUER_ID = 'c46619e9-74be-420a-aaeb-746a63af1a11';
const APP_ID = '6789685146';
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

// Latest build + processing state
const builds = (await asc('GET', `/builds?filter[app]=${APP_ID}&sort=-uploadedDate&limit=3`)).data;
if (builds.length === 0) throw new Error('No builds found yet — Apple may still be ingesting the upload');
for (const b of builds) {
  console.log(`Build ${b.attributes.version} — ${b.attributes.processingState}`);
}
const ready = builds.find((b) => b.attributes.processingState === 'VALID');
if (!ready) {
  console.log('No VALID build yet — still processing. Re-run in a few minutes.');
  process.exit(2);
}

const EDITABLE = ['PREPARE_FOR_SUBMISSION', 'REJECTED', 'DEVELOPER_REJECTED', 'METADATA_REJECTED'];
const version = (await asc('GET', `/apps/${APP_ID}/appStoreVersions?limit=3`)).data.find((v) =>
  EDITABLE.includes(v.attributes.appStoreState)
);
if (!version) throw new Error('No editable version found');
await asc('PATCH', `/appStoreVersions/${version.id}/relationships/build`, {
  data: { type: 'builds', id: ready.id },
});
console.log(`Attached build ${ready.attributes.version} to version ${version.attributes.versionString}`);

// Content rights: app contains no third-party content
await asc('PATCH', `/apps/${APP_ID}`, {
  data: { type: 'apps', id: APP_ID, attributes: { contentRightsDeclaration: 'DOES_NOT_USE_THIRD_PARTY_CONTENT' } },
});
console.log('Declared content rights: does not use third-party content');
console.log('done');
