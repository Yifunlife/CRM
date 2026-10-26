import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync,unlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import assert from 'node:assert/strict';

// Production access is read-only. Restores and attachment exercises use new local directories only.
const [outputArg,sampleArg]=process.argv.slice(2);
if(!outputArg||!sampleArg)throw Error('Usage: node scripts/verify-full-restore.mjs NEW_OUTPUT_DIRECTORY REAL_SAMPLE_FILE');
const output=resolve(outputArg),sample=resolve(sampleArg);
assert(!existsSync(output),'Output must be a new directory');
assert(existsSync(sample),'Real sample file is required');
mkdirSync(output,{recursive:true,mode:0o700});
const sha=b=>createHash('sha256').update(b).digest('hex');
const canonical=rows=>JSON.stringify(rows.map(r=>Object.fromEntries(Object.entries(r).sort(([a],[b])=>a.localeCompare(b)))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
const save=(path,data)=>writeFileSync(path,JSON.stringify(data,null,2),{mode:0o600});
const config=JSON.parse(readFileSync('wrangler.json'));
assert.equal(config.name,'yifun-crm');
const auth=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','auth','token','--json'],{encoding:'utf8'});
if(auth.status)throw Error('Cloudflare authentication unavailable');
const {token}=JSON.parse(auth.stdout),base=`https://api.cloudflare.com/client/v4/accounts/${config.account_id}`;
async function request(path,sql){
 if(sql)assert.match(sql,/^SELECT\s/i);
 const r=await fetch(base+path,{method:sql?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(sql?{'Content-Type':'application/json'}:{})},...(sql?{body:JSON.stringify({sql})}:{})});
 if(!r.ok)throw Error('Read-only Cloudflare request failed: '+r.status);
 return r;
}
async function query(sql){const d=await(await request(`/d1/database/${config.d1_databases[0].database_id}/query`,sql)).json();assert(d.success&&d.result.every(r=>r.success));return d.result[0].results;}
async function capture(){
 const schema=await query("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND (name LIKE 'crm_%' OR tbl_name LIKE 'crm_%') ORDER BY type,name");
 const data={};
 for(const {name}of schema.filter(x=>x.type==='table')){assert.match(name,/^crm_[a-z_]+$/);data[name]=[];for(let offset=0;;offset+=100){const rows=await query(`SELECT * FROM ${name} ORDER BY rowid LIMIT 100 OFFSET ${offset}`);data[name].push(...rows);if(rows.length<100)break;}}
 return {schema,data};
}
const bucketPath=`/r2/buckets/${config.r2_buckets[0].bucket_name}/objects`;
async function inventory(){const d=await(await request(bucketPath+'?per_page=1000')).json();assert(d.success&&Array.isArray(d.result));assert(d.result.length<1000,'Inventory requires pagination; refusing an incomplete backup');assert(!d.result_info?.cursor&&!d.result_info?.is_truncated,'Inventory is truncated');return d.result;}
const before=await capture(),objectsBefore=await inventory();
save(join(output,'database.json'),before);mkdirSync(join(output,'objects'),{mode:0o700});
const objects=[];
for(const object of objectsBefore){const bytes=Buffer.from(await(await request(bucketPath+'/'+object.key.split('/').map(encodeURIComponent).join('/'))).arrayBuffer());assert.equal(bytes.length,object.size);const hash=sha(bytes);writeFileSync(join(output,'objects',hash),bytes,{mode:0o600});objects.push({...object,sha256:hash});}
const refs=[];
for(const [table,rows]of Object.entries(before.data))for(const row of rows){if(row.object_key)refs.push({table,id:row.id,key:row.object_key,size:row.size});for(const [field,value]of Object.entries(row)){if(typeof value!=='string'||!value.startsWith('{'))continue;let parsed;try{parsed=JSON.parse(value);}catch{continue;}if(parsed?.$r2)refs.push({table,id:row.id,field,key:parsed.$r2});}}
for(const ref of refs){const object=objects.find(o=>o.key===ref.key);assert(object,'Missing referenced object: '+ref.table);if(ref.size!==undefined)assert.equal(ref.size,object.size);if(ref.field)JSON.parse(readFileSync(join(output,'objects',object.sha256),'utf8'));}
const manifest={created:new Date().toISOString(),database_sha256:sha(readFileSync(join(output,'database.json'))),objects,refs};save(join(output,'manifest.json'),manifest);
function restore(packageDir,target){
 assert(!existsSync(target),'Restore target must not exist');
 const m=JSON.parse(readFileSync(join(packageDir,'manifest.json'))),databaseBytes=readFileSync(join(packageDir,'database.json'));assert.equal(sha(databaseBytes),m.database_sha256,'Database checksum mismatch');
 for(const o of m.objects){const b=readFileSync(join(packageDir,'objects',o.sha256));assert.equal(sha(b),o.sha256,'Object checksum mismatch');assert.equal(b.length,o.size);}
 mkdirSync(target,{recursive:true,mode:0o700});mkdirSync(join(target,'objects'),{mode:0o700});
 for(const o of m.objects)copyFileSync(join(packageDir,'objects',o.sha256),join(target,'objects',o.sha256));
 save(join(target,'manifest.json'),m);
 const source=JSON.parse(databaseBytes),db=new DatabaseSync(join(target,'database.sqlite'));
 // Install triggers after data to avoid replaying business side effects while restoring.
 db.exec('PRAGMA foreign_keys=OFF; BEGIN');
 try{for(const s of source.schema.filter(s=>s.type==='table'))db.exec(s.sql);for(const [table,rows]of Object.entries(source.data))for(const row of rows){const keys=Object.keys(row);db.prepare(`INSERT INTO "${table}" (${keys.map(k=>'"'+k+'"').join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>row[k]));}for(const s of source.schema.filter(s=>s.type!=='table'))db.exec(s.sql);db.exec('COMMIT; PRAGMA foreign_keys=ON');}catch(e){db.exec('ROLLBACK');db.close();throw e;}
 for(const [table,rows]of Object.entries(source.data))assert.equal(canonical(db.prepare('SELECT * FROM "'+table+'"').all()),canonical(rows),table+' restored fields');
 assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 return {db,manifest:m,directory:target};
}
function adapter(db){class Statement{constructor(sql,args=[]){this.sql=sql;this.args=args;}bind(...args){return new Statement(this.sql,args);}async first(){return db.prepare(this.sql).get(...this.args)||null;}async all(){return {results:db.prepare(this.sql).all(...this.args)};}async run(){return {meta:db.prepare(this.sql).run(...this.args)};}}return {prepare:sql=>new Statement(sql),async batch(statements){db.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}};}
function localBucket(restored){return {async get(key){const o=restored.manifest.objects.find(o=>o.key===key);if(!o)return null;const file=join(restored.directory,'objects',o.sha256);if(!existsSync(file))return null;const b=readFileSync(file);return {body:b,size:b.length,json:async()=>JSON.parse(b)};},async put(key,body){const b=Buffer.from(await new Response(body).arrayBuffer()),hash=sha(b);writeFileSync(join(restored.directory,'objects',hash),b,{mode:0o600});restored.manifest.objects.push({key,size:b.length,sha256:hash});return {size:b.length};},async delete(key){restored.manifest.objects=restored.manifest.objects.filter(o=>o.key!==key);}};}
await build({stdin:{contents:"export {databaseBackup,backupTables} from './lib/database-backup'; export {customerFiles} from './lib/customer-files'; export {followupFiles} from './lib/order-followup-files';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:join(output,'restore-handlers.mjs'),plugins:[{name:'isolated-storage',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'restore'}));b.onLoad({filter:/.*/,namespace:'restore'},()=>({contents:'export const env=globalThis.__crmRestoreEnvironment;'}));}}],logLevel:'silent'});
const restored=restore(output,join(output,'restored-production'));
globalThis.__crmRestoreEnvironment={BUCKET:localBucket(restored)};
const handlers=await import('file://'+join(output,'restore-handlers.mjs'));
const exported=(await handlers.databaseBackup(adapter(restored.db)).text()).trim().split('\n').map(JSON.parse);
assert(exported.at(-1).complete);for(const t of handlers.backupTables)assert.equal(exported.at(-1).counts[t],before.data[t].length);
for(const e of exported.filter(e=>e.table)){const original=before.data[e.table].find(r=>r.id? r.id===e.row.id:r.owner_id===e.row.owner_id);if(['crm_workbench_snapshots','crm_workbench_commands'].includes(e.table)){const f=e.table==='crm_workbench_snapshots'?'payload':'result';assert(!JSON.parse(e.row[f])?.$r2,'App export must hydrate large JSON');}assert(original);}
writeFileSync(join(output,'application-backup.ndjson'),exported.map(e=>JSON.stringify(e)).join('\n')+'\n',{mode:0o600});
restored.db.close();
// A separate fixture database uses the user's real workbook as attachment bytes, never production writes.
const fixture=restore(output,join(output,'attachment-source')),db=fixture.db,local=adapter(db);
globalThis.__crmRestoreEnvironment.BUCKET=localBucket(fixture);
const users=[{id:'restore-admin',role:'admin'},{id:'restore-sales',role:'sales'},{id:'restore-other',role:'sales'}];
for(const u of users)db.prepare('INSERT INTO crm_users(id,username,name,role,password,created) VALUES(?,?,?,?,?,?)').run(u.id,u.id,'隔离恢复验证',u.role,'not-a-login-password','2026-10-23');
db.prepare("INSERT INTO crm_leads(id,name,source,owner_id,detail,fingerprint,created) VALUES('restore-lead','隔离恢复样本','Meta','restore-sales','{}','restore-fingerprint','2026-10-23')").run();
db.prepare('INSERT INTO crm_workbench_snapshots(owner_id,payload,updated,updated_by) VALUES(?,?,?,?)').run('restore-sales',JSON.stringify({clients:[{id:'restore-desktop'}]}),'2026-10-23','restore-sales');
db.prepare("INSERT INTO crm_followup_orders(id,order_number,project,lead_id,commercial_id,logistics_id,details,steps,change_token,created,updated,created_by,updated_by) VALUES('restore-order','RESTORE-ONLY','隔离恢复样本','restore-lead','restore-sales','restore-admin','{}','[]','restore-token','2026-10-23','2026-10-23','restore-admin','restore-admin')").run();
const bytes=readFileSync(sample),sampleHash=sha(bytes),name='真实客资核查清单.xlsx';
const upload=(url)=>new Request(url,{method:'PUT',headers:{'Content-Length':String(bytes.length)},body:bytes});
const cf=await(await handlers.customerFiles(upload('http://restore.test/api/workbench/files?desktop_id=restore-desktop&name='+encodeURIComponent(name)),local,users[1],users[1])).json();
const of=await(await handlers.followupFiles(upload('http://restore.test/api/followup/files?order_id=restore-order&step=0&version=1&name='+encodeURIComponent(name)),local,users[0],users[0])).json();
const sampleDir=join(output,'attachment-package');mkdirSync(sampleDir,{mode:0o700});mkdirSync(join(sampleDir,'objects'),{mode:0o700});
const sampleData={schema:before.schema,data:Object.fromEntries(Object.keys(before.data).map(t=>[t,db.prepare('SELECT * FROM '+t).all()]))};save(join(sampleDir,'database.json'),sampleData);
for(const o of fixture.manifest.objects)copyFileSync(join(fixture.directory,'objects',o.sha256),join(sampleDir,'objects',o.sha256));
fixture.manifest.database_sha256=sha(readFileSync(join(sampleDir,'database.json')));save(join(sampleDir,'manifest.json'),fixture.manifest);db.close();
const sampleRestored=restore(sampleDir,join(output,'attachment-restored'));globalThis.__crmRestoreEnvironment.BUCKET=localBucket(sampleRestored);const sampleDb=adapter(sampleRestored.db);
for(const [fn,url]of [[handlers.customerFiles,'http://restore.test/api/workbench/files/'+cf.id],[handlers.followupFiles,'http://restore.test/api/followup/files/'+of.id]]){const r=await fn(new Request(url),sampleDb,users[1],users[1]);assert.equal(sha(Buffer.from(await r.arrayBuffer())),sampleHash);await assert.rejects(fn(new Request(url),sampleDb,users[2],users[2]),e=>e.status===404);}
sampleRestored.db.close();
const corruptObject=join(sampleDir,'objects',sampleHash);writeFileSync(corruptObject,'corrupt',{mode:0o600});assert.throws(()=>restore(sampleDir,join(output,'must-not-restore-corrupt')),/checksum/);unlinkSync(corruptObject);assert.throws(()=>restore(sampleDir,join(output,'must-not-restore-missing')),/ENOENT/);writeFileSync(corruptObject,bytes,{mode:0o600});
const after=await capture(),objectsAfter=await inventory();
assert.equal(canonical(after.schema),canonical(before.schema),'Production schema changed during verification');
const differences=Object.keys(before.data).filter(t=>canonical(before.data[t])!==canonical(after.data[t]));
save(join(output,'after-hashes.json'),Object.fromEntries(Object.entries(after.data).map(([t,r])=>[t,{count:r.length,sha256:sha(canonical(r))}])));
assert.deepEqual(differences,[],'Production data changed during verification');assert.equal(canonical(objectsAfter),canonical(objectsBefore),'Production object inventory changed');
for(const o of objects){const b=Buffer.from(await(await request(bucketPath+'/'+o.key.split('/').map(encodeURIComponent).join('/'))).arrayBuffer());assert.equal(sha(b),o.sha256,'Production object bytes changed');}
const report={verified_at:new Date().toISOString(),database_tables:Object.keys(before.data).length,leads:before.data.crm_leads.length,users:before.data.crm_users.length,all_database_fields_restored:true,foreign_keys:'ok',quick_check:'ok',production_objects:objects.length,production_object_bytes:objects.reduce((n,o)=>n+o.size,0),referenced_objects:[...new Set(refs.map(r=>r.key))].length,production_customer_attachments:before.data.crm_files.length,production_order_attachments:before.data.crm_followup_files.length,production_business_attachments:'none present; cannot verify recovery of historical business attachments',application_backup_hydration:'passed',real_sample:{file:sample,bytes:bytes.length,sha256:sampleHash,customer_upload_restore_download:'passed',order_upload_restore_download:'passed',cross_owner_denial:'passed',corrupt_archive_rejected:true,missing_object_rejected:true},production_table_differences:differences,production_object_bytes_unchanged:true,production_writes:0,runtime:'local SQLite and filesystem object store; real application attachment handlers',credential_boundary:'Database credentials are in protected backup. External Worker secrets are not exported. Restored databases are offline and never polled by desktop clients.'};
save(join(output,'verification.json'),report);console.log(JSON.stringify(report,null,2));
