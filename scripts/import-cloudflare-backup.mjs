import {createReadStream,readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';

// Run only against the dedicated CRM resources in wrangler.json. No secrets are logged.
const [backup,reportDirectory]=process.argv.slice(2);
if(!backup||!reportDirectory)throw Error('Usage: node scripts/import-cloudflare-backup.mjs BACKUP.ndjson REPORT_DIRECTORY');
const config=JSON.parse(readFileSync('wrangler.json','utf8'));
assert.equal(config.name,'yifun-crm');
const auth=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','auth','token','--json'],{encoding:'utf8'});
if(auth.status!==0)throw Error('Cloudflare authentication failed');
const {token}=JSON.parse(auth.stdout);
const base=`https://api.cloudflare.com/client/v4/accounts/${config.account_id}`;
const dbId=config.d1_databases[0].database_id,bucket=config.r2_buckets[0].bucket_name;
async function request(path,options={}){
 const response=await fetch(base+path,{...options,headers:{Authorization:`Bearer ${token}`,...options.headers}});
 if(!response.ok)throw Error(`Cloudflare request failed: ${response.status} ${path.split('/').slice(0,3).join('/')}`);
 return response;
}
async function query(sql){
 const response=await request(`/d1/database/${dbId}/query`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sql})});
 const data=await response.json();
 if(!data.success||data.result.some(r=>!r.success))throw Error('D1 query failed: '+JSON.stringify(data.errors||[]));
 return data.result;
}
const source=new DatabaseSync(':memory:');
for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())source.exec(readFileSync('drizzle/'+f,'utf8'));
const counts={},large=[],states={};let footer,header;
for await(const line of createInterface({input:createReadStream(backup),crlfDelay:Infinity})){
 const entry=JSON.parse(line);
 if(entry.format){header=entry;continue;}
 if(entry.complete){footer=entry;continue;}
 const {table,row}=entry;
 assert.match(table,/^crm_[a-z_]+$/);
 assert.ok(source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table));
 if(table==='crm_google_connection'&&(row.client_secret||row.refresh_token))throw Error('Migrate GOOGLE_TOKEN_KEY before importing encrypted Google credentials');
 if(table==='crm_files'||table==='crm_followup_files')throw Error('Existing cloud attachments require a separate object copy before import');
 if(table==='crm_workbench_commands'&&['queued','running'].includes(row.state)){
  states[row.id]=row.state;
  row.state=row.state==='queued'?'cancelled':'uncertain';
 }
 for(const field of table==='crm_workbench_snapshots'?['payload']:table==='crm_workbench_commands'?['result']:[]){
  const text=row[field];JSON.parse(text);
  if(table==='crm_workbench_snapshots'||Buffer.byteLength(text)>16384){
   const sha=createHash('sha256').update(text).digest('hex');
   const key=`records/migration-20261021/${sha}.json`;
   large.push({key,text,sha});row[field]=JSON.stringify({$r2:key});
  }
 }
 const keys=Object.keys(row);
 source.prepare(`INSERT INTO ${table} (${keys.map(k=>'"'+k+'"').join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>row[k]));
 counts[table]=(counts[table]||0)+1;
}
assert.equal(header?.format,'yifun-crm-backup-v1');assert.equal(footer?.complete,true);
for(const [table,count]of Object.entries(footer.counts))assert.equal(counts[table]||0,count,table);
assert.equal(source.prepare('PRAGMA foreign_key_check').all().length,0);
assert.equal(source.prepare('PRAGMA quick_check').get().quick_check,'ok');
const objects=[...new Map(large.map(x=>[x.key,x])).values()];
console.log(JSON.stringify({stage:'validated',counts,largeFields:large.length,uniqueObjects:objects.length,bytes:objects.reduce((n,x)=>n+Buffer.byteLength(x.text),0)}));
let completed=0;
// Upload and byte-verify objects before any database references are written.
for(let start=0;start<objects.length;start+=4){
 await Promise.all(objects.slice(start,start+4).map(async object=>{
  const path=`/r2/buckets/${bucket}/objects/${object.key}`;
  await request(path,{method:'PUT',headers:{'Content-Type':'application/json'},body:object.text});
  const read=await request(path);
  assert.equal(createHash('sha256').update(Buffer.from(await read.arrayBuffer())).digest('hex'),object.sha);
  completed++;
 }));
 if(completed%20===0||completed===objects.length)console.log(JSON.stringify({stage:'objects-verified',completed,total:objects.length}));
}
const literal=value=>value===null?'NULL':typeof value==='number'?String(value):"'"+String(value).replaceAll("'","''")+"'";
for(const table of Object.keys(footer.counts)){
 let sql='',inserted=0;
 const flush=async()=>{if(sql){await query(sql);sql='';}};
 for(const row of source.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()){
  const keys=Object.keys(row),statement=`INSERT INTO ${table} (${keys.map(k=>'"'+k+'"').join(',')}) VALUES (${keys.map(k=>literal(row[k])).join(',')}) ON CONFLICT DO NOTHING;\n`;
  if(Buffer.byteLength(sql)+Buffer.byteLength(statement)>60000)await flush();
  sql+=statement;inserted++;
 }
 await flush();
 console.log(JSON.stringify({stage:'table-imported',table,count:inserted}));
}
// Compare every field of every imported row with the validated source copy.
for(const table of Object.keys(footer.counts)){
 const expected=source.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
 const sort=rows=>rows.map(r=>JSON.stringify(Object.fromEntries(Object.entries(r).sort(([a],[b])=>a.localeCompare(b))))).sort();
 const actual=[];
 for(let offset=0;;offset+=100){
  const rows=(await query(`SELECT * FROM ${table} ORDER BY rowid LIMIT 100 OFFSET ${offset}`))[0].results;
  actual.push(...rows);if(rows.length<100)break;
 }
 assert.deepEqual(sort(actual),sort(expected),table);
}
assert.equal((await query('PRAGMA foreign_key_check'))[0].results.length,0);
const report={source:backup,verified:new Date().toISOString(),counts:footer.counts,objects:objects.map(({key,sha,text})=>({key,sha,bytes:Buffer.byteLength(text)})),sourceBytes:large.reduce((n,x)=>n+Buffer.byteLength(x.text),0),referenceBytes:large.length*160,stoppedCommands:states};
mkdirSync(reportDirectory,{recursive:true,mode:0o700});
writeFileSync(reportDirectory+'/migration-report.json',JSON.stringify(report,null,2),{mode:0o600});
console.log(JSON.stringify({stage:'complete',counts:footer.counts,objects:objects.length,allFieldsVerified:true,foreignKeysValid:true}));
