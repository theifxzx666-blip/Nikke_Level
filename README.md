# NIKKE 资源规划计算器 · 纯前端版

[GitHub Pages 公开链接](https://你的用户名.github.io/仓库名/) ｜ 无后端、可离线、localStorage 本地保存

与参考站 [nikke-sr-collection-planner](https://shiki1255.github.io/nikke-sr-collection-planner/) 同款的「通过链接直接访问交互」形态。计算引擎（约 840 行）由 Python 版移植为纯 JavaScript，**金标准回归结果与 Python 版完全一致**（现有 474 / 固定箱后 487 / 全箱梭哈 496 / 不开箱到 481 约 29.8557 天 / 新主线后开箱约 503）。

## 特性

- 完整表单：账号状态、关卡两级联动、困难跟随普通 + 困难上限约束、当前收益与每日收益、预计新主线（默认 +2 章联动）、现有资源、推图资源（计入范围默认只计普通 + 标题/数值随预计新主线联动）、升级消耗（默认阶梯表，可手动覆盖）、固定小时箱（含成长套组）、自选箱
- 浮动进度球 + 12 项明细
- localStorage 自动记忆 + 💾 手动保存按钮，刷新/重启自动回填
- 完整结果展示：4 大数字卡片、最大等级表（单资源 vs 三资源同时）、开箱达成统计、开主线前后对比、501 三方案
- 顶部 NIKKE 主题 banner + body 模糊背景图（`assets/bg/hero.webp` 一键换图，**卡片白底不透明不影响阅读**）
- 移动端全面优化：触控目标 ≥40px、表格横滚容器、超小屏单列、悬浮球贴边、计算后自动定位结果区
- 导出 JSON 快照、Markdown 报告；下载/导入 XLSX（SheetJS CDN）
- 无任何后端、无任何外部登录、无数据上传，**所有数据都存在浏览器本地**

## 目录结构

```
nikke-planner-web/
  index.html          # 单页入口（顺序加载 js/* + CDN xlsx）
  css/style.css       # 样式（含 4 组配色、移动端适配、背景图层）
  js/
    core.js           # 解析、消耗、每日收益（自 calculator/{parsing,level_cost,income} 移植）
    outpost.js        # 关卡→基地等级换算 + 收益表（自 outpost_level 移植）
    boxes.js          # 固定箱折算 + 自选箱优化（自 boxes 移植）
    scenarios.js      # 场景 A-F + 总评估（自 scenarios 移植）
    app.js            # 前端 UI、表单联动、计算入口、结果渲染、存储
  data/
    stage_map.json           # 1699 个关卡编号（普通+困难）
    outpost_income.json      # 700 级基地收益（含战术学院满级）
    level_cost_table.json    # 每 50 级一档的升级消耗
    box_definitions.json     # 箱子定义
    stage_clear_resources.json  # 推图资源（37-38 章实测）
  assets/
    bg/hero.webp            # 顶部 banner + body 模糊底图的背景图（355KB，**换图改这一个文件**）
  test_golden.js            # Node 金标准回归（与 Python 版对比）
  README.md
```

## 更换背景图

背景图支持定期更换，只需替换**一个文件**：

```bash
# 准备一张 1920x1080 左右的高清图（webp/jpg/png 均可，文件 ≤ 5MB）
# 替换 assets/bg/hero.webp，git commit + push 即可
cp /path/to/new-hero.webp nikke-planner-web/assets/bg/hero.webp
git add assets/bg/hero.webp && git commit -m "更换背景图" && git push
```

**无需改任何代码**——`css/style.css` 通过 CSS 变量 `--hero-bg` 引用唯一文件。

**显示规则**：
- 顶部 banner 区：图作为清晰 banner（200px 高，居中顶部对齐，白字叠加）
- body 背景：图模糊 14px 缩放 1.08 倍 + 半透明白色遮罩，作为氛围底色
- 移动端自动去模糊改用更强遮罩，避免低端机卡顿
- 卡片保持白色不透明，**不影响阅读**

**推荐规格**：横版 16:9 或 16:10（人像图建议裁剪为横版，否则会上下黑边），人物图最佳（能呼应 NIKKE 主题）。

## 本地开发/验证

任意静态服务器即可（**不要直接 file:// 打开**，否则 fetch 跨源会被浏览器阻止）：

```bash
cd nikke-planner-web
# 方式一：Python 内置
python -m http.server 8787
# 方式二：Node 一行命令
npx serve -l 8787 .
# 然后访问 http://127.0.0.1:8787/
```

引擎金标准验证：

```bash
node test_golden.js
```

应输出 `ALL GOLDEN TESTS PASSED`。

## 部署到 GitHub Pages（与参考站同款链接）

1. 把 `nikke-planner-web/` 目录上传到一个 GitHub 仓库（例如 `nikke-planner`），根目录包含 `index.html`
2. 在 GitHub 仓库页面 → **Settings → Pages**
3. Source 选 **Deploy from a branch**，Branch 选 `main`（或 `master`）/ `(root)`
4. 保存后等 1-2 分钟，GitHub 会分配一个公开链接：

   ```
   https://你的GitHub用户名.github.io/仓库名/
   ```

5. 把这个链接发给其他用户，他们即可通过浏览器直接访问（PC / 手机均可）

### 替代：直接下载压缩包本地预览

```bash
# 压缩整个目录（不包含 .git）
zip -r nikke-planner-web.zip nikke-planner-web/
# 用户解压后用上面「本地开发」的方式启动
```

## 更新数据

- 调整基础数据：修改 `data/*.json`，GitHub commit 后 GitHub Pages 会自动重新部署（约 1 分钟）
- 调整表单默认值/字段：修改 `index.html` + `js/app.js`

## 引擎一致性保证

`test_golden.js` 用与 Python 版完全相同的金标准输入（2026-08-05 快照），断言输出数值与 Python 引擎一致：

| 场景 | Python 输出 | JS 输出 |
| --- | --- | --- |
| bare 等级 | 474 | 474 |
| fixed 等级 | 487 | 487 |
| selectable 等级 | 496 | 496 |
| no_box 天数 | ~29.8557 | 29.8557 |
| future.result 等级 | 503 | 503 |

未来 Python 引擎更新时，移植到 JS 端用同一组数据对比即可快速校验一致性。

## 已知限制

- 纯前端解析 XLSX 依赖 SheetJS CDN（`xlsx.full.min.js`）。**首次访问需联网**；缓存后离线可用
- 关卡进度 / 收益数据来自当前数据集（约 1699 关 + 700 级基地），随游戏更新可能需要刷新 `data/` JSON
- localStorage 按域名隔离（同一浏览器访问不同站点数据互不影响）；同一站点不同浏览器也不共享
- 暂未实现：批量升级区间总需求（page 字段已在表单中预留，需要时可接入）