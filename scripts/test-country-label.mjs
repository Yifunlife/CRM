import assert from 'node:assert/strict';
import {moduleURL} from './test-form-intake.mjs';
const {countryLabel,reportCountry}=await import(moduleURL('lib/report-country.ts'));
for(const [raw,label] of [['SY','叙利亚（SY）'],['US','美国（US）'],['GB','英国（GB）'],['EG','埃及（EG）'],['sy','叙利亚（SY）'],['Syria','叙利亚（SY）'],['美国','美国（US）'],['USA','美国（US）'],['UK','英国（GB）'],['澳洲','澳大利亚（AU）'],['叙利亚（SY）','叙利亚（SY）'],['United States (US)','美国（US）']])assert.equal(countryLabel(raw),label);
assert.equal(countryLabel('ZZ'),'ZZ');assert.equal(countryLabel('unknown country'),'unknown country');assert.equal(countryLabel(''),'国家待补充');assert.equal(countryLabel(null,''),'');
assert.deepEqual(reportCountry('澳洲'),{code:'AU',name:'澳洲'},'existing reporting buckets stay unchanged');
console.log('PASS country display: full Chinese names plus two-letter codes, names and aliases, repeated formatting, unknown/empty values, and unchanged reporting normalization.');
