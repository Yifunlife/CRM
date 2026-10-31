const tones:Record<string,string>={
 已完成:'done',已归档:'done',已解决:'done',已确认:'done',已结清:'done',已验收:'done',已成交:'done',
 进行中:'active',生产中:'production',设计沟通中:'design',项目下单:'project-order',玩具下单:'toy-order',出货:'shipping',待安装:'installation',正在沟通:'active',
 待确认:'wait',待复核:'wait',待审批:'wait',待补充:'wait',已记录:'wait',
 异常:'error',已逾期:'error',逾期:'error',受阻:'error',失败:'error',错误:'error'
};
export default function StatusBadge({value,tone}:{value:string;tone?:string}){
 return <span className={'crm-status crm-status-'+(tone||tones[value]||'pending')}>{value}</span>;
}
