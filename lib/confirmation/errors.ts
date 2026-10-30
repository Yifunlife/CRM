import { AllocationError } from '../allocation-server';
export const fail=(message:string,status=400):never=>{throw new AllocationError(message,status);};
export const required=(value:any,label:string)=>{if(typeof value!=='string'||!value.trim()||value.length>5000)fail('请填写'+label);return value.trim();};
