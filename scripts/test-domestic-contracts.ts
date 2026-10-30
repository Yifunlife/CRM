import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {unzipSync,strFromU8} from 'fflate';
import {generateDomesticContract,rmbUpper,contractFields} from '../lib/domestic-contracts';
import {contractTemplateFiles} from '../lib/contract-template-files';
import {contractTemplateEndpoint} from '../lib/contract-templates-server';
const values={contractNo:'内贸测试-20261030',signDate:'2026-10-30',projectName:'生成验证项目',projectAddress:'上海市测试场地',customerName:'测试客户<&>有限公司',customerAddress:'上海市测试地址',customerAgent:'测试甲方',customerPhone:'13800000000',sellerAgent:'测试乙方',sellerPhone:'13900000000',amount:'123456.79',days:'60',spaceType:'室内',designScope:'儿童游乐区',materialDate:'2026-11-01',layoutDate:'2026-11-05',effectDate:'2026-11-12',listDate:'2026-11-20',includedFees:'设备费、运费',freightParty:'乙方'};
const out='../outputs/domestic-contracts-20261030';mkdirSync(out,{recursive:true});
for(const id of ['template-1','template-2','template-3']){
 const result=generateDomesticContract(id,values),parts=unzipSync(Buffer.from(result.data,'base64')),xml=strFromU8(parts['word/document.xml']);
 assert.ok(!xml.includes('{{'));assert.ok(xml.includes('测试客户&lt;&amp;&gt;有限公司'));assert.ok(xml.includes('123456.79'));
 assert.ok(!/南宁市健安隆|方星球|18917910193|2023年11月22日/.test(Object.values(parts).map(b=>strFromU8(b)).join('')));
 assert.equal(result.payments.reduce((n,p)=>n+Math.round(Number(p.amount)*100),0),12345679);
 assert.ok(result.paragraphs.some(p=>p.includes('违约')));assert.ok(result.paragraphs.some(p=>p.includes('1001 7189')||p.includes('6217 0011')));
 writeFileSync(out+'/'+id+'-sample.docx',Buffer.from(result.data,'base64'));
 const clean=contractTemplateFiles.find(t=>t.id===id)!;assert.ok(clean.name.endsWith('.docx'));assert.ok(!clean.name.endsWith('.docx.docx'));assert.ok(!Buffer.from(clean.data,'base64').equals(Buffer.from(result.data,'base64')));if(id==='template-1')assert.ok(!parts['word/media/image1.png']);
 assert.throws(()=>generateDomesticContract(id,{...values,customerName:''}),/甲方/);
}
assert.equal(rmbUpper(12345679),'壹拾贰万叁仟肆佰伍拾陆元柒角玖分');
for(const [c,s] of [[0,'零元整'],[1,'零元壹分'],[101,'壹元零壹分'],[100000001,'壹佰万元零壹分'],[10001000100,'壹亿零壹万零壹元整']] as const)assert.equal(rmbUpper(c),s);
for(const amount of ['-1','0','1.234','1e5','1000000000','NaN'])assert.throws(()=>generateDomesticContract('template-2',{...values,amount}));
for(const days of ['0','-1','1.5','10000'])assert.throws(()=>generateDomesticContract('template-2',{...values,days}));
assert.throws(()=>generateDomesticContract('template-1',{...values,signDate:'2026-02-30'}));
assert.throws(()=>generateDomesticContract('template-4',values));
assert.throws(()=>generateDomesticContract('template-2',{...values,customerName:'{{amount}}'}));
for(const amount of ['0.01','0.03','10.01','999999999.99']){const r=generateDomesticContract('template-2',{...values,amount});assert.equal(r.payments.reduce((n,p)=>n+Math.round(Number(p.amount)*100),0),Math.round(Number(amount)*100));}
await assert.rejects(()=>contractTemplateEndpoint({role:'followup'},'role-workspace/templates','GET'),/权限/);
const list:any=await contractTemplateEndpoint({role:'sales'},'role-workspace/templates','GET');assert.equal(list.items.filter((t:any)=>t.market==='内贸'&&t.fields).length,3);assert.ok(list.items.every((t:any)=>!t.data));
await assert.rejects(()=>contractTemplateEndpoint({role:'sales'},'role-workspace/templates/generate','POST',{templateId:'template-2',values:{}}),/填写/);
assert.ok(contractFields('template-1').some(f=>f.key==='layoutDate'));
console.log('Domestic contracts: generation, escaping, totals, validation, sanitization and access checks passed.');
