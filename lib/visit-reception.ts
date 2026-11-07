export const VISIT_TIMES=Array.from({length:48},(_,i)=>String(Math.floor(i/2)).padStart(2,'0')+':'+(i%2?'30':'00'));
export const VISIT_LOCATIONS=['公司','公司二楼','公司展厅','展厅','一厂','二厂','会议室','酒店','机场／车站','餐厅','公司、工厂','其他'];
export const VISIT_PURPOSES=['公司考察','产品考察','项目洽谈','商务谈判','验货','其他'];
export const EXPENSE_CATEGORIES=['餐饮','交通（打车）','住宿','礼品','其他'];
export type VisitStop={start:string;end:string;activity:string;location:string;custom_location:string;people:string[];note:string};
export type VisitCost={category:string;expected:string;actual:string};
export type VisitReception={id:string;revision:string;lead_id:string;receptionist_id:string;date:string;arrival:string;purpose:string;welcome:string;photography:boolean;management:boolean;gift:boolean;visitor_count:string;pickup:string;requirements:string;itinerary:VisitStop[];expenses:VisitCost[];expense_note:string;completed:boolean;result:string;next_action:string};
export const welcomeFor=(name:string)=>name?'Welcome '+name+' to YIFUN LIFE!':'';
export function standardItinerary():VisitStop[]{
 return [
 ['09:30','10:00','开启空调灯光、咖啡机；设备自检，设置欢迎图','公司展厅','展厅负责人／业务员；发现问题及时反馈，故障设备放置提示牌'],
 ['09:30','10:00','安排跟拍摄影师（按需）','公司、工厂','摄影负责人；根据跟拍选项安排'],
 ['10:00','10:30','客户到达、迎接，参观公司二楼','公司','业务员；提前10分钟迎接，按需到酒店接客户'],
 ['10:30','11:00','参观展厅','展厅','业务员；安排设备体验'],
 ['11:00','11:30','参观亦玩一厂','一厂','工厂负责人／业务员；提前检查灯光、卫生'],
 ['11:30','12:00','参观亦玩二厂','二厂','工厂负责人／业务员；提前检查灯光、卫生'],
 ['12:00','13:30','商务洽谈','会议室','业务员／管理层；准备公司资料、项目方案及会议室']
 ].map(([start,end,activity,location,note])=>({start,end,activity,location,custom_location:'',people:[],note}));
}
export function emptyVisit(userId:string):VisitReception{return {id:crypto.randomUUID(),revision:'',lead_id:'',receptionist_id:userId,date:'',arrival:'10:00',purpose:'公司考察',welcome:'',photography:false,management:false,gift:false,visitor_count:'',pickup:'',requirements:'',itinerary:standardItinerary(),expenses:['餐饮','交通（打车）','住宿'].map(category=>({category,expected:'',actual:''})),expense_note:'',completed:false,result:'',next_action:''};}
// Convert decimal text to integer cents; an empty amount is different from zero.
export function visitCents(value:string):number|null{if(value==='')return null;if(!/^\d{1,8}(\.\d{1,2})?$/.test(value))throw Error('费用需为非负金额，最多两位小数');const [whole,fraction='']=value.split('.');return Number(whole)*100+Number(fraction.padEnd(2,'0'));}
export function expenseSummary(expenses:VisitCost[]){const sum=(key:'expected'|'actual')=>expenses.reduce((n,r)=>{try{return n+(visitCents(r[key])||0);}catch{return n;}},0);return {expected:sum('expected'),actual:sum('actual'),missing:expenses.filter(r=>r.actual==='').map(r=>r.category),estimated:expenses.filter(r=>r.expected!=='').length};}
export const visitMoney=(cents:number)=>(cents/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
