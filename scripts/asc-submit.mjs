// Submits the prepared version to App Review.
// Run: node scripts/asc-submit.mjs
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
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json.errors ?? json).slice(0, 800)}`);
  return json;
}

const EDITABLE = ['PREPARE_FOR_SUBMISSION', 'REJECTED', 'DEVELOPER_REJECTED', 'METADATA_REJECTED'];
const version = (await asc('GET', `/apps/${APP_ID}/appStoreVersions?limit=3`)).data.find((v) =>
  EDITABLE.includes(v.attributes.appStoreState)
);
if (!version) throw new Error('No editable version found');
console.log(`Submitting version ${version.attributes.versionString} (state ${version.attributes.appStoreState})`);

// Reuse an open submission if one exists (including one bounced back with
// unresolved issues after a rejection), else create one
const OPEN_STATES = ['READY_FOR_REVIEW', 'UNRESOLVED_ISSUES'];
let submission = (await asc('GET', `/reviewSubmissions?filter[app]=${APP_ID}&limit=10`)).data.find((s) =>
  OPEN_STATES.includes(s.attributes.state)
);
if (!submission) {
  submission = (
    await asc('POST', '/reviewSubmissions', {
      data: {
        type: 'reviewSubmissions',
        attributes: { platform: 'IOS' },
        relationships: { app: { data: { type: 'apps', id: APP_ID } } },
      },
    })
  ).data;
  console.log(`Created review submission ${submission.id}`);
} else {
  console.log(`Reusing open review submission ${submission.id}`);
}

// Attach the version if not already attached
const items = (await asc('GET', `/reviewSubmissions/${submission.id}/items`)).data;
if (items.length === 0) {
  await asc('POST', '/reviewSubmissionItems', {
    data: {
      type: 'reviewSubmissionItems',
      relationships: {
        reviewSubmission: { data: { type: 'reviewSubmissions', id: submission.id } },
        appStoreVersion: { data: { type: 'appStoreVersions', id: version.id } },
      },
    },
  });
  console.log('Attached version 1.0 to the submission');
} else {
  console.log('Submission already has an item');
}

// Submit
await asc('PATCH', `/reviewSubmissions/${submission.id}`, {
  data: { type: 'reviewSubmissions', id: submission.id, attributes: { submitted: true } },
});
console.log('SUBMITTED TO APP REVIEW');
