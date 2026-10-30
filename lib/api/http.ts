export const json=(data:unknown,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
export class Problem extends Error{constructor(message:string,public status=400){super(message);}}
