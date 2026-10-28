export const GRADES = ["VIP", "A", "B", "C"];
export const SOURCES = ["Meta", "Google 广告", "抖音", "独立站", "WhatsApp／其他", "阿里"];
export const STATUSES = ["待首次联系", "已联系待回复", "正在沟通", "暂停跟进", "已成交", "已结束"];
export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const clean = (v: unknown, max = 4000) => String(v ?? "").trim().slice(0, max);
export const phoneKey = (v: unknown) => clean(v).replace(/[^0-9]/g, "");
export const emailKey = (v: unknown) => clean(v).toLowerCase();
export async function digest(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map(v => v.toString(16).padStart(2, "0")).join(""); }
export async function passwordHash(password: string, salt = id()) {
 const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
 const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 100000 }, key, 256);
 return salt + ":" + Array.from(new Uint8Array(bits)).map(v => v.toString(16).padStart(2, "0")).join("");
}
export async function verifyPassword(password: string, stored: string) {
 const actual = await passwordHash(password, stored.split(":")[0]); let difference = actual.length ^ stored.length;
 for (let i = 0; i < stored.length; i++) difference |= stored.charCodeAt(i) ^ (actual.charCodeAt(i) || 0);
 return difference === 0;
}
export function authorizedLead(user: { role: string; id: string; permissions?:any }, lead: { owner_id: string | null }) { return can(user,'customers_all') || lead.owner_id === user.id; }

export const PERMISSION_FIELDS = [
 ['customers_all','全公司客资','查看所有业务员的客资与客户沟通记录'],
 ['customers_edit','客资维护','新增、导入、评级及填写客户跟进'],
 ['leads_allocate','客资分配','手动或按已确认比例分配客资'],
 ['performance_view','业绩查看','查看全公司月度业绩和分配比例'],
 ['followup_all','全公司跟单','查看全部订单、进度、待办和附件'],
 ['followup_edit','跟单维护','建立、导入和更新订单跟单'],
 ['advertising_view','广告查看','查看广告投放数据'],
 ['advertising_edit','广告维护','维护广告投放数据'],
] as const;
export type PermissionKey=typeof PERMISSION_FIELDS[number][0];
export function permissionDefaults(role:string):Record<PermissionKey,boolean>{
 const admin=role==='admin',operations=role==='operations',leadership=['ceo','management'].includes(role);
 return {customers_all:admin||operations||leadership,customers_edit:admin||operations||role==='sales',leads_allocate:admin||operations||leadership,performance_view:admin||operations||leadership,followup_all:admin||leadership,followup_edit:admin,advertising_view:admin||operations,advertising_edit:admin||operations};
}
export function permissionOverrides(user:any):Partial<Record<PermissionKey,boolean>>{try{const p=typeof user.permissions==='string'?JSON.parse(user.permissions):user.permissions;return p&&typeof p==='object'&&!Array.isArray(p)?p:{};}catch{return {};}}
export function can(user:any,key:PermissionKey){return user?.role==='admin'||(permissionOverrides(user||{})[key]??permissionDefaults(user?.role||'')[key]);}
