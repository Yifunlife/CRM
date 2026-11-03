import {foreignDefinition,generateForeignContract} from './foreign-contracts';
import {contractFields,domesticTemplate,generateDomesticContract} from './domestic-contracts';
import {contractTemplateFiles} from './contract-template-files';
import {AllocationError} from './allocation-server';
const displayNames:Record<string,string>={
 'template-7':'总公司 【设备】合同 - Playground Equipment Contract',
 'template-12':'总公司 【设备】形式发票 - Equipment Purchase PI',
 'template-16':'总公司 【设计】合同 - Design Contract',
 'template-6':'香港公司 【设备】合同 - Playground Equipment Contract',
 'template-10':'香港公司 【设备】形式发票 - Equipment Purchase PI',
 'template-15':'香港公司 【设备】商业发票 - Equipment Purchase CI',
 'template-4':'澳洲分公司 【设计】合同 - Design Contract',
 'template-8':'澳洲分公司 【设计】形式发票 - Design Fee PI',
 'template-14':'澳洲分公司 【设计】商业发票 - Design Fee CI'
};
export async function contractTemplateEndpoint(user:any,path:string,method:string,body:any={}){
 if(!path.startsWith('role-workspace/templates'))return undefined;
 if(!['sales','admin','ceo','management'].includes(user.role))throw new AllocationError('没有合同范本访问权限',403);
 if(path==='role-workspace/templates/generate'&&method==='POST'){try{const id=String(body.templateId||'');return foreignDefinition(id)?generateForeignContract(id,body.values||{}):generateDomesticContract(id,body.values||{});}catch(error){throw new AllocationError(error instanceof Error?error.message:'生成失败',400);}}
 if(method!=='GET')throw new AllocationError('范本仅支持读取',405);
 if(path==='role-workspace/templates')return {items:contractTemplateFiles.filter(item=>item.market==='内贸'||'company' in item).map(({data,...item})=>({...item,displayName:displayNames[item.id],...(foreignDefinition(item.id)||{fields:domesticTemplate(item.id)?contractFields(item.id):undefined,currency:'CNY',format:'docx'})}))};
 const item=contractTemplateFiles.find(t=>path==='role-workspace/templates/'+t.id);if(!item)throw new AllocationError('范本不存在',404);
 const binary=Uint8Array.from(atob(item.data),c=>c.charCodeAt(0));
 return new Response(binary,{headers:{'Content-Type':item.name.endsWith('.docx')?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':item.name.endsWith('.xlsx')?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/msword','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(item.name),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
