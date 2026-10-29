export function sourceTone(source:string){return /meta|facebook|instagram/i.test(source)?'meta':/阿里|alibaba/i.test(source)?'ali':/抖音|douyin/i.test(source)?'douyin':/google|谷歌/i.test(source)?'google':'other';}
export default function SourceBadge({source}:{source:string}){return <span className={'source-badge source-'+sourceTone(source)}>{source||'来源待确认'}</span>;}
