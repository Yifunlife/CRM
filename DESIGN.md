---
name: 亦玩客资管理 · Microsoft 365
description: 保留 YIFUN LIFE 身份的浅色 Fluent 工作界面。
colors:
  primary: "#0f6cbd"
  primary-hover: "#115ea3"
  selected-ink: "#0f548c"
  selected-surface: "#e1ecf7"
  badge-surface: "#ebf3fc"
  canvas: "#edf5fc"
  surface: "#fff"
  metric-customer: "#dcecff"
  metric-priority: "#ebe2fa"
  metric-quote: "#ffecd4"
  metric-deal: "#dbf1e6"
  progress-active: "#d8eaff"
  progress-done: "#d9f0e1"
  progress-wait: "#ffedc4"
  progress-error: "#ffe0e2"
  progress-pending: "#e9edf3"
  surface-hover: "#f0f0f0"
  navigation-hover: "#ebebeb"
  table-heading: "#fafafa"
  ink: "#242424"
  secondary-ink: "#424242"
  muted: "#616161"
  line: "#e0e0e0"
  field-line: "#d1d1d1"
  field-bottom: "#707070"
typography:
  headline:
    fontFamily: '"Segoe UI Web", "Segoe UI", -apple-system, BlinkMacSystemFont, "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif'
    fontSize: "24px"
    fontWeight: 600
    lineHeight: "32px"
    letterSpacing: "0"
  title:
    fontFamily: '"Segoe UI Web", "Segoe UI", -apple-system, BlinkMacSystemFont, "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif'
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "22px"
  body:
    fontFamily: '"Segoe UI Web", "Segoe UI", -apple-system, BlinkMacSystemFont, "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontSize: "12px"
    fontWeight: 600
rounded:
  control: "4px"
  panel: "12px"
spacing:
  tight: "4px"
  control: "8px"
  section: "12px"
  panel: "16px"
  heading: "20px"
  navigation: "24px"
  page-inline: "28px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "5px 10px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "5px 10px"
  navigation-active:
    backgroundColor: "{colors.selected-surface}"
    textColor: "{colors.selected-ink}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
    padding: "16px"
  badge:
    backgroundColor: "{colors.badge-surface}"
    textColor: "{colors.selected-ink}"
    rounded: "{rounded.control}"
    padding: "3px 9px"
---

# Design System: 亦玩客资管理 · Microsoft 365

## Overview

**Creative North Star: "Microsoft 365 浅色工作台"**

按用户明确指定的 Microsoft 365 UI 与字体方向，现有 CRM 使用浅色 Fluent 视觉：白色通栏、浅蓝导航和画布、蓝色选中提示及白色工作面板；按用户提供的微软官网截图加入蓝紫青页首分区和按业务类别分色的指标。原版 YIFUN LIFE Logo 保留；Microsoft 365 是界面参考，不替换公司身份。

本文件提取本地实现，视觉来源是最后加载的 `app/microsoft365.css` 及其继承的基础控件样式。它取代先前深蓝导航与金黄色选中标记的视觉约定；业务模块、权限及资料约束继续按现有实现。本文件描述视觉实现；生产部署与真实账号验收以发布记录为准。

**Key Characteristics:**
- 连续的浅色应用外壳，内容优先。
- Segoe UI 字体、紧凑字阶与清晰中文回退。
- 蓝色轨道与文字共同表达选择，状态保留文字。

## Colors

蓝色用于操作、键盘焦点和当前选择；蓝、紫、橙、绿分别用于客户、重点客户、报价和成交指标。中性深色承担正文，白底保留给需要逐行阅读的表格。

### Primary
- **Fluent 操作蓝**：主按钮、选中轨道及焦点；悬停使用更深的主色变体。
- **选中文字蓝**：浅蓝导航、徽标与页签的当前文字。
- **浅蓝选择面**：导航选中背景；徽标与选中指标使用更淡的提示面。

### Neutral
- **浅蓝画布 / 工作面白**：分别用于画布，以及通栏、表格与内容面板；导航使用更浅的蓝白底。
- **正文炭灰 / 次要深灰 / 提示灰**：分别用于主要内容、导航和次要说明。
- **分隔灰 / 字段边线 / 字段底线**：区分容器边界与可输入控件。

**The Selection Rule.** 当前选择同时保留文字及蓝色边轨或底线；业务状态继续使用现有文字和语义色，不能只靠颜色解释。

### Data and progress
- 客户指标为蓝，重点客户为紫，报价为橙，成交为绿；同类指标保持同色，不以数值高低随机换色。
- 流程未开始为灰蓝，进行中为蓝，已完成为绿，等待确认或暂停为琥珀色，异常、逾期及需协调为红。每个状态保留文字，计划总表和流程总表提供图例。
- 业务阶段和执行状态分开解释：方案设计/合同确认用紫，项目下单用蓝，玩具下单用青，生产用橙，出货/运输用天蓝，待安装用粉；阶段色不代表已经完成该阶段。
- 待核实的金额仍显示待核实；颜色不补造完成率、到账或进度。

## Typography

正文与标题共用前置 Segoe UI Web 的字体栈。常规与半粗字体来自 Microsoft 公共 CDN，优先使用本机 Segoe；中文由系统字体回退，不声称西欧字库覆盖中文。字体采用 swap，加载过程不阻塞文字。

页面标题使用 headline，分区标题使用 title，正文使用 body；表头及辅助信息使用紧凑的 label 字阶，表格正文为 13px。桌面与手机页面标题均保持 24px / 32px，手机输入控件文字为 16px。登录宣传标题另使用 36px、窄屏 28px，不扩展为业务页默认字阶。数值沿用等宽数字特性。

## Layout

桌面通栏固定在顶部，高 56px；左侧导航宽 224px，自通栏下方延伸。内容区左侧让出导航，常规留白为上下 24px、左右 28px。721–1100px 时导航缩为 200px，内容留白为 20px。

管理、销售、运营、CEO 和跟单页面共用标题字号令牌，避免懒加载样式将标题改回旧字号。客户沟通、合同、账号设置与弹窗继承同一字体、面板圆角和蓝色操作态。

720px 及以下保留顶部通栏，导航转为带遮罩的抽屉，宽度为 `min(280px, 85vw)`。内容留白为上下 16px、左右 12px；按钮及常规单行字段至少 44px 高，桌面字段为 34px。宽表格继续在自身区域横向查看。聊天工作区以视口减去通栏高度限制可用高度。模块内部已有布局与窄屏业务摘要仍由各自表面约定负责。

## Elevation & Depth

常规工作面平放，以白与浅灰的色面、细边线区分层级，不给普通面板添加装饰性阴影。导航用左侧内嵌蓝轨，页签用底部内嵌蓝线；移动抽屉遮罩采用黑色 28% 透明度。已有弹层保留自身行为与层级。

## Shapes

控件、徽标及表格外框使用轻微圆角，面板与常规指标容器使用较大的面板圆角；嵌套面板及手机销售摘要行采用直角，避免重复容器层级。边框通常为单像素。

## Components

- **按钮**：主按钮蓝底白字、半粗；普通按钮白底正文色。通用按钮继承紧凑内边距，工作区最小高度 32px，具体模块可以更高。悬停切换底色；文字操作悬停显示下划线。禁用态保留既有透明度及不可用指针。
- **字段**：浅色边线配较深底线，聚焦时底线转蓝。键盘焦点使用 2px 蓝色外框及 2px 偏移。
- **导航**：顶层 18px 线性图标、常规字重；当前项使用浅蓝面、半粗蓝字及 2px 左侧蓝轨。子项缩进并维持层级。手机菜单与关闭入口继续使用现有可访问名称及模态行为。
- **页签**：以文字与 2px 蓝色底线表达当前项，常规项为提示灰，间距 24px。
- **面板与表格**：白色面板、细灰边框，常规内边距及底部间距为 16px，手机内边距 12px。表头为浅蓝色面，行悬停使用浅蓝提示底；表格正文保持白底深字。
- **徽标**：普通提示采用浅蓝面与蓝字；项目阶段、计划节点、跟单任务与客户状态共用 StatusBadge，保留状态文字并遵守上面的类别和流程语义。

按钮颜色变化持续 120ms、ease-out；减少动态效果偏好下取消该过渡。

## Do's and Don'ts

### Do:
- **Do** 保留原版 YIFUN LIFE Logo、业务入口、资料与权限边界。
- **Do** 以 `app/microsoft365.css` 的最终覆盖值解释全站外壳；旧表面文档中的深蓝与金黄不再定义全局导航。
- **Do** 保留可见键盘焦点、状态文字及手机触控尺寸。
- **Do** 分开记录本地预览、生产发布和真实账号验收。

### Don't:
- **Don't** 将公司 Logo 替换为 Microsoft 品牌图案，或把界面方向当作 Microsoft 365 服务接入。
- **Don't** 恢复深蓝侧栏与金黄色选中轨道作为当前全局视觉。
- **Don't** 为视觉改版修改业务统计、数据归属或访问权限。
