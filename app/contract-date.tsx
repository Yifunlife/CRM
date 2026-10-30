'use client';
export default function ContractDate({id,label,required,value,onChange}:{id:string,label:string,required?:boolean,value:string,onChange:(value:string)=>void}){
 return <input id={id} aria-label={label} type="date" required={required} value={value}
  onClick={e=>e.currentTarget.showPicker?.()}
  onChange={e=>onChange(e.target.value)}/>;
}
