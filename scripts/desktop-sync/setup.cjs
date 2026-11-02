process.noAsar=true;
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),crypto=require('node:crypto');
const asar=require('@electron/asar'),{patchMain,patchManagement,patchBridge,patchRenderer}=require('./patch-app.cjs');
const run=(bin,args)=>cp.execFileSync(bin,args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const dialog=script=>run('/usr/bin/osascript',['-e',script]).trim();
const digest=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
function header(file){const fd=fs.openSync(file,'r'),pre=Buffer.alloc(16);fs.readSync(fd,pre,0,16,0);const bytes=Buffer.alloc(pre.readUInt32LE(12));fs.readSync(fd,bytes,0,bytes.length,16);fs.closeSync(fd);return {tree:JSON.parse(bytes),hash:digest(bytes)};}
function entries(tree,base=''){return Object.entries(tree.files||{}).flatMap(([name,value])=>value.files?entries(value,base+name+'/'):[{name:base+name,...value}]);}
function closed(app){const found=cp.spawnSync('/usr/bin/pgrep',['-f',app+'/Contents/MacOS/'],{encoding:'utf8'});if(found.status!==1&&found.stdout.trim().split(/\s+/).some(pid=>Number(pid)!==process.pid))throw Error('请保存资料并完全退出亦玩销售工作台，再重新双击安装。');}
async function prepare(app,output){
 const archive=app+'/Contents/Resources/app.asar',before=header(archive),info=app+'/Contents/Info.plist';
 const signature=cp.spawnSync('/usr/bin/codesign',['-dv','--verbose=4',app],{encoding:'utf8'});
 if(signature.status||!signature.stderr.includes('Signature=adhoc'))throw Error('此安装包仅支持现有公司临时签名版本；当前版本需另行提供对应正式更新，未修改应用。');
 run('/usr/bin/codesign',['--verify','--deep','--strict',app]);
 const stored=run('/usr/libexec/PlistBuddy',['-c','Print :ElectronAsarIntegrity:Resources/app.asar:hash',info]).trim();if(stored!==before.hash)throw Error('原应用完整性检查未通过，未修改');
 const folder=path.join(output,'source'),candidate=path.join(output,'亦玩销售工作台.app');
 asar.extractAll(archive,folder);run('/usr/bin/ditto',[app,candidate]);
 for(const [name,patch] of [['main.js',patchMain],['crm-client-management.js',patchManagement],['crm-bridge.js',patchBridge],['renderer/renderer.js',patchRenderer]]){const file=path.join(folder,name);fs.writeFileSync(file,patch(fs.readFileSync(file,'utf8')));}
 fs.copyFileSync(path.join(__dirname,'crm-account-sync.cjs'),path.join(folder,'crm-account-sync.js'));
 fs.copyFileSync(path.join(__dirname,'crm-history-sync.cjs'),path.join(folder,'crm-history-sync.cjs'));
 for(const name of ['main.js','crm-client-management.js','crm-bridge.js','crm-account-sync.js','crm-history-sync.cjs','renderer/renderer.js']){const script=fs.readFileSync(path.join(folder,name),'utf8');new (require('node:vm').Script)(script,{filename:name});}
 const files=entries(before.tree),unpacked=files.filter(f=>f.unpacked).map(f=>path.join(folder,f.name));
 await asar.createPackageWithOptions(folder,candidate+'/Contents/Resources/app.asar',unpacked.length?{unpack:unpacked.length===1?unpacked[0]:'{'+unpacked.join(',')+'}'}:{});
 const next=candidate+'/Contents/Resources/app.asar',after=header(next),allowed=['main.js','crm-client-management.js','crm-bridge.js','crm-account-sync.js','crm-history-sync.cjs','renderer/renderer.js'];
 for(const file of files){if(file.link)continue;const original=asar.extractFile(archive,file.name),updated=asar.extractFile(next,file.name);if(!allowed.includes(file.name)&&digest(original)!==digest(updated))throw Error('无关应用文件发生变化，未安装：'+file.name);}
 for(const file of entries(after.tree)){if(!files.some(f=>f.name===file.name)&&!['crm-account-sync.js','crm-history-sync.cjs','renderer/renderer.js'].includes(file.name))throw Error('更新包含未知文件，未安装');}
 run('/usr/libexec/PlistBuddy',['-c','Set :ElectronAsarIntegrity:Resources/app.asar:hash '+after.hash,candidate+'/Contents/Info.plist']);
 const ent=run('/usr/bin/codesign',['-d','--entitlements',':-',app]);if(!ent.includes('<plist'))throw Error('无法核对原应用权限，未安装');
 const entitlement=path.join(output,'entitlements.plist');fs.writeFileSync(entitlement,ent);
 run('/usr/bin/codesign',['--force','--sign','-','--options','runtime','--entitlements',entitlement,candidate]);run('/usr/bin/codesign',['--verify','--deep','--strict',candidate]);
 return {candidate,verifiedFiles:files.length,changedSource:allowed,originalHash:before.hash,updatedHash:after.hash};
}
async function install(){
 const test=process.argv.indexOf('--verify-app');
 if(test>=0){const output=fs.mkdtempSync(path.join(os.tmpdir(),'yifun-crm-verify-'));console.log(JSON.stringify(await prepare(process.argv[test+1],output)));return;}
 const config=JSON.parse(fs.readFileSync(path.join(__dirname,'account.json'),'utf8'));
 if(!/^[a-f0-9-]{36}$/.test(config.owner_id||'')||typeof config.username!=='string'||!config.username||!/^https:\/\//.test(config.origin||'')||!(/^[a-f0-9]{96}$/.test(config.token||'')||/^[a-f0-9-]{64,80}$/.test(config.token||'')))throw Error('连接包账号核对失败，请从本人CRM账号重新下载');
 dialog('display dialog '+JSON.stringify('连接当前CRM账号：'+config.name+' / '+config.username+'。请先保存并退出原工作台，仅在本人Mac使用。')+' buttons {"取消", "继续安装"} default button "继续安装" cancel button "取消"');
 const app='/Applications/亦玩销售工作台.app';closed(app);
 const dir=path.join(os.homedir(),'Library','Application Support','亦玩销售工作台'),configFile=path.join(dir,'crm-bridge.json'),settingsFile=path.join(dir,'settings.json');
 const settings=fs.existsSync(settingsFile)?JSON.parse(fs.readFileSync(settingsFile,'utf8')):{};
 const existing=settings.workspace||path.join(os.homedir(),'Documents','Yifun Sales Workbench V1'),start=fs.existsSync(existing)?existing:path.join(os.homedir(),'Documents');
 const workspace=dialog('POSIX path of (choose folder with prompt "选择原来的工作台资料文件夹；不要新建文件夹" default location POSIX file '+JSON.stringify(start)+')').replace(/\/$/,'');
 const crm=path.join(workspace,'.workbench','crm.json');if(!fs.existsSync(path.join(workspace,'knowledge','04_客户聊天'))||!fs.existsSync(crm))throw Error('所选文件夹没有现有客户资料；未建立空工作区，也未修改应用');
 const original=fs.readFileSync(crm),data=JSON.parse(original);if(!Array.isArray(data.clients))throw Error('客户资料格式不符合原工作台');
 const labels=[...new Set(data.clients.filter(c=>!c.deleted&&!c.group).map(c=>String(c.owner||'')))];if(labels.some(x=>!x))throw Error('原资料的客户归属不完整，需先核对');
 let localOwner=labels[0]||config.name||config.username;if(labels.length>1){const list=labels.map(x=>JSON.stringify(x)).join(',');localOwner=dialog('set picked to choose from list {'+list+'} with prompt "选择此资料库里属于本人的原有负责人标签（保持原标签，不改客户归属）"\nif picked is false then error number -128\nreturn item 1 of picked');}
 const old=fs.existsSync(configFile)?JSON.parse(fs.readFileSync(configFile,'utf8')):{};if(old.owner_id&&old.owner_id!==config.owner_id)throw Error('此Mac已绑定另一CRM账号，未覆盖原连接');if(old.token&&old.token!==config.token&&!(old.owner_id===config.owner_id&&config.replace_existing===true))throw Error('此Mac已有连接，请先在本人CRM核对并更换配置');
 const journalFile=path.join(workspace,'.workbench','crm-account-sync.json');if(fs.existsSync(journalFile)&&JSON.parse(fs.readFileSync(journalFile,'utf8')).owner_id!==config.owner_id)throw Error('工作区已绑定其他CRM账号，未修改');
 const before=fs.mkdtempSync(path.join(os.homedir(),'Documents','CRM工作台连接备份-')),output=fs.mkdtempSync(path.join(path.dirname(app),'.crm-connector-update-'));
 fs.writeFileSync(path.join(before,'crm.json'),original,{mode:0o600});if(fs.existsSync(configFile))fs.copyFileSync(configFile,path.join(before,'crm-bridge.json'));if(fs.existsSync(settingsFile))fs.copyFileSync(settingsFile,path.join(before,'settings.json'));
 const result=await prepare(app,output);closed(app);
 if(digest(fs.readFileSync(crm))!==digest(original))throw Error('安装期间客户资料发生变化，未覆盖应用，请重新安装');
 const backup=path.join(before,'previous-installed.app');fs.renameSync(app,backup);
 try{fs.renameSync(result.candidate,app);run('/usr/bin/codesign',['--verify','--deep','--strict',app]);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(configFile,JSON.stringify({...config,enabled:true,accountSync:true,fullHistory:true,historyOnly:old.owner_id===config.owner_id&&old.historyOnly===true,pullOnly:old.owner_id===config.owner_id&&old.pullOnly===true,uploadNewLeads:old.owner_id===config.owner_id&&old.uploadNewLeads===true,workspace,localOwner},null,2),{mode:0o600});fs.chmodSync(configFile,0o600);fs.writeFileSync(settingsFile,JSON.stringify({...settings,workspace},null,2),{mode:0o600});}catch(e){if(fs.existsSync(app))fs.renameSync(app,path.join(output,'failed.app'));fs.renameSync(backup,app);if(fs.existsSync(path.join(before,'crm-bridge.json')))fs.copyFileSync(path.join(before,'crm-bridge.json'),configFile);else if(fs.existsSync(configFile))fs.unlinkSync(configFile);if(fs.existsSync(path.join(before,'settings.json')))fs.copyFileSync(path.join(before,'settings.json'),settingsFile);else if(fs.existsSync(settingsFile))fs.unlinkSync(settingsFile);throw e;}
 fs.writeFileSync(path.join(before,'verification.json'),JSON.stringify({...result,workspace,owner_id:config.owner_id,customerFileUnchanged:digest(fs.readFileSync(crm))===digest(original)},null,2),{mode:0o600});
 run('/usr/bin/open',[app]);
 dialog('display dialog "安装完成。请保持工作台打开和联网，在CRM切换到我的业务 → 客户沟通。首次全文导入按记录量分批进行，可在客户档案查看同步进度；未完成前请保持工作台运行。两端同时修改的字段会保留并提示核对。旧应用和资料已备份到 Documents。" buttons {"完成"} default button "完成"');
 console.log('本人工作台连接已安装。备份：'+before);
}
install().catch(error=>{console.error(error.message);process.exitCode=1;});
