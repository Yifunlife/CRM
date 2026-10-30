import { contractConfirmation } from './confirmation/contract';
import { documentSync } from './confirmation/documents';
import { fail } from './confirmation/errors';
import { quoteAcceptance } from './confirmation/quotes';
import { releaseConfirmation } from './confirmation/release';
import type { ArchiveStores } from './contract-archive';
export async function confirmedWorkflow(db:D1Database,source:D1Database|undefined,u:any,actor:any,path:string,method:string,b:any,url:URL,stores?:ArchiveStores){
 if(!path.startsWith('confirmations/'))return undefined;
 if(u.id!==actor.id)fail('请切回本人账号确认',403);
 const quoteAcceptanceResult=await quoteAcceptance({db,source,u,actor,path,method,b,url,stores});if(quoteAcceptanceResult!==undefined)return quoteAcceptanceResult;
 const contractConfirmationResult=await contractConfirmation({db,source,u,actor,path,method,b,url,stores});if(contractConfirmationResult!==undefined)return contractConfirmationResult;
 const documentSyncResult=await documentSync({db,source,u,actor,path,method,b,url,stores});if(documentSyncResult!==undefined)return documentSyncResult;
 const releaseConfirmationResult=await releaseConfirmation({db,source,u,actor,path,method,b,url,stores});if(releaseConfirmationResult!==undefined)return releaseConfirmationResult;
 fail('确认操作不存在',404);
}
