'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const CHROME = 'https://chromewebstore.googleapis.com';
const EDGE = 'https://api.addons.microsoftedge.microsoft.com';

function required(env, names) {
  const missing = names.filter(name => !env[name]?.trim());
  if (missing.length) throw new Error('Missing GitHub Secrets: ' + missing.join(', '));
}
function config(env) {
  if (!['chrome', 'edge'].includes(env.STORE) || !['upload', 'publish'].includes(env.MODE)) throw new Error('Invalid store or mode.');
  const names = env.STORE === 'chrome'
    ? ['CWS_PUBLISHER_ID', 'CWS_EXTENSION_ID', 'CWS_CLIENT_ID', 'CWS_CLIENT_SECRET', 'CWS_REFRESH_TOKEN']
    : ['EDGE_PRODUCT_ID', 'EDGE_CLIENT_ID', 'EDGE_API_KEY'];
  required(env, names);
  if (env.STORE === 'chrome' && (!/^[a-p]{32}$/.test(env.CWS_EXTENSION_ID) || !/^[a-zA-Z0-9_-]+$/.test(env.CWS_PUBLISHER_ID))) throw new Error('Invalid Chrome item identifiers.');
  if (env.STORE === 'edge' && !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(env.EDGE_PRODUCT_ID)) throw new Error('EDGE_PRODUCT_ID must be the Partner Center GUID, not the store URL ID.');
  return env;
}
function client(fetchImpl = fetch) {
  return async (url, options = {}) => {
    // No automatic retries for mutating requests. Do not follow credential-bearing redirects.
    let response;
    try { response = await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(90000) }); }
    catch { throw new Error('Store request interrupted; inspect dashboard before retrying.'); }
    if (!response.ok) throw new Error(`Store API HTTP ${response.status}; inspect dashboard. Raw responses are withheld to protect credentials.`);
    let data = {};
    const raw = await response.text();
    if (raw) { try { data = JSON.parse(raw); } catch { throw new Error('Invalid store API JSON response.'); } }
    return { data, response };
  };
}
async function poll(read, stateOf, success, pending, sleep) {
  for (let i = 0; i < 40; i++) {
    const data = await read();
    const state = stateOf(data);
    if (state === success) return data;
    if (state !== pending) throw new Error('Store operation failed or returned an unknown state; inspect dashboard.');
    await sleep(10000);
  }
  throw new Error('Store operation still pending. Inspect dashboard before rerunning; do not blindly resubmit.');
}
function operationURL(location, base) {
  if (!location) throw new Error('Missing Edge operation location.');
  if (/^[a-zA-Z0-9_-]+$/.test(location)) return base + '/operations/' + location;
  const url = new URL(location, EDGE);
  if (url.origin !== EDGE || url.username || url.password || url.search || url.hash || !url.href.startsWith(base + '/operations/') || !/^[a-zA-Z0-9_-]+$/.test(url.href.slice((base + '/operations/').length))) throw new Error('Rejected unexpected Edge operation URL.');
  return url.href;
}
async function chrome(env, zip, api, sleep) {
  const token = (await api('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.CWS_CLIENT_ID, client_secret: env.CWS_CLIENT_SECRET, refresh_token: env.CWS_REFRESH_TOKEN, grant_type: 'refresh_token' })
  })).data.access_token;
  if (!token) throw new Error('Chrome access token was not returned.');
  const headers = { Authorization: 'Bearer ' + token };
  const name = `publishers/${env.CWS_PUBLISHER_ID}/items/${env.CWS_EXTENSION_ID}`;
  const statusURL = `${CHROME}/v2/${name}:fetchStatus`;
  const before = (await api(statusURL, { headers })).data;
  if (before.takenDown || before.warned) throw new Error('Chrome policy warning requires dashboard review.');
  if (['REJECTED', 'CANCELLED'].includes(before.submittedItemRevisionStatus?.state)) throw new Error('Chrome previous submission requires dashboard review before resubmission.');
  const revisions = [before.publishedItemRevisionStatus, before.submittedItemRevisionStatus];
  if (revisions.some(rev => rev?.distributionChannels?.some(c => c.crxVersion === env.STORE_VERSION))) {
    return 'Chrome: this version already exists in a published/submitted revision; skipped. Check dashboard status.';
  }
  if (before.submittedItemRevisionStatus) throw new Error('Chrome has an existing submission. Resolve it in the dashboard first.');
  const upload = (await api(`${CHROME}/upload/v2/${name}:upload`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/zip' }, body: zip })).data;
  if (upload.uploadState === 'IN_PROGRESS') {
    await poll(async () => (await api(statusURL, { headers })).data, d => d.lastAsyncUploadState, 'SUCCEEDED', 'IN_PROGRESS', sleep);
  } else if (upload.uploadState !== 'SUCCEEDED') throw new Error('Chrome upload failed.');
  if (upload.crxVersion && upload.crxVersion !== env.STORE_VERSION) throw new Error('Chrome returned a different package version.');
  if (env.MODE === 'upload') return 'Chrome: package uploaded to draft only; not submitted for review.';
  const result = (await api(`${CHROME}/v2/${name}:publish`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ publishType: 'DEFAULT_PUBLISH', skipReview: false, blockOnWarnings: true })
  })).data;
  if (!['PENDING_REVIEW', 'PUBLISHED', 'STAGED'].includes(result.state)) throw new Error('Chrome submission returned an unexpected state; check dashboard.');
  return 'Chrome: submission accepted. Approval and public availability must be checked in the dashboard.';
}
async function edge(env, zip, api, sleep) {
  const base = `${EDGE}/v1/products/${env.EDGE_PRODUCT_ID}/submissions`;
  const headers = { Authorization: 'ApiKey ' + env.EDGE_API_KEY, 'X-ClientID': env.EDGE_CLIENT_ID };
  const upload = await api(base + '/draft/package', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/zip' }, body: zip });
  if (upload.response.status !== 202) throw new Error('Unexpected Edge upload response.');
  const uploadURL = operationURL(upload.response.headers.get('Location'), base + '/draft/package');
  await poll(async () => (await api(uploadURL, { headers })).data, d => d.status, 'Succeeded', 'InProgress', sleep);
  if (env.MODE === 'upload') return 'Edge: package uploaded to draft only; not submitted for review.';
  const notes = fs.readFileSync(require('node:path').join(__dirname, 'store-certification-notes.txt'), 'utf8');
  const submitted = await api(base, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }) });
  if (submitted.response.status !== 202) throw new Error('Unexpected Edge submission response.');
  const submittedURL = operationURL(submitted.response.headers.get('Location'), base);
  await poll(async () => (await api(submittedURL, { headers })).data, d => d.status, 'Succeeded', 'InProgress', sleep);
  return 'Edge: submission created for certification. This does not mean review has passed.';
}
async function main(env = process.env) {
  config(env);
  if (!/^\d+\.\d+\.\d+$/.test(env.STORE_VERSION || '') || !/^[a-f0-9]{64}$/.test(env.STORE_SHA256 || '')) throw new Error('Missing verified release information.');
  const zip = fs.readFileSync(env.STORE_ZIP);
  if (crypto.createHash('sha256').update(zip).digest('hex') !== env.STORE_SHA256) throw new Error('ZIP changed after validation.');
  const message = await (env.STORE === 'chrome' ? chrome : edge)(env, zip, client(), ms => new Promise(resolve => setTimeout(resolve, ms)));
  console.log(message);
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, message + '\n');
}
module.exports = { config, client, poll, operationURL, chrome, edge };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
