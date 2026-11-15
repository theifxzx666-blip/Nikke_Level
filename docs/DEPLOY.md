# 部署与双端同步

> 两个托管必须**一起**更新，只推一端视为未发布。

## 两个地址

| 端 | 地址 | 触发方式 |
|---|---|---|
| GitHub Pages | https://theifxzx666-blip.github.io/Nikke_Level/ | `git push origin main`，30~60s 生效 |
| WorkBuddy | https://nikke-level-planner-07475.app.workbuddy.host/?sharecode=YHW5333IQR | 在 WorkBuddy 会话里用 sites 能力 deploy（见下） |

WorkBuddy 应用 ID：`wbapp_Jf0Q8SP3b2SJ91mSeeDgtL`。
旧应用 `wbapp_Gg6VAj3R43dpJZtGByLF2T`（`nikke-level-planner.app.workbuddy.host`）已 403 失效，不要再引用。

## 推送 GitHub

```bash
git status --short          # 核对，只 add 具体文件
git add <具体文件>
git commit -m "..."
git -c credential.helper= -c credential.helper=wincred push origin main
```

`credential.helper` 必须这样覆盖：本机全局配了交互式 `credential.helper-selector`，直接 `git push` 在非交互环境会卡住。

## 同步 WorkBuddy 镜像

镜像目录是发布源，`deploy` 的目标由它反查，**不读本地 genie**。

```bash
git archive HEAD | tar -x -C <镜像目录>      # 从 HEAD 重建，保证与仓库一致
```

随后在 WorkBuddy 会话里调用 sites deploy，参数要点：

- `directory` = 镜像目录绝对路径（路径写死过，**改名会换掉分享链接**）
- `entryHtml` = `index.html`（该目录里还有 mobile / ledger / combat_reroll 等多个页面，不给会指错）
- `userAskedToPublish` 只在用户本轮明确要求发布时置 true

同步后建议比对关键文件（行尾差异需归一化 `\r\n`→`\n` 再比 md5），确认镜像与仓库逐字节一致。

## 上线前必做

1. 跑测试：`test_golden` / `test_event_units` / `test_box_gain` / `test_keep_one_box` / `test_monthly_card` / `test_stage_clear`
2. 脚本语法：`node --check js/*.js`；CSS 大括号平衡
3. 本地起静态服务实际点一遍计算
4. **写更新日志**（见 `docs/CONTRIBUTING.md`）
5. 上线后两端各打开一次，确认外壳、计算结论、控制台无报错

## 两个已知坑

**1. 页面外壳不能只等 `window.load`**

`js/v16.js` 负责分页与设置弹窗。第一版在 `load` 事件里启动，结果 GitHub Pages 上 `document.readyState` 长时间停在 `interactive`（字体 / Supabase 等外部资源慢），`load` 永不触发，整页停在没分页的原始形态，而 WorkBuddy 正常——很容易误判成"只推了一半"。

现做法：`DOMContentLoaded` 启动 + `load` + **3 秒超时**三保险，`bootOnce()` 去重；仍用 `setTimeout(…, 0)` 让出这一轮，保证晚于 `app.js` 对 `#formSection` 的事件绑定。

**2. 图标在仓库里走真实路径**

单文件预览版用构建时注入的 `window.__NK_ICONS__`（data URI）；线上没有这个变量，`js/v16.js` 回退成 `assets/<name>.webp`（`mbox_30d` 是 `.jpg`），目录从页面已有的 `img.res-icon` 反推。改图标逻辑时两条路径都要顾。

## 用户数据

- localStorage 键：`nikke_planner_form_v1`（**不要改**）
- 字段 id 全部沿用；`collectForm()` / `loadForm()` 按 id 读写，元素被搬进设置弹窗也能正常保存
- 换域名会导致该域名的 localStorage 读不到（浏览器按域名隔离），换域名前提醒用户先在旧站导出
