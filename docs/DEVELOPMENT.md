# 本地开发与维护

> README 只留入门信息，操作细节都在这里。

## 本地起服务

纯静态，任意 HTTP 服务即可。**不要用 `file://` 直接打开** —— `js/app.js` 会 `fetch("data/*.json")`，`file://` 下被 CORS 拦掉，页面会卡住。

```bash
python -m http.server 8787
# 或
npx serve -l 8787 .
# 打开 http://127.0.0.1:8787/
```

## 跑测试

```bash
node test_golden.js          # 金标准回归，必须 ALL PASSED
node test_event_units.js     # 活动收益
node test_box_gain.js        # 箱子边际收益
node test_keep_one_box.js    # 每种箱留 1 个
node test_monthly_card.js    # 月卡
node test_stage_clear.js     # 推图收益
```

## 换背景图

替换**一个文件**即可，`css/style.css` 通过 CSS 变量 `--hero-bg` 引用它：

```bash
cp /path/to/new-hero.webp assets/bg/hero.webp
```

显示规则：顶部 banner 用原图（200px 高、居中顶部对齐），body 背景用同图模糊 14px + 1.08 倍缩放 + 半透明白遮罩；移动端去模糊改用更强遮罩。卡片始终白色不透明，不影响阅读。

推荐 16:9 或 16:10 横版、文件 ≤5MB、人物图最佳。人像图请先裁成横版，否则会有黑边。

## 打包分发

```bash
zip -r nikke-planner-web.zip . -x ".git/*"
```

用户解压后按「本地起服务」的方式打开。

## 版本号

`?v=YYYYMMDDx`（x 为当天序号 a/b/c…），只升改过的文件。详见 `docs/CONTRIBUTING.md`。

## 已知限制

- 解析 XLSX 依赖 SheetJS CDN（`xlsx.full.min.js`）：首次需联网，缓存后离线可用
- 关卡与收益数据随游戏版本更新，需定期刷新 `data/*.json`
- localStorage 按域名隔离：不同域名、不同浏览器之间不共享
- 换域名会导致旧域名的本地存档读不到，换之前提醒用户先在旧站导出 JSON

## 部署

双端同步流程（GitHub Pages + WorkBuddy）、appId、上线前的坑，见 `docs/DEPLOY.md`。
