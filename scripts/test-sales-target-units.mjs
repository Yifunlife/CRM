import assert from 'node:assert/strict';
import {moduleURL} from './test-form-intake.mjs';
const {targetWanInput,targetWanToYuan}=await import(moduleURL('lib/sales-target-units.ts'));
assert.equal(targetWanToYuan('200'),'2000000.00');
assert.equal(targetWanToYuan('0'),'0.00');
assert.equal(targetWanToYuan('0.000001'),'0.01');
assert.equal(targetWanInput(200000001),'200.000001');
assert.equal(targetWanToYuan('123.456789'),'1234567.89');
assert.equal(targetWanToYuan('999999.999999'),'9999999999.99');
for(const minor of [0,1,9,99,100,12345,999999,1000000,200000001,999999999999]){
 const yuan=targetWanToYuan(targetWanInput(minor));
 assert.equal(Number(yuan.replace('.','')),minor,'Existing targets must retain every cent');
}
for(const value of ['', '-1','1e2','1000000','0.0000001','NaN'])assert.equal(targetWanToYuan(value),null,value);
console.log('PASS: 万 inputs map to the existing yuan API; cent-precision existing targets round-trip, zero and maximum values work, invalid and over-limit amounts are rejected.');
