# 客户沟通接入

业务员进入「客户沟通 → 连接设置」，选择「已有工作台」或「WhatsApp扫码」。两种方式使用本人CRM账号，客户归属、聊天与连接凭据按账号隔离。切换显示来源保留两边记录。接入和同步不需要AI；AI回复另按原公司配置执行。

## 已有Mac工作台

1. 本人登录CRM并下载「本人工作台连接包」。已有连接默认继续使用，只有本人明确选择「更换连接配置」才会失效旧凭据。
2. 在原Mac保存内容并完全退出原工作台，解压后运行「连接我的工作台.command」。
3. 核对账号，选择原资料文件夹。安装会备份旧应用与设置，保留原客户文件；账号或版本不兼容时停止。已验证现有2.0.8版本，其他工作台软件需按接口适配。
4. 重新打开原工作台并联网；CRM显示实际在线状态、全文核对客户数和已存记录数。首次历史导入可以断点续传，重复上传不重复建记录。

同步范围：本人原有客户及完整文字存档、CRM新分给本人的客资、受支持客户字段与项目记录。原客资按电话/邮箱核对后关联，不改变他人归属；冲突保留并提示。附件原件留在本机，原工作台关闭后仍可在CRM查看已存文字。

## 直接连接WhatsApp

1. 本人登录CRM，进入「WhatsApp扫码」，点击生成本人二维码。
2. 用本人手机的WhatsApp「设置 → 已关联设备 → 关联设备」扫描。
3. 等待页面显示实际授权号码及同步状态，再进入WhatsApp聊天。

二维码每人独立，号码冲突会拒绝绑定，记录不会匹配到其他业务员。历史仅限手机/平台实际提供的文字范围；更早本机存档通过工作台补充。未扫码不视为已连接，附件仅保留提示。

扫码连接需要管理员为该账号部署独立运行服务。当前服务位于连接服务Mac，需该电脑保持开机联网且不休眠；这不要求每位业务员一直打开自己的工作台。新增账号若显示未启用/离线，管理员须先部署服务，页面不会伪装已就绪。已有官方Meta授权仍可在进阶选项使用。

## 接口

浏览器接口使用原CRM登录会话、同源请求和本人业务视图（管理/CEO本人业务使用 `x-crm-view: personal`；实际值以现有CRM客户端为准），不允许提交其他人的owner_id。状态响应不返回连接密钥。

| 路径 | 方法 | 用途 |
| --- | --- | --- |
| `/api/communication/connection` | GET | 本人两种接入状态、显示来源及历史核对进度 |
| `/api/communication/connection` | POST | `{mode:"desktop"}` 或 `{mode:"whatsapp"}`，切换本人显示来源 |
| `/api/communication/desktop-config` | POST | `{device_token:<客户端安全随机48字节的96位hex>}`，首次生成本人工作台配置；显式更换需 `replace:true` |
| `/api/communication/whatsapp-connect` | POST | 请求本人二维码；由现有独立服务生成并轮询状态 |
| `/api/linked/status` | GET | 本人扫码状态与短时二维码 |
| `/api/linked/disconnect` | POST | 断开本人扫码连接，保留记录 |
| `/api/cloud/messages?lead_id=...&offset=0` | GET | 本人客户WhatsApp文字，100条/页及总数 |
| `/api/workbench/history/<desktop_id>/<offset>` | GET | 本人已同步工作台全文，100条/页及核对状态 |

第三方工作台适配复用现有 `POST /api/bridge/poll`：配置中的token放在 `Authorization: Bearer ...`，不得放URL。沿用现有catalog/profile及完整history批次协议，参照 `scripts/desktop-sync/account-sync.cjs` 和 `crm-history-sync.cjs`；身份由服务端凭据确定，提交owner_id不能切换身份。每批核对hash/count后才标记完整，长文字原样保存，重试幂等。只读账号不能创建写入连接。

独立WhatsApp服务使用 `POST /api/linked/worker` 的独立Bearer凭据，不能复用工作台token或其他账号session。服务代码为 `scripts/linked-whatsapp/runtime.mjs`，每人独立存储目录，禁止指向已有工作台会话目录。只在用户明确发送后执行发送命令；历史导入不新增跟进任务或分配记录。

公共连接程序不含账号配置。下载包的account.json含本人连接凭据，须仅保存在本人电脑，不能转交其他业务员。
