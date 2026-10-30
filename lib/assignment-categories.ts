export const ASSIGNMENT_CATEGORIES = [
 {id:'new',label:'新增分配待处理',description:'只统计正常分配后尚缺本人有效跟进记录的客户，包含此前分配后仍待处理的客户；历史归属同步和历史联系状态待核实均不计入。',timeLabel:'分配时间'},
 {id:'historical',label:'历史归属同步',description:'按历史表格同步已有归属，尚缺本人同步后的跟进记录；同步时间不代表新获客时间。',timeLabel:'同步时间'},
 {id:'unverified',label:'历史联系状态待核实',description:'没有分配时间的历史客资，仍标记待首次联系且缺少本人有效跟进记录；不代表实际未联系。',timeLabel:'联系状态'},
] as const;
export type AssignmentCategory = typeof ASSIGNMENT_CATEGORIES[number]['id'];
export function assignmentCategory(lead:{assigned_at?:string|null;assignment_policy?:string|null;legacy_sync?:number;cohort?:string}):AssignmentCategory{
 if(lead.cohort==='historical')return 'historical';
 if(lead.cohort==='unknown'||!lead.assigned_at)return 'unverified';
 return ['historical-sheet-v1','historical-alignment'].includes(lead.assignment_policy||'')||lead.legacy_sync===1?'historical':'new';
}

export function newAssignmentCount(leads:ReadonlyArray<{assignment_category?:string}>){return leads.filter(l=>l.assignment_category==='new').length;}
