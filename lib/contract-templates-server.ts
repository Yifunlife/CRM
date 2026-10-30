import {foreignDefinition,generateForeignContract} from './foreign-contracts';
import {contractFields,domesticTemplate,generateDomesticContract} from './domestic-contracts';
import {contractTemplateFiles} from './contract-template-files';
import {AllocationError} from './allocation-server';
export async function contractTemplateEndpoint(user:any,path:string,method:string,body:any={}){
 if(!path.startsWith('role-workspace/templates'))return undefined;
 if(!['sales','admin','ceo','management'].includes(user.role))throw new AllocationError('没有合同范本访问权限',403);
 if(path==='role-workspace/templates/generate'&&method==='POST'){try{const id=String(body.templateId||'');return foreignDefinition(id)?generateForeignContract(id,body.values||{}):generateDomesticContract(id,body.values||{});}catch(error){throw new AllocationError(error instanceof Error?error.message:'生成失败',400);}}
 if(method!=='GET')throw new AllocationError('范本仅支持读取',405);
 if(path==='role-workspace/templates')return {items:contractTemplateFiles.filter(item=>item.market==='内贸'||'company' in item).map(({data,...item})=>({...item,...(foreignDefinition(item.id)||{fields:domesticTemplate(item.id)?contractFields(item.id):undefined,currency:'CNY',format:'docx'})}))};
 const item=contractTemplateFiles.find(t=>path==='role-workspace/templates/'+t.id);if(!item)throw new AllocationError('范本不存在',404);
 const binary=Uint8Array.from(atob(item.data),c=>c.charCodeAt(0));
 return new Response(binary,{headers:{'Content-Type':item.name.endsWith('.docx')?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':item.name.endsWith('.xlsx')?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/msword','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(item.name),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
