# NIKKE 资源规划计算器

《胜利女神：NIKKE》前哨基地的升级与收益规划工具。纯静态站点，无后端，所有计算与数据都留在浏览器本地。

线上地址：

| 站点 | 地址 |
|---|---|
| GitHub Pages（主站） | https://theifxzx666-blip.github.io/Nikke_Level/ |
| WorkBuddy 镜像 | https://nikke-level-planner.app.workbuddy.host/ |

## 功能

入口是 `index.html`，它读取 `tools.json` 渲染导航，子工具以 iframe 懒加载。新增工具只需在 `tools.json` 注册并放好页面，外壳不必改动。

| 工具 | 入口 | 说明 |
|---|---|---|
| 资源规划计算器 | `index.html`（内联视图） | 核心工具。录入账号状态与关卡进度，推算升到目标等级要多久、现在开箱还是等开放日 |
| 收益账单 | `ledger.html` | 把一份快照摊成逐日进项账，按周期汇总箱子数量与资源来源 |
| 定制模组统计 | `mod_stats.html` | 长期记录每日 Boss 掉落，统计直接模组、理论模组与碎片期望 |
| 头像预览 | `avatar/index.html` | 头像 / 头像框 / 挂件素材预览 |
| 洗词条计算器 | `reroll_calculator.html` | 词条洗练概率与消耗，支持导入 Excel |
| 战力计算 Beta | `combat_power_beta/index.html` | 战力构成核算 |

另有半独立的 `combat_reroll.html`（洗练战力 / Pinkuro 导入），不挂在主站导航里，需要本地启动 `pinkuro_server.py` 作代理才能连第三方接口。

移动版是独立入口 `mobile.html`，与桌面版共用 `js/app.js`，只换布局与样式；访问哪个由链接决定，不按 UA 自动跳转。

## 目录结构

```
index.html            外壳入口：导航渲染 + iframe 懒加载 + 高度自适应
mobile.html           移动版外壳
tools.json            工具注册表（导航与视图容器的唯一来源）
ledger.html           收益账单页
mod_stats.html        定制模组统计页
reroll_calculator.html  洗词条计算器
combat_reroll.html    洗练战力（独立页，需本地代理）

css/style.css         桌面样式
css/mobile.css        移动端覆盖

js/shell.js           外壳：导航、iframe 管理、高度自适应
js/app.js             计算器 UI：表单联动、计算入口、结果渲染、本地存档
js/core.js            常量、速率解析、升级消耗、每日收益
js/outpost.js         关卡进度 → 基地等级 + 基地收益表查询
js/servers.js         服务器档案与存档版本迁移
js/boxes.js           固定小时箱折算、自选箱优化
js/scenarios.js       场景评估与目标求解
js/events.js          活动收益置入与活动模板
js/ledger.js          收益账单口径（主页与 ledger.html 共用）
js/sync.js            账号云同步（Supabase）
js/errlog.js          错误码字典与上报
js/overload_combat_core.js  洗练战力计算内核

data/                 基础数据：关卡表、基地收益、升级消耗、箱子定义、活动模板
assets/               图片、字体子集、图标
avatar/               头像预览子页及其素材
combat_power_beta/    战力计算 Beta 子页
calculator-assets/    洗词条计算器用的 ExcelJS
scripts/              数据构建脚本
docs/                 架构说明、协作流程与数据口径
test_*.js             引擎回归测试
```

## 本地运行

页面用 `fetch` 读取 `data/*.json`，直接双击 `file://` 打开会被浏览器拦跨源，需要起一个静态服务器：

```bash
python -m http.server 8787
# 或
npx serve -l 8787 .
```

然后访问 http://127.0.0.1:8787/ 。

## 测试

不依赖测试框架，装有 Node 即可运行：

```bash
node test_golden.js        # 引擎金标准回归
node test_server_split.js  # 分服口径：关卡规模、基地公式、存档迁移
node test_ledger.js        # 账单聚合
node test_mod_stats.js     # 模组统计的期望与记录归一化
```

其余 `test_*.js` 覆盖开箱策略、活动模板、月卡、推图收益、洗练战力等分支，脚本自行输出汇总。

## 数据与口径

- 关卡表、基地收益、升级消耗等基础数值都在 `data/`，改数字不需要动代码。
- 分服差异（每周重置日、装备经验保存比例、收益补正系数）集中在 `data/servers.json`；关卡表两服共用同一套。
- 计算口径与官方拆包数据的核对过程见 `docs/`。

## 文档

| 文档 | 内容 |
|---|---|
| `docs/ARCHITECTURE.md` | 模块职责、数据流、改代码时必须守住的不变量 |
| `docs/CONTRIBUTING.md` | 提交与发布流程、版本号规则、双端验证要求 |
| `docs/主线推图收益-官方拆包数据说明.md` | 推图收益的数据来源与折算 |
| `docs/活动模板-官方拆包数据核对报告.md` | 活动模板四档的参数来源 |
| `docs/活动扫荡芯尘盒-核对报告.md` | 活动扫荡产出核对 |
| `docs/开箱收益对比-为什么是0级.md` | 开箱时机的差异分析 |
| `docs/外部计算器对照与数据源分析.md` | 与同类外部工具的口径对照 |
| `docs/错误上报-建表.sql` | 错误上报表的建表语句 |

## 说明

本项目是非官方的玩家自建工具，不与游戏服务器交互，不读取也不上传游戏账号数据。计算结果基于公开数据与社区实测，随游戏版本变化可能需要更新 `data/` 下的数值。

浏览器本地的存档键（`nikke_planner_form_v1`、`nikke_mod_stats_v3` 等）属于对外契约，改名等于让所有存量用户的数据失效；升级格式请走存档内部的 `_schema` 字段。
