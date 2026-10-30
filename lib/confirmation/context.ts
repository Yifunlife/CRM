import type { ArchiveStores } from '../contract-archive';
export type ConfirmationContext={db:D1Database;source:D1Database|undefined;u:any;actor:any;path:string;method:string;b:any;url:URL;stores?:ArchiveStores};
