// Normalize report dates only; never rewrite the original customer record.
export function reportAcquiredDay(input:string):string|null{
 const raw=(input||'').trim();
 const date=raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
 if(date){const day=`${date[1]}-${date[2].padStart(2,'0')}-${date[3].padStart(2,'0')}`;return Number.isFinite(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day?day:null;}
 if(/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:?\d{2})$/.test(raw)&&Number.isFinite(Date.parse(raw))&&Number.isFinite(Date.parse(raw.slice(0,10)))&&new Date(raw.slice(0,10)).toISOString().slice(0,10)===raw.slice(0,10))return new Date(raw).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
 return null;
}
