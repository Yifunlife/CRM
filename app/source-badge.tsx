import {customerSource} from '../lib/customer-source';
export function sourceTone(source:string){return /meta|facebook|instagram/i.test(source)?'meta':/阿里|alibaba/i.test(source)?'ali':/抖音|douyin/i.test(source)?'douyin':/google|谷歌/i.test(source)?'google':'other';}
export default function SourceBadge({source,lead}:{source:string;lead?:any}){return <span className={'source-badge source-'+sourceTone(source)}>{customerSource(lead||{source})}</span>;}
