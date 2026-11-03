import assert from 'node:assert/strict';
import {calculatePaymentPlan,defaultPaymentPlan,paymentPlanRows,paymentPlanInvoiceTotal,type PaymentPlanRow} from '../lib/contract-payment-terms';
const shares=[['100'],['30','70'],['30','60','10'],['25','25','25','25']];
for(const [i,percents] of shares.entries()){
 const plan=paymentPlanRows('template-2',i+1).map((row,j)=>({...row,percent:percents[j]}));
 for(const cents of [1,2,3,10000000,12345679,99999999999]){
  const result=calculatePaymentPlan(plan,cents,'CNY')!;
  assert.equal(result.payments.length,i+1);assert.equal(result.payments.reduce((sum,p)=>sum+Math.round(Number(p.amount)*100),0),cents);assert.ok(result.payments.every(p=>Number(p.amount)>=0));
 }
}
const plan:PaymentPlanRow[]=[{milestone:'signing',percent:'33.33'},{milestone:'dispatch',percent:'33.33'},{milestone:'acceptance',percent:'33.34'}];
assert.equal(calculatePaymentPlan(plan,10000000,'CNY')!.payments[2].amount,'33340.00');
for(const raw of [null,{},[],Array(5).fill({milestone:'signing',percent:'20'}),[{milestone:'signing',percent:'99.99'}],[{milestone:'dispatch',percent:'100.01'}],[{milestone:'signing',percent:'1e2'}],[{milestone:'signing',percent:'100.001'}],[{milestone:'signing',percent:100}],[{milestone:'signing',percent:''}],[{milestone:'signing',percent:'-1'}],[{milestone:'signing',percent:'0'}],[{milestone:'toString',percent:'100'}]])assert.throws(()=>calculatePaymentPlan(raw,100000,'CNY'));
assert.equal(calculatePaymentPlan(undefined,100000,'CNY'),undefined,'old callers retain their existing payment clauses');
assert.equal(defaultPaymentPlan('template-1').length,1);assert.equal(defaultPaymentPlan('template-2').length,3);assert.equal(defaultPaymentPlan('template-6').length,2);
assert.equal(paymentPlanRows('template-4',2)[1].milestone,'design_delivery');
assert.equal(paymentPlanInvoiceTotal([{quantity:'0.5',unitPrice:'0.29'}]),15,'half-cent uses exact decimal rounding');
assert.equal(paymentPlanInvoiceTotal([{quantity:'2',unitPrice:'120.15'},{quantity:'0.125',unitPrice:'100.01'},{quantity:'3',unitPrice:'0.01'}]),25283);
assert.equal(paymentPlanInvoiceTotal([{quantity:'1',unitPrice:''}]),null);
assert.equal(paymentPlanInvoiceTotal([{quantity:'0',unitPrice:'1'}]),null);
assert.equal(paymentPlanInvoiceTotal([{quantity:'999999',unitPrice:'999999999.99'}]),null);
console.log('PASS: 1–4 installments, exact 100% validation, malformed input rejection, decimal percentages, precise invoice totals and non-negative cent allocation that always sums to the contract amount.');
