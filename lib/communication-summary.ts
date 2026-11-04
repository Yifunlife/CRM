// Audit evidence belongs in history; the customer list shows a short business excerpt.
export function communicationExcerpt(value:string,limit=100){
 const text=String(value||'').trim();
 if(!text)return '暂无沟通记录';
 if(/历史联系去重核查|此次只核对和同步历史记录|没有向客户发送新消息/.test(text))return '历史联系已核对，待补充客户沟通结论';
 return text.replace(/原始内容：[\s\S]*$/,'').replace(/(?:凭据|工作台编号|最近已核对沟通时间)[:：][^\n]*/g,'').replace(/\s+/g,' ').trim().slice(0,limit)||'待补充客户沟通结论';
}
