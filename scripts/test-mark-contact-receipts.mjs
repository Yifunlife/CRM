import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {database,moduleURL} from './test-form-intake.mjs';
import ts from 'typescript';
const moduleUrl=(file,replacements={})=>{let source=readFileSync(file,'utf8');for(const [from,to] of Object.entries(replacements))source=source.replaceAll(from,to);return 'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');};
const errors='data:text/javascript,export class AllocationError extends Error {constructor(message,status=400){super(message);this.status=status;}}';
const envUrl='data:text/javascript,'+encodeURIComponent(`const objects=new Map();export const env={BUCKET:{async put(key,input){const bytes=new Uint8Array(await new Response(input).arrayBuffer());objects.set(key,bytes);return {size:bytes.length};},async get(key){const bytes=objects.get(key);return bytes?{size:bytes.length,body:bytes,json:async()=>JSON.parse(new TextDecoder().decode(bytes))}:null;},async delete(key){objects.delete(key);}}};`);
const storageUrl=moduleUrl('lib/object-storage.ts',{"'cloudflare:workers'":JSON.stringify(envUrl)});
const autoUrl=moduleUrl('lib/auto-first-contact.ts',{"'./crm'":JSON.stringify(moduleUrl('lib/crm.ts'))});
const codeUrl=moduleUrl('lib/customer-code.ts',{"'./allocation-server'":JSON.stringify(errors)});
const bridgeUrl=moduleUrl('lib/workbench-bridge.ts', {"'./customer-code'":JSON.stringify(codeUrl),"'./customer-profile'":JSON.stringify(moduleUrl('lib/customer-profile.ts')),"'./auto-first-contact'":JSON.stringify(autoUrl),"'./object-storage'":JSON.stringify(storageUrl),"'./crm'":JSON.stringify(moduleUrl('lib/crm.ts')),"'./allocation-server'":JSON.stringify(errors)});
const {bridgeDeviceEndpoint}=await import(bridgeUrl);

const {digest}=await import(moduleURL('lib/crm.ts'));
const sql=new DatabaseSync(':memory:');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
sql.exec("INSERT INTO crm_users(id,username,name,role,password,created) VALUES('s','yw001','Synthetic','sales','unused','2026-01-01');INSERT INTO crm_leads(id,name,source,owner_id,detail,fingerprint,created,email) VALUES('l','Synthetic','Meta','s','{}','fp','2026-01-01','synthetic@example.invalid');INSERT INTO crm_workbench_links(lead_id,owner_id,desktop_id,created,created_by) VALUES('l','s','crm-form-test','2026-01-01','s')");
sql.prepare('INSERT INTO crm_workbench_bridge(owner_id,token_hash,created_by) VALUES(?,?,?)').run('s',await digest('synthetic-token'),'s');
// Inline snapshots are isolated test-only data; no production API or mailbox is used.
sql.prepare('INSERT INTO crm_workbench_snapshots(owner_id,payload,updated,updated_by) VALUES(?,?,?,?)').run('s',JSON.stringify({clients:[{id:'crm-form-test'}]}),'2026-01-01','s');
const db=database(sql),r={requestId:'fixture-1',clientId:'crm-form-test',channel:'email',recipient:'synthetic@example.invalid',status:'sent',confirmedAt:'2026-10-20T10:00:00Z',confirmation:'Synthetic confirmed recipient/body/signature/PDF'};
const call=rows=>bridgeDeviceEndpoint(db,new Request('https://example.invalid/api/bridge/poll',{headers:{authorization:'Bearer synthetic-token'}}),{contact_receipts:rows});
assert.deepEqual((await call([r])).confirmed,['fixture-1']);await call([r]);assert.equal(sql.prepare('SELECT COUNT(*) n FROM crm_notes').get().n,1);assert.equal(sql.prepare("SELECT status FROM crm_leads WHERE id='l'").get().status,'已联系待回复');
await assert.rejects(call([{...r,recipient:'other@example.invalid'}]));await assert.rejects(call([{...r,status:'uncertain'}]));await assert.rejects(call([{...r,clientId:'other'}]));console.log('PASS confirmed receipts deduplicate, update contact record, reject uncertain/wrong recipient/ownership; no sends');

const current=()=>JSON.parse(sql.prepare("SELECT detail FROM crm_leads WHERE id='l'").get().detail);
const snapshot={id:'crm-form-test',name:'Synthetic',country:'',whatsapp:'',email:'synthetic@example.invalid',grade:'',nextContact:'',project:'',stage:1,projectStatus:'',source:'Meta',customerType:'',nextAction:'',followStatus:'',closeDate:'',amount:'',lostReason:'',notes:'',messages:[]};
const sync=async(client,base)=>bridgeDeviceEndpoint(db,new Request('https://example.invalid/api/bridge/poll',{headers:{authorization:'Bearer synthetic-token'}}),{sync:{clients:[client],bindings:base?[{desktop_id:client.id,lead_id:'l',base}]:[],new_clients:[],scenes:[],full_history:true}});
const first=await sync(snapshot);const base=first.updates[0].values;
const edited={...snapshot,...base,project:'Fixture project',customerType:'商户',notes:'Fixture note'};
const result=await sync(edited,base);assert.equal(current()._customer_profile.project,'Fixture project');assert.equal(current()._customer_profile.customerType,'商户');assert.equal(result.updates[0].values.notes,'Fixture note');
const changed={...current(),_customer_profile:{...current()._customer_profile,project:'Cloud concurrent'}};sql.prepare("UPDATE crm_leads SET detail=? WHERE id='l'").run(JSON.stringify(changed));
const conflict=await sync({...edited,project:'Local concurrent'},result.updates[0].values);assert(conflict.conflicts.some(c=>c.field==='project'));assert.equal(current()._customer_profile.project,'Cloud concurrent');console.log('PASS full profile two-way agreed-base, preserved concurrent values');
const {ensureCustomerCode}=await import(codeUrl);
const code1=await ensureCustomerCode(db,{...sql.prepare("SELECT * FROM crm_leads WHERE id='l'").get(),country:'AU'});assert.match(code1,/^[A-Z]{2}\d{8}(?:-\d+)?$/);
assert.equal(await ensureCustomerCode(db,sql.prepare("SELECT * FROM crm_leads WHERE id='l'").get()),code1);
sql.exec("INSERT INTO crm_leads(id,name,source,owner_id,detail,fingerprint,created,country) VALUES('l2','Second','Meta','s','{}','fp2','2026-01-01','AU'),('l3','Old','Meta','s','{}','fp3','2026-01-01','AU')");
assert.equal(await ensureCustomerCode(db,sql.prepare("SELECT * FROM crm_leads WHERE id='l3'").get(),'AU20260101'),'AU20260101');
assert.equal(await ensureCustomerCode(db,sql.prepare("SELECT * FROM crm_leads WHERE id='l2'").get()),'AU20260101-2');console.log('PASS stable business codes, preserved existing code, unique same-day sequence');
