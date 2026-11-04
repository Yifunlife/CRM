'use client';
import {customerInquiry,originalTimeLabel} from '../lib/customer-inquiry';
import './customer-inquiry.css';
export function InquiryTime({inquiry}:{inquiry:any}){return <span>{originalTimeLabel(inquiry?.time)||'原始咨询时间待补充'}</span>;}
export function InquiryContent({inquiry,compact=false}:{inquiry:any;compact?:boolean}){return <details className="inquiry-content"><summary title={compact?'查看最初咨询内容':undefined}>{compact?'原始内容':'查看最初咨询内容'}</summary><p dir="auto">{inquiry?.content||'未留存原始咨询内容'}</p></details>;}
export default function CustomerInquiry({lead}:{lead:any}){
 const inquiry=lead.original_inquiry||customerInquiry(lead);
 return <div className="customer-original-inquiry"><h3>最初咨询记录</h3><dl><div><dt>原始咨询时间</dt><dd><InquiryTime inquiry={inquiry}/></dd></div><div><dt>最初渠道 / 账号</dt><dd>{inquiry.platform||'待确认'} / {inquiry.account||'待确认'}</dd></div><div><dt>进入系统时间</dt><dd>{originalTimeLabel(lead.intake?.created||lead.created)||'入库时间待补充'}</dd></div></dl><InquiryContent inquiry={inquiry}/></div>;
}
