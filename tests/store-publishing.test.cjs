const test = require('node:test');
const assert = require('node:assert/strict');
const { config, client, poll, operationURL, chrome, edge } = require('../scripts/publish-stores.cjs');
const baseEnv = { STORE:'chrome', MODE:'publish', STORE_VERSION:'0.18.0', CWS_PUBLISHER_ID:'publisher', CWS_EXTENSION_ID:'a'.repeat(32), CWS_CLIENT_ID:'test-client', CWS_CLIENT_SECRET:'test-secret', CWS_REFRESH_TOKEN:'test-refresh', EDGE_PRODUCT_ID:'00000000-0000-0000-0000-000000000000', EDGE_CLIENT_ID:'test-client', EDGE_API_KEY:'test-key' };
const noWait = async () => {};
const reply = (data, status=200, location='') => ({ data, response:{status,headers:new Headers(location ? {Location:location} : {})} });
test('publisher requires secrets and validates identifiers without exposing values', () => {
  assert.throws(()=>config({STORE:'chrome',MODE:'publish'}), /Missing GitHub Secrets/);
  assert.equal(config(baseEnv),baseEnv);
  assert.throws(()=>config({...baseEnv,STORE:'edge',EDGE_PRODUCT_ID:'not-a-guid'}),/Partner Center GUID/);
  assert.throws(()=>config({...baseEnv,CWS_PUBLISHER_ID:'../../bad'}),/Invalid Chrome/);
});
test('Edge operation polling never forwards secrets to unexpected hosts or paths', () => {
  const base='https://api.addons.microsoftedge.microsoft.com/v1/products/id/submissions';
  assert.equal(operationURL('abc-123',base),base+'/operations/abc-123');
  assert.equal(operationURL('/v1/products/id/submissions/operations/abc',base),base+'/operations/abc');
  for(const bad of ['https://evil.test/abc',base+'/operations/abc?token=x',base+'/operations/../secret','']) assert.throws(()=>operationURL(bad,base));
});
test('HTTP failures redact raw store responses and do not retry mutations', async () => {
  let count=0;
  const api=client(async(url,options)=>{count++;assert.equal(options.redirect,'error');return new Response('private-data',{status:401})});
  await assert.rejects(api('https://example.test',{method:'POST'}),e=>!e.message.includes('private-data')&&e.message.includes('401'));
  assert.equal(count,1);
});
test('polling succeeds, fails closed on unknown state and has a finite timeout',async()=>{
  let count=0;
  await poll(async()=>({state:++count===2?'done':'wait'}),d=>d.state,'done','wait',noWait);
  assert.equal(count,2);
  await assert.rejects(poll(async()=>({state:'failed'}),d=>d.state,'done','wait',noWait),/failed/);
  await assert.rejects(poll(async()=>({state:'wait'}),d=>d.state,'done','wait',noWait),/pending/);
});
test('Chrome v2 async upload completes before publish and review is not bypassed',async()=>{
  const requests=[];let statuses=0;
  const api=async(url,opts)=>{
    requests.push(url);
    if(url.includes('oauth2'))return reply({access_token:'test-token'});
    if(url.endsWith(':fetchStatus'))return reply(++statuses===1?{}:{lastAsyncUploadState:'SUCCEEDED'});
    if(url.endsWith(':upload'))return reply({uploadState:'IN_PROGRESS'});
    assert.deepEqual(JSON.parse(opts.body),{publishType:'DEFAULT_PUBLISH',skipReview:false,blockOnWarnings:true});
    return reply({state:'PENDING_REVIEW'});
  };
  assert.match(await chrome(baseEnv,Buffer.from('zip'),api,noWait),/accepted/);
  assert.equal(requests.length,5);
  assert.ok(requests[2].includes('/upload/v2/'));
});
test('Chrome upload-only never submits and failed upload blocks publication',async()=>{
  for(const uploadState of ['SUCCEEDED','FAILED']){
    const calls=[];
    const api=async url=>{calls.push(url);return reply(url.includes('oauth2')?{access_token:'t'}:url.endsWith(':upload')?{uploadState,crxVersion:'0.18.0'}:{})};
    const run=chrome({...baseEnv,MODE:'upload'},Buffer.from('zip'),api,noWait);
    if(uploadState==='FAILED')await assert.rejects(run,/upload failed/);else assert.match(await run,/draft only/);
    assert.equal(calls.some(url=>url.endsWith(':publish')),false);
  }
});
test('Chrome existing revision does not get resubmitted',async()=>{
  let calls=0;
  const api=async()=>reply(++calls===1?{access_token:'t'}:{publishedItemRevisionStatus:{distributionChannels:[{crxVersion:'0.18.0'}]}});
  assert.match(await chrome(baseEnv,Buffer.from('zip'),api,noWait),/skipped/);
  assert.equal(calls,2);
});
test('Edge API key upload and certification are separate asynchronous operations',async()=>{
  const calls=[];
  const api=async(url,options)=>{
    calls.push({url,options});assert.equal(options.headers.Authorization,'ApiKey test-key');
    assert.equal(options.headers['X-ClientID'],'test-client');
    return options.method==='POST'?reply({},202,'operation-1'):reply({status:'Succeeded'});
  };
  assert.match(await edge(baseEnv,Buffer.from('zip'),api,noWait),/certification/);
  assert.equal(calls.length,4);assert.ok(JSON.parse(calls[2].options.body).notes.includes('Bilibili login'));
});
test('Edge upload-only and failed upload do not submit review',async()=>{
  for(const status of ['Succeeded','Failed']){
    let calls=0;
    const api=async()=>++calls===1?reply({},202,'op'):reply({status});
    const run=edge({...baseEnv,MODE:'upload'},Buffer.from('zip'),api,noWait);
    if(status==='Failed')await assert.rejects(run,/failed/);else assert.match(await run,/draft only/);
    assert.equal(calls,2);
  }
});
