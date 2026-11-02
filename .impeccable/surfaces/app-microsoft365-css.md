---
version: 1
slug: "app-microsoft365-css"
primary_target: "app/microsoft365.css"
related_targets: ["app/crm.tsx","app/layout.tsx"]
---

# Microsoft 365 CRM 外壳

## Mode and direction

Operate。用户指定 Microsoft 365 UI 与字体；使用已实现的浅色 Fluent 外壳，不再沿用深蓝侧栏和金黄色选中标记。原版 YIFUN LIFE Logo 保留。全局令牌与组件以根目录 DESIGN.md 为准。

## Built surface

- 主目标 app/microsoft365.css，相关 app/crm.tsx、app/layout.tsx；样式表在已有全局及密度样式之后加载。
- 固定 56px 白色通栏，含原版 Logo、CRM 标记、当前位置及既有通知/账号信息。桌面浅灰侧栏宽 224px，中等宽度缩为 200px；当前项与子项同用深蓝文字、浅蓝底及蓝轨。
- 720px 及以下导航转为带关闭入口和遮罩的抽屉；保留菜单名称、展开状态及模态行为，按钮和常规字段至少 44px。
- Segoe UI Web 常规/半粗字重从 Microsoft 公共 CDN 加载，中文使用系统回退。白色面板、紧凑标题、灰色细线与蓝色操作保持一致；键盘焦点可见，尊重减少动态效果偏好。
- 聊天工作区高度按视口减去 56px 通栏计算；既有模块内部响应布局继续生效。

## Preservation and release boundary

现有 CRM 业务模块、权限、统计、数据归属及资料保持原逻辑；视觉调整不代表 Microsoft 365 服务接入。当前为本地预览，没有生产部署声明，也不替代真实账号验收。此前表面文档保留为局部业务约定，其中旧品牌色不再覆盖本次全局外壳。
