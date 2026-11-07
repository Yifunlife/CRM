---
version: 1
slug: "project-responsibility"
primary_target: "app/project-responsibility.tsx"
related_targets: ["app/project-detail.tsx", "app/project-management.tsx", "lib/project-responsibility-server.ts"]
---

# 单项目人员分配

## Scope and direction

在「单项目明细」既有「业务员 / 跟单员」资料行内维护人员，继承当前浅色 Microsoft 365 / Fluent 操作界面、紧凑布局与原生表单控件。不改变全局设计、项目导航或订单跟单流程。

## Interaction

默认显示两位人员，缺失时显示「待明确」。具备实际编辑权限时，行内提供「分配人员」；两位均已分配时显示「调整人员」。展开后分别以「业务员」「跟单员」标注选择器，并保留可访问名称「项目业务员」「项目跟单员」。使用明确的「保存人员」「取消」，保存期间禁用表单并显示「正在保存…」；取消恢复已保存值。

读取、保存成功与失败均有文字反馈及 status / alert 语义。初次读取失败提供「重新读取」；保存失败保留选择供修正。成功后重新读取人员并刷新项目总览，避免资料行与列表显示不一致。示例项目仅显示姓名，不挂载真实人员分配入口。

## Business and permission boundaries

- 服务端只允许当前真实登录、本人操作且满足 `canSetManagement`、全客户权限与原有客户可见规则的管理人员维护；预览身份及个人业务模式不能代办。已建立订单跟单的项目不开放此入口。
- 仅历史客资、尚无客户负责人且没有成交记录时，可在这里初次指定符合内外贸范围的在职业务员；同时写入规范客户归属 `crm_leads.owner_id` 及分配记录。新客资继续走分配管理。
- 已有业务员受保护，选择器不可更改；文字说明更换须走客户正式转交流程。服务端再次校验，不能靠提交覆盖归属。
- 跟单员独立保存在 `project.details.followup_id`，只能选择在职且通过既有跟单维护资格检查的人员。人员记录不创建虚假成交或订单，也不扩大跟单员的客户访问范围。
- 保存校验项目版本及原客户负责人；并发变化以可读错误要求刷新重试，人员变更保留事件记录。

## Verification and release status

主任务已记录单元检查、界面检查与 TypeScript 检查通过，最终评审为 ship。本文仅固化本次人员分配表面的约束；生产部署尚未完成，不能视作已上线或真实业务验收。
