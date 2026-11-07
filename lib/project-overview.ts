// Read project-specific facts only; a customer's other contracts/projects are not fallbacks.
export function projectOverviewFacts(record:any,linkedProject?:any){
 const details=record.details||{},linked=linkedProject?.details||{},qualification=details.qualification||{},linkedQualification=linked.qualification||{};
 const dimension=(key:string)=>{
  const value=qualification[key]?.value??details[key]??linkedQualification[key]?.value??linked[key];
  if(value==null||String(value).trim()==='')return '';
  const number=Number(value);
  return Number.isFinite(number)&&number>0?String(number):'';
 };
 const deliveryDate=details.dates?.eta_site?.date||'';
 const contractNumber=details.contract_source?.contract_no||details.contract_no||record.order_number||linked.contract_no||'';
 const projectAddress=record.project_id?qualification.project_address?.value??details.project_address:details.project_address??qualification.project_address?.value;
 return {
  contractNumber,number:contractNumber,
  projectAddress:projectAddress??linkedQualification.project_address?.value??linked.project_address??'',
  country:record.country||linkedProject?.country||'',
  area:dimension('area_m2'),height:dimension('height_m'),
  legacyDimensions:qualification.area?.value||linkedQualification.area?.value||'',
  deliveryDate,deliveryLabel:deliveryDate?'预计到客户现场':''
 };
}
