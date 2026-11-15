# NIKKE 资源规划计算器

[GitHub Pages](https://theifxzx666-blip.github.io/Nikke_Level/) ｜ [WorkBuddy 镜像](https://nikke-level-planner-07475.app.workbuddy.host/?sharecode=YHW5333IQR) ｜ 纯前端 · 无后端 · 数据只存浏览器本地

算「现有资源 + 箱子 + 活动 + 推图收益」能把同步器推到几级、要多少天。计算引擎由 Python 版移植为纯 JavaScript，金标准回归与 Python 版逐项一致（`test_golden.js`）。

## 特性

- **三步分页**：填写 / 目标 / 结果；翻页回到子页第一行
- **设置弹窗**：服务器（国服 / 国际服）、战术学院是否满级、每击歼灭次数、月卡、每种箱留 1 个
- **信息窗**：前哨基地收益、推图奖励、活动收益明细、结果口径说明，都在卡片内展开
- **活动收益**：按日期逐日计入，赠送的箱子参与开箱顺序与全箱梭哈上限
- **结果三页签**：总览 / 收益明细 / 原始数据；明细按 资源 · 固定小时箱 · 自选箱 分块并带道具图标
- 完整表单：关卡两级联动、预计新主线、推图收益计入范围、升级消耗可覆盖、固定小时箱与自选箱
- 导出 JSON 快照 / Markdown 报告，导入导出 XLSX
- 移动端：触控目标 ≥40px、表格横滚、分组可折叠；localStorage 自动记忆 + 手动保存

## 目录结构

```
index.html          # 入口（按序加载 js/*）
tools.json          # 工具导航注册表（shell.js 据此渲染，禁止在 HTML 里硬编码）
css/style.css       # 主样式
css/v16.css         # 分页 / 设置弹窗 / 信息窗 / 收益明细分块
js/core.js          # 解析、消耗、每日收益
js/outpost.js       # 关卡 → 基地等级 + 收益表
js/boxes.js         # 固定箱折算 + 自选箱优化
js/scenarios.js     # 场景评估与总方案
js/events.js        # 活动收益引擎
js/app.js           # 表单联动、计算入口、结果渲染、存储
js/shell.js         # 工具导航外壳
js/v16.js           # 分页与设置弹窗（运行时重排，不改业务代码）
data/*.json         # 关卡 / 收益 / 消耗 / 箱子 / 活动模板
docs/ · test_*.js   # 架构 / 协作 / 部署 / 方案文档 · Node 回归测试
```

## 快速开始

```bash
python -m http.server 8787    # 不要用 file:// 打开，fetch 会被 CORS 拦
node test_golden.js           # 应输出 ALL GOLDEN TESTS PASSED
```

本地开发细节、换背景图、打包分发见 [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)；推送与双端部署见 [`docs/DEPLOY.md`](docs/DEPLOY.md)。

## 数据与口径

关卡表两服共用（Chapter 0~48，基地上限 Lv712）；收益按基地等级查表；开箱折算遵循「先累加总小时、最后统一 floor 一次」。数据来源与核对报告见 [`docs/`](docs/)，架构说明见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。

## 不做什么

- **不做后端**：没有账号系统、没有服务端存储，所有数据只在浏览器 localStorage
- **不上传用户数据**：不采集、不统计、不回传
- **不做自动登录 / 抓包 / 改内存**：只做纯前端计算，不碰游戏客户端
- **不做多语言**：仅中文界面
- **不保证与游戏内实时一致**：数据来自拆包与官方公告，版本更新后可能有延迟

## 更新日志

每次有效改动都记在 [`CHANGELOG.md`](CHANGELOG.md)（按 commit 日期倒序）。改动规范见 [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md)。
