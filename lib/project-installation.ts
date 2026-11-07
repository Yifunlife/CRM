export type InstallationPlan={
 profile:Record<string,string>;
 factory:Record<string,string>&{confirmed:boolean};
 client:Record<string,string|boolean>&{confirmed:boolean;site_ready:boolean;documents_ready:boolean;cost_confirmed:boolean};
 travel:Record<string,string|boolean>&{issued:boolean;reconfirmation:boolean};
 acceptance:Record<string,string|boolean>&{installed:boolean;accepted:boolean};
};
export function blankInstallation():InstallationPlan{return {profile:{},factory:{confirmed:false} as InstallationPlan['factory'],client:{confirmed:false,site_ready:false,documents_ready:false,cost_confirmed:false},travel:{issued:false,reconfirmation:false},acceptance:{installed:false,accepted:false}};}
export function installationReady(p:InstallationPlan){return p.factory.confirmed&&p.client.confirmed&&p.client.site_ready&&p.client.documents_ready&&p.client.cost_confirmed;}
export function installationStatus(p:InstallationPlan){
 if(p.travel.reconfirmation&&p.travel.issued)return '待改签确认';
 if(p.acceptance.accepted)return '已完成';
 if(p.acceptance.installed)return '待验收';
 if(!p.factory.confirmed)return '待工厂安排';
 if(!p.client.confirmed)return '待客户确认';
 if(!installationReady(p))return '待出行准备';
 return p.travel.issued?'已定行程':'待出票';
}
export function installationNext(p:InstallationPlan){return ({'待工厂安排':'落实师傅名单和可出发日期','待客户确认':'确认客户接待日期、机场及住宿','待出行准备':'补齐出行手续与现场确认','待出票':'按确认行程购票并登记','已定行程':'出发前复核接待和到场安排','待改签确认':'重新确认客户行程及原票改签','待验收':'取得客户验收记录','已完成':'安装及客户验收已完成'})[installationStatus(p)];}
export function installationEntities(row:any,projects:any[]=[]){return [row.id,...(row.orderId?projects.filter(p=>p.details?.deal_id&&p.details.deal_id===row.original.deal_id).map(p=>'sales:'+p.project_id):[])];}
export const INSTALLATION_PROFILE_FIELDS=[['area_m2','面积 m²'],['commercial_group','商务组别'],['design_group','设计组'],['engineering_group','工程组'],['labyrinth','是否有迷宫'],['planned_arrival','计划到货时间'],['customer_start','客户期望安装开始'],['customer_end','客户期望安装结束'],['site_contact','客户现场联系人'],['notes','安装范围与特殊要求'],['remarks','备注']] as const;
export const INSTALLATION_FACTORY_FIELDS=[['factory','工厂 / 对接方'],['technicians','安装师傅名单'],['people','安装人数（总人数）'],['project_lead','项目负责 / 安装负责人'],['days','预计安装天数'],['available_date','工厂确认可出发日期'],['departure_date','计划安装出发时间'],['end_date','计划安装结束时间'],['internal_owner','内部工厂对接负责人'],['due_date','下次跟进期限'],['evidence','工厂确认依据']] as const;
export const INSTALLATION_CLIENT_FIELDS=[['actual_arrival','实际到货时间'],['visa_type','签证类型（按核实资料登记）'],['visa_duration','签证时长（注明有效期 / 可停留天数）'],['airport','客户确认到达机场 / 国内到场地点'],['site_contact','现场联系人 / 接待方'],['buyer','机票购买方'],['cost','费用承担与确认依据'],['due_date','下次跟进期限']] as const;
export const INSTALLATION_TRAVEL_FIELDS=[['flight','航班 / 交通安排'],['departure_date','确认行程出发日期'],['arrival_date','预计抵达现场日期'],['actual_departure','实际安装出发时间'],['evidence','客户购票 / 出票确认依据']] as const;
export const INSTALLATION_ACCEPTANCE_FIELDS=[['actual_end','实际安装完成日期'],['evidence','安装 / 客户验收确认依据']] as const;
