import {build} from 'esbuild';
import {mkdirSync,copyFileSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const asar=process.argv[2];if(!asar)throw Error('Usage: node scripts/build-communication-connector.mjs <@electron/asar/lib/asar.js>');
const directory='public/communication-connector';mkdirSync(directory,{recursive:true});
await build({entryPoints:['scripts/desktop-sync/setup.cjs'],outfile:directory+'/setup.cjs',bundle:true,platform:'node',format:'cjs',external:['original-fs'],alias:{'@electron/asar':resolve(asar)}});
for(const [source,name] of [['first-contact-mail.cjs','crm-first-contact-mail.cjs'],['first-contact.cjs','crm-first-contact.cjs'],['account-sync.cjs','crm-account-sync.cjs'],['crm-history-sync.cjs','crm-history-sync.cjs'],['connection-settings.cjs','crm-connection-settings.cjs'],['connection-renderer.js','crm-connection-renderer.js']])copyFileSync('scripts/desktop-sync/'+source,directory+'/'+name);
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
writeFileSync(directory+'/升级连接功能.command',readFileSync(directory+'/连接我的工作台.command','utf8').replace('"$CRM_CONNECTOR_DIR/setup.cjs"','"$CRM_CONNECTOR_DIR/setup.cjs" --add-connection-ui'),{mode:0o755});
writeFileSync(directory+'/端口接入步骤.txt',`CRM地址和本人连接码接入

1. 同款2.0.8版Mac工作台若已有“CRM连接”按钮，无需重复升级。
2. 若没有按钮，先保存内容并完全退出原工作台，运行“升级连接功能.command”。升级会备份原应用和资料设置，不创建新资料库，不包含个人连接码。
3. 本人登录CRM → 我的业务 → 客户沟通 → 连接设置 → 已有工作台，生成并复制本人连接码。
4. 打开原工作台的“CRM连接”，填写地址 https://yifun-crm.yifunlife.workers.dev 和本人连接码。
5. 点击“测试连接”，核对显示的姓名和工号，再点击“保存并连接”。工作台通过HTTPS 443主动连接CRM。
6. 保持原工作台打开并联网，CRM本人客资进入本地，本地启用后新增客资上传CRM，文字记录分批保存。附件原件留在原设备。

连接码只给本人使用。生成新码会使旧码失效，需要重新填写；旧客户和聊天保留。同一资料库不能改绑其他人的账号。其他软件或版本需按接口协议适配。
`);
