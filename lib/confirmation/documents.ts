import { prepareContractArchive } from '../contract-archive';
import { followupOrder } from '../order-followup-server';
import type { ConfirmationContext } from './context';
import { fail } from './errors';
export async function documentSync({db,source,u,actor,path,method,b,stores}:ConfirmationContext){
 if(path==='confirmations/documents'&&method==='POST'){
  const {row}=await followupOrder(db,u,b.order_id);if(row.commercial_id!==u.id||row.archived)fail('请本单销售确认同步商务文件',403);
  if(!row.details.contract_source?.quote_id||!source)fail('本单尚未关联报价');
  const archive=await prepareContractArchive(db,source!,stores,row.id,row.details.contract_source.quote_id,[],actor.id);
  try{if(archive.statements.length)await db.batch(archive.statements);}catch(e){await archive.cleanup();throw e;}return {ok:true,copied:archive.files.length};
 }
}
