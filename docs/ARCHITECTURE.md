# 架构说明

面向接手这个仓库的人（含 AI 工具）。这里记录**模块边界**与**不能碰的不变量**；具体怎么提交、怎么发布见 `CONTRIBUTING.md`。

## 一、整体形态

纯静态站点，没有构建步骤，没有服务端。浏览器直接加载 `index.html`，所有数据在 `localStorage`，云同步是可选功能（直连 Supabase）。

```
index.html / mobile.html          外壳：读 tools.json → 渲染导航 → iframe 懒加载子工具
        │
        ├─ ledger.html            ┐
        ├─ mod_stats.html         │  子工具页，各自独立可访问
        ├─ reroll_calculator.html │
        ├─ avatar/index.html      │
        └─ combat_power_beta/     ┘
```

桌面与手机共用同一套 `js/app.js`，只有 HTML 结构和 `css/mobile.css` 不同。改交互逻辑时**两边会同时生效**，改布局要分别看两个入口。

## 二、模块职责

| 文件 | 职责 | 边界 |
|---|---|---|
| `js/shell.js` | 导航渲染、iframe 创建与高度自适应 | 不得硬编码任何工具，工具清单只在 `tools.json` |
| `js/app.js` | 表单联动、计算入口、结果渲染、本地存档 | 不做数值计算，一律调下面的引擎模块 |
| `js/core.js` | 常量、速率解析、升级消耗、每日收益 | 数值基础层，不依赖任何 DOM |
| `js/outpost.js` | 关卡进度 → 基地等级 → 基地收益表 | 关卡换算的唯一来源 |
| `js/servers.js` | 服务器档案、存档版本迁移 | 分服差异只在这里 |
| `js/boxes.js` | 固定小时箱折算、自选箱优化 | 只算「箱子能换多少资源」，不负责并入 |
| `js/scenarios.js` | 场景评估与目标求解 | 串联上面几层，输出可展示的结论 |
| `js/events.js` | 活动收益置入、活动模板 | 活动产出的唯一来源 |
| `js/ledger.js` | 收益账单的聚合口径（逐日、周期、箱子构成） | **聚合唯一来源**，页面不得自算 |
| `js/sync.js` | 账号登录、上传/下载、备份与结构校验 | 只管 `localStorage`，不侵入 `app.js` |
| `js/errlog.js` | 错误码字典与上报队列 | 错误码集中在一处定义 |
| `js/overload_combat_core.js` | 洗练战力计算内核 | 供 `combat_reroll.html` 使用 |

## 三、数据文件

| 文件 | 内容 |
|---|---|
| `data/stage_map.json` | 关卡编号表，普通 / 困难各一章一套 |
| `data/servers.json` | 服务器档案：关卡上限、基地上限、分服差异字段 |
| `data/outpost_income.json` | 基地各等级每小时产出 |
| `data/level_cost_table.json` | 每 50 级一档的升级消耗 |
| `data/box_definitions.json` | 箱子定义 |
| `data/stage_clear_resources.json` | 主线推图收益 |
| `data/event_templates.json` | 活动模板（四档） |
| `data/overload_combat_data.json` | 洗练战力数据 |

## 四、不变量

改代码前先读这一节，这些是踩过坑才定下来的。

1. **工具注册表只有 `tools.json`**。`index.html` 里不许出现硬编码的工具按钮或容器。每个工具的 `viewId` 必须与 `css/style.css` 的容器选择器一致，否则容器拿不到样式（头像预览曾因此被压成 0 高）。`shell.js` 用 `?ts=` + `no-store` 拉取它，**改 `tools.json` 不需要升 `?v=`**。

2. **`localStorage` 的键是对外契约，不许改名**。`nikke_planner_form_v1`、`nikke_mod_stats_v3`、`nikke_power_calc_v2`、`nikke_reroll_state_v1` 这些键一旦改动，等于所有存量用户的数据失效。格式升级走存档内部的 `_schema` 字段，迁移只加字段、不删字段。

3. **口径只有一个来源**：账单一律读 `js/ledger.js` 的聚合结果，活动产出一律读 `js/events.js`，关卡换算一律读 `js/outpost.js`。页面里再写一套聚合，迟早会和主引擎对不上。

4. **箱子的并入点唯一在调用方**。`boxes.js` 只回答「这批箱子值多少资源」，不负责把它加到总账上；任何在 `boxes.js` 内部叠加的做法都会导致重复计入。

5. **现状口径不含推图收益**。推图收益只在「预计新主线」场景里计一次，其他位置不重复计入。

6. **单位**：信用点与战斗数据的内部口径是绝对值。以 K 存储的数据（如 `stage_clear_resources.json` 的 `credit` / `battle`）进管线前必须 ×1000；芯尘的单位是「个」，不做换算。

7. **数据文件 `fetch` 必须带 `?v=`**。Pages 与浏览器都会缓存 `data/*.json`，不带版本参数时改了不生效。

8. **不加载任何外部域名资源**。第三方库一律放 `assets/js/vendor/`（ExcelJS 放在 `calculator-assets/`），字体走本地子集。页面唯一的外网请求是 Supabase 接口本身。

9. **桌面与手机同源**。`index.html` 与 `mobile.html` 共用 `js/app.js`，改一处必须两端都验。

## 五、账号云同步

- `js/sync.js` 用 Supabase 邮箱 + 密码登录，数据落在 `sync_data` 表，受 RLS 保护。
- 每个功能独立上传 / 下载，互不牵连。下载（用云端覆盖）前会自动把本地现状备份一份，面板里可一键回滚。
- 上传前有两道提示：云端记录条数比本地多时会二次确认；云端存档的数据日期比本地新时也会确认。
- 云端数据结构异常或版本过新时直接拒绝写入，不做猜测性迁移。

## 六、扩展一个新工具

1. 把页面放进仓库根或子目录。
2. 在 `tools.json` 的 `tools` 数组里加一项，指定 `id` / `name` / `icon` / `entry` / `viewId`（`viewId` 与 CSS 保持一致）。
3. 在 `css/style.css` 里补上对应的容器样式。

导航、iframe 懒加载、高度自适应都由 `shell.js` 处理，不需要改外壳代码。
