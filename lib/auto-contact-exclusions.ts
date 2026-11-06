// Profile and workbench deal stages remain authoritative even before a deal is imported.
export function wonCustomerSQL(alias='l'){
 const stages=['$._customer_profile.stage','$._workbench.stage','$.本地阶段'].map(path=>`CAST(json_extract(${alias}.detail,'${path}') AS INTEGER) IN (2,4,5,6,7,8,9)`).join(' OR ');
 const statuses=['$._customer_profile.projectStatus','$._workbench.projectStatus','$.本地项目状态'].map(path=>`json_extract(${alias}.detail,'${path}') IN ('已成交','已交付')`).join(' OR ');
 return `COALESCE((${alias}.status='已成交' OR trim(COALESCE(json_extract(${alias}.detail,'$._customer_profile.contractNumber'),''))<>'' OR ${stages} OR ${statuses}
  OR json_extract(${alias}.detail,'$._sales_progress.stage')='won' OR json_extract(${alias}.detail,'$._auto_contact_exclusion.reason')='won_customer'
  OR EXISTS(SELECT 1 FROM crm_deals d WHERE d.lead_id=${alias}.id AND d.cancelled=0)
  OR EXISTS(SELECT 1 FROM crm_customer_subject_links own JOIN crm_customer_subject_links sibling ON sibling.subject_id=own.subject_id JOIN crm_deals d ON d.lead_id=sibling.lead_id AND d.cancelled=0 WHERE own.lead_id=${alias}.id)),0)`;
}
