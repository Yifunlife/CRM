export function targetWanInput(minor:number){
 const fraction=String(minor%1_000_000).padStart(6,'0').replace(/0+$/,'');
 return String(Math.floor(minor/1_000_000))+(fraction?'.'+fraction:'');
}
export function targetWanToYuan(value:string):string|null{
 if(!/^\d{1,6}(\.\d{1,6})?$/.test(value))return null;
 const [whole,fraction='']=value.split('.'),minor=Number(whole)*1_000_000+Number(fraction.padEnd(6,'0'));
 return Math.floor(minor/100)+'.'+String(minor%100).padStart(2,'0');
}
