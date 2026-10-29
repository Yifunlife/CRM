import assert from 'node:assert/strict';
import {moduleURL} from './test-form-intake.mjs';
const {businessDetail,customerNoteContent}=await import(moduleURL('lib/customer-business-detail.ts'));
const raw={id:'lead-secret',ad_id:'ad-secret',adset_id:'as-secret',campaign_id:'c-secret',form_id:'f-secret',_sheet:'sheet',_row:'2',full_name:'Example',work_email:'a@example.com','what_is_your_role_in_this_project?':'investor',briefly_describe_your_project_needs:'Original request','项目需求描述':'Confirmed request',contract_id:'KEEP'};
const before=JSON.stringify(raw),detail=businessDetail(raw);assert.equal(detail['客户角色'],'investor');assert.equal(detail['项目需求描述'],'Confirmed request');assert.equal(detail['contract id'],'KEEP');assert.equal(detail['邮箱'],'a@example.com');assert.ok(!JSON.stringify(detail).includes('secret'));assert.equal(JSON.stringify(raw),before);
const prefix='表单首次询问｜提交时间：2026-10-29T00:00:00Z\n需求：Original request',body=prefix+'\n原始内容：'+JSON.stringify(raw);
assert.equal(customerNoteContent({method:'表单咨询',content:body}),prefix);assert.equal(customerNoteContent({method:'电话',content:body}),body);assert.equal(customerNoteContent({method:'表单咨询',content:prefix+'\n原始内容：manual note'}),prefix+'\n原始内容：manual note');
console.log('PASS: technical fields hidden, business fields and original records preserved, duplicate labels normalized, only known generated JSON tails removed.');
