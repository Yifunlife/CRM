export default function AccountContactFields({user,disabled=false}:{user:any;disabled?:boolean}){
 return <fieldset className="account-contact-fields" disabled={disabled}><legend>联系方式</legend>
 <label>邮箱<input name="email" type="email" maxLength={254} defaultValue={user?.email||''} autoComplete="email" placeholder="选填，可稍后补登"/></label>
 <p className="small muted">邮箱同时用于登录，每个邮箱只能绑定一个账号。</p>
 <label>WhatsApp<input name="whatsapp" type="tel" maxLength={40} defaultValue={user?.whatsapp||''} autoComplete="tel" placeholder="+ 国家区号和手机号码"/></label>
 <p className="small muted">包含 + 和国家区号，例如 +61 412 345 678。</p>
 <label>WeChat（内贸用）<input name="wechat" maxLength={80} defaultValue={user?.wechat||''} autoComplete="off" placeholder="填写微信号"/></label>
 </fieldset>;
}
