import {build} from 'esbuild';
import {mkdirSync,copyFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const asar=process.argv[2];if(!asar)throw Error('Usage: node scripts/build-communication-connector.mjs <@electron/asar/lib/asar.js>');
const directory='public/communication-connector';mkdirSync(directory,{recursive:true});
await build({entryPoints:['scripts/desktop-sync/setup.cjs'],outfile:directory+'/setup.cjs',bundle:true,platform:'node',format:'cjs',external:['original-fs'],alias:{'@electron/asar':resolve(asar)}});
for(const [source,name] of [['account-sync.cjs','crm-account-sync.cjs'],['crm-history-sync.cjs','crm-history-sync.cjs']])copyFileSync('scripts/desktop-sync/'+source,directory+'/'+name);
writeFileSync(directory+'/连接我的工作台.command',`#!/bin/bash
set -euo pipefail
CRM_CONNECTOR_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
CRM_WORKBENCH='/Applications/亦玩销售工作台.app/Contents/MacOS/亦玩销售工作台'
if [ ! -x "$CRM_WORKBENCH" ]; then
  printf '%s\\n' '请确认原工作台已安装在“应用程序”中。'
  read -r -p '按回车退出…' CRM_EXIT
  exit 1
fi
if ! ELECTRON_RUN_AS_NODE=1 "$CRM_WORKBENCH" "$CRM_CONNECTOR_DIR/setup.cjs"; then
  printf '%s\\n' '连接未完成，请核对上方提示。'
  read -r -p '按回车退出…' CRM_EXIT
  exit 1
fi
read -r -p '按回车关闭本窗口…' CRM_EXIT
`,{mode:0o755});
writeFileSync(directory+'/连接步骤.txt',`本人客户沟通连接包

1. 仅在你本人已有工作台的Mac解压此包。
2. 保存当前编辑内容，按Command+Q完全退出原工作台。
3. 双击“连接我的工作台.command”，确认本人的CRM账号。
4. 选择原资料文件夹，不要新建工作台。程序会先备份旧应用、客户资料和设置。
5. 完成后保持原工作台打开、电脑联网，回到CRM客户沟通的连接设置查看状态。
6. 选择“进入工作台聊天”。完整文字聊天分批导入，页面显示真实校验进度。
7. 导入完成后，原工作台关闭时仍可在CRM客户档案的沟通历史中查看文字全文。

原客户和原始聊天资料保留本机；附件原件继续留在本机。本包不包含CRM登录密码。
新分本人客资会核对现有电话/邮箱后同步；两端修改冲突时保留内容并提示核对。
此包包含本人的连接凭据，不要给其他账号使用。若需更换连接配置，在本人CRM的连接设置中操作。
不同版本或原连接归属不兼容时会停止，并保留原资料。当前已验证现有2.0.8版Mac工作台。
`);
console.log('Built account-neutral desktop connector assets; account.json is added only after the signed-in user requests a package.');
