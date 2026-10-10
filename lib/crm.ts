export const GRADES = ["VIP", "A", "B", "C"];
export const SOURCES = ["Meta", "独立站", "WhatsApp／其他", "阿里"];
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
export function authorizedLead(user: { role: string; id: string }, lead: { owner_id: string | null }) { return user.role !== "sales" || lead.owner_id === user.id; }
