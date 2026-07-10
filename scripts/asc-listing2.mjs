// Remaining listing steps: age rating (via appInfos), price Free,
// availability, screenshots. Run: node scripts/asc-listing2.mjs
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const ROOT = process.cwd();
const KEY_ID = 'SVTXG8P9K9';
const ISSUER_ID = 'c46619e9-74be-420a-aaeb-746a63af1a11';
const APP_ID = '6789685146';
const API = 'https://api.appstoreconnect.apple.com';
const SHOTS_DIR = join(ROOT, 'screenshots', '6.5');
const SHOTS = ['01-idle.png', '02-heads.png', '03-tails.png', '04-tally.png'];

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

// 1. Age rating via appInfos
const infos = (await asc('GET', `/v1/apps/${APP_ID}/appInfos`)).data;
const info = infos.find((i) => ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED'].includes(i.attributes.appStoreState)) ?? infos[0];
const decl = (await asc('GET', `/v1/appInfos/${info.id}/ageRatingDeclaration`)).data;
console.log('Age rating declaration id:', decl.id);
console.log('Current attributes:', JSON.stringify(decl.attributes));

const BOOL_KEYS = [
  'advertising',
  'ageAssurance',
  'gambling',
  'healthOrWellnessTopics',
  'lootBox',
  'messagingAndChat',
  'parentalControls',
  'unrestrictedWebAccess',
  'userGeneratedContent',
];
const ENUM_KEYS = [
  'alcoholTobaccoOrDrugUseOrReferences',
  'contests',
  'gamblingSimulated',
  'gunsOrOtherWeapons',
  'medicalOrTreatmentInformation',
  'profanityOrCrudeHumor',
  'sexualContentGraphicAndNudity',
  'sexualContentOrNudity',
  'horrorOrFearThemes',
  'matureOrSuggestiveThemes',
  'violenceCartoonOrFantasy',
  'violenceRealisticProlongedGraphicOrSadistic',
  'violenceRealistic',
];
const attrs = {};
for (const k of BOOL_KEYS) if (k in decl.attributes) attrs[k] = false;
for (const k of ENUM_KEYS) if (k in decl.attributes) attrs[k] = 'NONE';
console.log('Patching with:', JSON.stringify(attrs));
await asc('PATCH', `/v1/ageRatingDeclarations/${decl.id}`, {
  data: { type: 'ageRatingDeclarations', id: decl.id, attributes: attrs },
});
console.log('Age rating declaration set');

// 2. Price: Free
const points = (await asc('GET', `/v1/apps/${APP_ID}/appPricePoints?filter[territory]=USA&limit=200`)).data;
const free = points.find((p) => Number(p.attributes.customerPrice) === 0);
if (!free) throw new Error('No 0-USD price point found');
await asc('POST', '/v1/appPriceSchedules', {
  data: {
    type: 'appPriceSchedules',
    relationships: {
      app: { data: { type: 'apps', id: APP_ID } },
      baseTerritory: { data: { type: 'territories', id: 'USA' } },
      manualPrices: { data: [{ type: 'appPrices', id: '${price1}' }] },
    },
  },
  included: [
    {
      type: 'appPrices',
      id: '${price1}',
      attributes: { startDate: null },
      relationships: { appPricePoint: { data: { type: 'appPricePoints', id: free.id } } },
    },
  ],
});
console.log('Price set: Free');

// 3. Availability: all territories
const territories = (await asc('GET', '/v1/territories?limit=200')).data;
await asc('POST', '/v2/appAvailabilities', {
  data: {
    type: 'appAvailabilities',
    attributes: { availableInNewTerritories: true },
    relationships: {
      app: { data: { type: 'apps', id: APP_ID } },
      territoryAvailabilities: { data: territories.map((t, i) => ({ type: 'territoryAvailabilities', id: `\${t${i}}` })) },
    },
  },
  included: territories.map((t, i) => ({
    type: 'territoryAvailabilities',
    id: `\${t${i}}`,
    attributes: { available: true },
    relationships: { territory: { data: { type: 'territories', id: t.id } } },
  })),
});
console.log(`Availability set: ${territories.length} territories`);

// 4. Screenshots
const versions = (await asc('GET', `/v1/apps/${APP_ID}/appStoreVersions?filter[appStoreState]=PREPARE_FOR_SUBMISSION&limit=5`)).data;
const version = versions[0];
const locs = (await asc('GET', `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`)).data;
const loc = locs.find((l) => l.attributes.locale === 'en-US') ?? locs[0];
const sets = (await asc('GET', `/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets`)).data;
let set = sets.find((s) => s.attributes.screenshotDisplayType === 'APP_IPHONE_65');
if (!set) {
  set = (
    await asc('POST', '/v1/appScreenshotSets', {
      data: {
        type: 'appScreenshotSets',
        attributes: { screenshotDisplayType: 'APP_IPHONE_65' },
        relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: loc.id } } },
      },
    })
  ).data;
  console.log('Created 6.5" screenshot set');
} else {
  const existing = (await asc('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots`)).data;
  for (const s of existing) await asc('DELETE', `/v1/appScreenshots/${s.id}`);
  if (existing.length) console.log(`Deleted ${existing.length} existing screenshots`);
}

for (const name of SHOTS) {
  const file = readFileSync(join(SHOTS_DIR, name));
  const reserved = (
    await asc('POST', '/v1/appScreenshots', {
      data: {
        type: 'appScreenshots',
        attributes: { fileName: basename(name), fileSize: file.length },
        relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: set.id } } },
      },
    })
  ).data;
  for (const op of reserved.attributes.uploadOperations) {
    const headers = Object.fromEntries(op.requestHeaders.map((h) => [h.name, h.value]));
    const chunk = file.subarray(op.offset, op.offset + op.length);
    const up = await fetch(op.url, { method: op.method, headers, body: chunk });
    if (!up.ok) throw new Error(`Upload part failed for ${name}: ${up.status}`);
  }
  await asc('PATCH', `/v1/appScreenshots/${reserved.id}`, {
    data: {
      type: 'appScreenshots',
      id: reserved.id,
      attributes: { uploaded: true, sourceFileChecksum: createHash('md5').update(file).digest('hex') },
    },
  });
  console.log(`Uploaded ${name} (${file.length} bytes)`);
}

console.log('done');
