import {blankSteps} from './order-followup';
import {FOLLOWUP_NODES} from './followup-board';
const people=[{id:'demo-sales-a',name:'示例业务员甲'},{id:'demo-sales-b',name:'示例业务员乙'},{id:'demo-followup',name:'示例跟单甲'}];
export function previewOrders(){
 return [
  ['demo-1','上海亲子乐园','中国','生产中',380000,'2026-11-05','安排验货',1],
  ['demo-2','深圳儿童空间','中国','设计沟通中',200000,'2026-11-03','确认最终清单',0],
  ['demo-3','杭州玩具增购','中国','玩具下单',348000,'2026-11-06','确认采购排期',1],
  ['demo-4','成都室内乐园','中国','出货',260000,'2026-11-02','核对提单草稿',4],
  ['demo-5','悉尼游乐项目','澳大利亚','待安装',58000,'2026-11-08','确认安装进场时间',5],
  ['demo-6','迪拜家庭中心','阿联酋','生产中',42000,'2026-11-10','跟进工厂进度',1]
 ].map(([id,project,country,stage,amount,due,next,progress],i)=>{
  const business_process=Object.fromEntries(FOLLOWUP_NODES.slice(0,Number(progress)+1).map((n,k)=>[n.page,{status:k<Number(progress)?'已完成':'进行中',owner_id:'demo-followup',due:String(due),next:k<Number(progress)?'已核对并留存资料':String(next),values:{},at:'2026-10-30T00:00:00Z',by:'demo-followup'}]));
  return {id,order_number:'DEMO-202610-'+String(i+1).padStart(3,'0'),project:'[虚拟] '+project,customer_name:'示例客户 '+String.fromCharCode(65+i),country,lead_id:'demo-lead-'+i,commercial_id:i%2?'demo-sales-b':'demo-sales-a',commercial_name:i%2?'示例业务员乙':'示例业务员甲',logistics_id:'demo-followup',logistics_name:'示例跟单甲',archived:0,stage:0,version:1,delivery_stage:stage,details:{business_stage:stage,purchase_kind:i===2?'toy':'project',design_contact:'示例设计甲',engineering_contact:'示例工程甲',contract_source:{contract_no:'DEMO-HT-'+(i+1),currency:i<4?'CNY':'USD',amount_minor:Number(amount)*100},preview_quote:{currency:i<4?'CNY':'USD',amount_minor:Math.round(Number(amount)*1.1)*100},preview_next:String(next),dates:{planned_ship:{date:String(due)}},business_process},steps:blankSteps()};
 });
}
export function previewFollowup(){const orders=previewOrders();orders[1].details.business_process['接单确认'].status='待确认';return {orders,tasks:[{id:'demo-exception',order_id:'demo-1',step:3,kind:'异常',status:'待处理',owner_id:'demo-followup',owner_name:'示例跟单甲',title:'示例工厂排期调整',next_action:'工厂排期调整，待核对新交期',due_at:'2026-11-05',meta:{}}],people,can_edit:true,can_manage:false,is_admin:false};}
export function previewProjects(market:string){return {orders:previewOrders().filter(o=>market==='内贸'?o.country==='中国':market==='外贸'?o.country!=='中国':false),projects:[],quotes:[],people,summary:{}};}
