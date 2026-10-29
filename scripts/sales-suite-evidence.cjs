const {existsSync,mkdirSync}=require('node:fs');
const {resolve,join}=require('node:path');
const root=resolve(process.env.CRM_SALES_OUTPUT||(existsSync('../../crm-site/package.json')?'../../outputs/sales-completion-20261029':'../outputs/sales-completion-20261029'));
mkdirSync(root,{recursive:true});
module.exports={root,file:name=>join(root,name)};
