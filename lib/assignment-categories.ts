export const ASSIGNMENT_CATEGORIES = [
 {id:'new',label:'新增分配',description:'有正常分配记录、尚缺本人分配后跟进记录的客户；包含此前分配后仍待处理的客户。',timeLabel:'分配时间'},
 {id:'historical',label:'历史归属同步',description:'按历史表格同步已有归属，尚缺本人同步后的跟进记录；同步时间不代表新获客时间。',timeLabel:'同步时间'},
 {id:'unverified',label:'历史联系状态待核实',description:'没有分配时间的历史客资，仍标记待首次联系且缺少本人有效跟进记录；不代表实际未联系。',timeLabel:'联系状态'},
] as const;
export type AssignmentCategory = typeof ASSIGNMENT_CATEGORIES[number]['id'];
export function assignmentCategory(lead:{assigned_at?:string|null;assignment_policy?:string|null;legacy_sync?:number}):AssignmentCategory{
 if(!lead.assigned_at)return 'unverified';
 return lead.assignment_policy==='historical-sheet-v1'||lead.legacy_sync===1?'historical':'new';
}
