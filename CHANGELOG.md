# NIKKE 资源规划计算器 · 更新记录

> 按 commit 日期整理，同日合并；仅收录有效落地内容，重复微调 / 缓存版本号递增 / 中间过渡提交不单独列出。
> 线上地址：https://theifxzx666-blip.github.io/Nikke_Level/

---

## 2026-11-20（第三十七轮）

**R96.1 · 修「进页面就报错」+ 顶栏三按钮整理 + 日历与日期选择器重名冲突**

### 一、三个问题

| # | 用户反馈 | 根因 |
| :-: | :--- | :--- |
| 1 | 进页面弹「数据加载失败：`restoreFromShareHash is not defined`」 | R96 删跨设备同步时，删了 `restoreFromShareHash()` 的**定义**，漏了两处**调用**：`bindEvents` 里的 `hashchange` 监听、`init` 末尾的 `#data=` 恢复。后者在 `.then()` 末尾抛错，被 `.catch` 接住弹出该提示 |
| 2 | 保存 / 账号同步 emoji 与位置 | 「保存当前表单」带 💾、「账号同步」带 👤；`.hero-toolbar` 是 `flex-direction: column`，三个按钮 + 一个空 `saveTip` 竖着堆，且「设置」是 30px 齿轮圆钮、账号同步是绿底实心，三者形状颜色都不统一 |
| 3 | 定制模组日历视图显示异常 | **日历早就存在**：`mod_stats.html` 有日期选择弹窗（`.calendar-pop` / `#calGrid` / `#calTitle` / `changeMonth()`）。R95 新增历史日历时用了**同名 class**（`.cal-nav` / `.cal-grid` / `.cal-week` / `.cal-cell`）和**重复 id `calTitle`**，还定义了**同名函数 `renderCalendar`** —— 同一 script 内后声明覆盖先声明，于是历史日历的渲染代码被日期弹窗的版本顶掉，永远渲染到 `#calGrid` 而不是 `#histCalGrid`；`calTitle` 也只剩第一个生效，日期弹窗标题不再更新 |

### 二、改动

| # | 文件 | 改了什么 |
| :-: | :--- | :--- |
| 1 | `js/app.js` | 删掉 `window.addEventListener("hashchange", restoreFromShareHash)` 与 `init` 末尾的 `restoreFromShareHash()` 调用 |
| 2 | `index.html` / `sync.js` / `js/v16.js` | 「💾 保存当前表单」→「保存当前表单」；「👤 账号同步」→「账号同步」；「设置」齿轮 SVG → 纯文本按钮 |
| 3 | `css/style.css` | `.hero-toolbar` 由 `column` 改 `row` + 右对齐 + 统一 `min-height: 34px`；用 `order` 固定顺序（保存 → 账号同步 → 设置，因 JS 是 `appendChild`，执行顺序不定）；删掉跨设备同步区块里遗留的 `.hero-toolbar { flex-wrap: wrap }` 补丁；删掉从未写入过的空 `#saveTip` 节点 |
| 4 | `js/sync.js` | `.nk-acc-btn` 由绿底实心改白底绿字描边，与主按钮「保存」拉开层级 |
| 5 | `css/v16.css` | 删除不再使用的 `.v3-gear` |
| 6 | `mod_stats.html` | 历史日历全套改名加 `hcal-` 前缀：`.hcal-top` / `.hcal-nav` / `.hcal-week` / `.hcal-grid` / `.hcal-cell` / `.hcal-hint` / `.hcal-legend` / `.hcd` / `.hcp`，id 改 `histCalTitle` / `histCalPrev` / `histCalNext`，函数改 `renderHistCalendar()`。**日期选择弹窗的 `.cal-*` 与 `renderCalendar()` 一字未动** |
| 7 | `test_mod_stats_calendar.js` | 同步改名（调用 `renderHistCalendar`、断言 `hcal-cell` / `hcd` / `hcp`） |
| 8 | 版本号 | `style.css` `v16.css` `app.js` `v16.js` `sync.js` `mobile.css` `mod_stats` 入口 → `20261120d` |

### 三、验证

| 项 | 结果 |
| :--- | :--- |
| 残留符号 | `restoreFromShareHash` **0 引用**；`mod_stats.html` 重复 id **0**、重复函数定义 **0** |
| DOM 引用完整性 | `app.js` 里 `$("id")` / `byId('id')` 引用的 39 个 id，页面全部存在（0 缺失） |
| 未定义调用 | 静态扫描 app.js 全部函数调用，除 `html2canvas` / Promise 回调参数外无未定义 |
| 语法 | `node --check` 通过（app / v16 / sync / mod_stats 内联脚本） |
| 测试 | 13 个文件全过，含 `test_mod_stats_calendar` **19/19**、`mod_stats` 27/27、`server_split` 124/124、`ledger` 40/40 |

> 教训：**同名函数在同一 script 里后声明覆盖先声明，不报错、不警告**。给已有页面加功能前，先 `grep` 目标 class / id / 函数名，别假定新名字没人用。

---

**R96.2 · 线上看不到新代码：index.html 补防缓存声明 + 版本号换新 + 6 个文件行尾复原**

### 一、用户反馈

> workbuddy 的链接还没修复（进页面仍弹 `restoreFromShareHash is not defined`）

### 二、根因

| # | 现象 | 根因 |
| :-: | :--- | :--- |
| 1 | WorkBuddy 链接进页面仍报旧错 | R96.1 只 commit 进仓库并同步到发布源，**没有重新部署**：线上最后一次部署是 04:12，发布源文件更新于 09:08。且云端网关对 html / js 不返回 `Cache-Control`，浏览器按 Last-Modified 做启发式缓存，直接复用旧 `index.html`（旧版本参数 → 旧 app.js） |
| 2 | `nikke_src` 里 6 个文件成了 LF | 历史编辑把 CRLF 写成 LF，与全站 CRLF 规范不一致；文本内容本身无差异 |

### 三、改动

| # | 文件 | 改了什么 |
| :-: | :--- | :--- |
| 1 | `index.html` | `<head>` 的 charset 之后补 3 行防缓存声明（`Cache-Control: no-cache, no-store, must-revalidate` / `Pragma: no-cache` / `Expires: 0`），避免「部署了但用户看到旧页面」反复发生 |
| 2 | `index.html` `mobile.html` `mod_stats.html` | 版本号 `20261120d` → `20261120e`（10 处），把 css / js 的 URL 全部换新，绕开浏览器里已缓存的旧 `app.js?v=20261120d` |
| 3 | `mod_stats.html` `ledger.html` `combat_reroll.html` `js/errlog.js` `js/ledger.js` `js/overload_combat_core.js` | 行尾 LF → CRLF（纯字节修正，0 行内容改动） |
| 4 | `test_challenger.js` | 回归测试对齐现状：断言从已删字段 `plan.challenger_index` 改为从方案 `selectable` 的 `choices` 反解下标；第 2 组去掉已删的 `solveWithChallenger()` 对照，第 6 / 7 组（依赖 `solveWithChallenger` / `gapHours`）标注跳过，口径由 `test_challenger_pref.js` 覆盖 |

### 四、验证

| 项 | 结果 |
| :--- | :--- |
| 线上与发布源一致 | 从线上取回 `js/app.js` md5 `ba7cb321…`、`js/v16.js` md5 `c40e71c8…`，与发布源逐字节相同 |
| 残留符号 | 线上 `js/app.js` 中 `restoreFromShareHash` **0 处** |
| 脚本可达性 | `index.html` 引用的 9 个 js 全部 HTTP 200（app / boxes / core / events / outpost / scenarios / shell / sync / v16） |
| 行尾 | `nikke_src` 全站 0 个 LF 文件（未跟踪的 `__verify_harness.html` 除外）；`git diff --stat` 仅 index.html 的 +3 行与新版本号 |
| 测试 | 15 / 15 全过（`test_challenger.js` 此前因读已删字段长期红，本轮一并修好） |
| 两端 | GitHub `main` 与 `origin/main` 0/0；WorkBuddy 重新部署后 `Last-Modified` 随之更新 |

---

**R97 · 补字体子集 + 资源摸底 / 节点统计 / 结果页共 8 项**

### 一、用户需求

> 看下用不用补齐荆南麦圆体，部分文案没有对应字体
> 资源摸底：移除 4 处文案 / 歼灭次数文案精简 / 月卡改「月卡自动计入」并与挑战者箱选择同排 / 分页按钮改「下一步」
> 节点统计：预计普通、困难主线关卡分上下两行
> 结果输出：两个目标划分更清楚 / 信息窗就近显示 / 挑战者箱要展示选了什么 / 删「现状可达（…）」改 √× / 去掉重复的箱数

### 二、改动

| # | 文件 | 改了什么 |
| :-: | :--- | :--- |
| 1 | `assets/fonts/maiyuan-subset.*` | **字体子集重建**：上一版只覆盖 1508 码位，全站可见文案里 **111 个常用汉字**（丢、争、尽、帮、废、弱、门、释、钥…）不在子集内，会掉到系统字体 —— 这就是「部分文案不是麦圆体」的根因。用全量 `maiyuan.ttf` 重新子集化，覆盖 1569 码位，**汉字 100% 覆盖**（只剩 ⚠✅❌ 这类 emoji 回退，属正常）。woff2 306KB（+22KB） |
| 2 | `css/style.css` | 字体 url 加 `?v=20261120f` —— 文件名不变时浏览器会一直吃旧字体缓存；注释写明重建流程 |
| 3 | `index.html` | 删「推算口径：每通关 5 关…」长 hint；月卡从「预计新主线进度」搬到「自选箱数量」，标签改「月卡自动计入」，与「挑战者箱资源选择」同排；预计普通 / 困难主线关卡由并排两列改为**上下两行**，行内两个下拉 flex + 8px 间距 |
| 4 | `js/v16.js` | 分页按钮「下一步：推图进度&活动」→「下一步」；歼灭次数信息窗删「免费次数也占一次…」；收益信息窗删「随等级自动带出，可手动覆盖」与「一般不用改…」；月卡不再搬进设置弹窗 |
| 5 | `js/app.js` | 基地等级与推算值一致时不再输出「基地等级 lv.X（收益按此计算）…」（空文案连整行一起隐藏）；新增 `placeInfoPop()` 让信息窗贴着 i 按钮展开、下方放不下就翻到上方；目标等级旁加 √ / × 并删掉「现状可达（立即可达（今天））」；「挑战者全开 + 固定小时箱」分支补出挑战者的资源选择卡片，并去掉与表尾重复的箱数 |
| 6 | `css/style.css` | `.target-card .summary-block` 各自成块（边框 + 圆角 + 卡片底色 + 10px 间距），两个目标不再靠一条虚线区分 |
| 7 | 版本号 | `style/v16.css`、`app/v16/sync.js`、`mobile.css`、`mod_stats` 入口 → `20261120f` |

### 三、验证

| 项 | 结果 |
| :--- | :--- |
| 字体覆盖 | 新子集 1569 码位；站内 1096 个字符中仅 9 个 unicode emoji 未覆盖（⚠✅✕❌➕⬆⬇、变体选择符与 BOM），**汉字 0 缺失** |
| 语法 | `node --check` app / v16 / boxes / scenarios / sync 全过 |
| 回归 | 15 个测试文件全过（15/15） |
| 文案 | 「一般不用改」「随等级自动带出」「推算口径：每通关」「免费次数也占一次」「下一步：推图进度」全站 **0 处** |
| 结构 | 「月卡自动计入」「v3-stage-pair」「sb-mark」「placeInfoPop」均已落地 |
| 行尾 | 所有改动文件保持 CRLF（`git diff --stat` 无假改动） |

> 边界：本机无浏览器自动化，UI 效果仅做语法 + 符号 + 结构静态校验，未跑真实渲染。
> 字体重建命令留在 `等级计算/临时车间/build_charset.py`，文案改动后重跑一次即可。

---

**R98 · 关卡下拉标「末关」+ 与两个参考站对表（国服差 1 级事件）**

### 一、用户反馈

> 我是国服的账号，但是按这个计算器去推算，跟我的等级对不上
> （手填 589，推算 588；普通 Chapter 42 / 42-44 BOSS，困难 Chapter 40 / 40-35）

### 二、核对过程

| 项 | 结果 |
| :--- | :--- |
| 公式复算 | (1523 − 19) + 1434 + 1 = 2939 → ⌊2939/5⌋+1 = **588**，与页面一致 |
| 换成困难 40-36 BOSS | (1523 − 19) + **1435** + 1 = **2940** → **589**，与游戏内一致 |
| 关卡表比对 | 与 nikkeoutpost.netlify.app 的 `chapters.json` 逐关比对：**1875 关、id 0 处差异**；Chapter 40 末三关都是 `40-34 / 40-35 / 40-36 BOSS` |
| 公式比对 | 两个参考站（nikkeoutpost / NikkeCalc）都是 `⌊(普通id − 2-12id + 困难id − 0-1id + 1)/5⌋ + 1`，与本站同构 |
| 收益表比对 | Lv589 三方一致：信用点 40.54k / 战斗数据 453.64k / 芯尘 74.18 |
| 结论 | **不是国服/国际服差异，也不是公式错**。第 40 章有 44 关，末关是 `40-36 BOSS`；用户选的是倒数第二关 `40-35`，少 1 关正好跨过 5 的边界 → 差 1 级 |

### 三、改动

| # | 文件 | 改了什么 |
| :-: | :--- | :--- |
| 1 | `js/app.js` | `fillSelect()` 增加可选 `labels` 参数，把「显示文本」与「option value」解耦（value 要保持纯关卡名，否则查不到 id） |
| 2 | `js/app.js` | 关卡下拉给**每章最后一关**加「（末关）」后缀，如 `40-36 BOSS（末关）`、`42-44 BOSS（末关）`。章节内存在 A/B 分叉关（`41-17A-1` 这类），编号不连续，倒数第二关极易被当成终点 |
| 3 | 版本号 | `app.js` 引用 → `20261120g` |

### 四、验证

| 项 | 结果 |
| :--- | :--- |
| 语法 | `node --check js/app.js` 通过 |
| 回归 | 15 个测试文件全过（15/15） |
| 取值不受影响 | `fillSelect` 的 `value` 仍是原始关卡名，`stageId()` 查询路径未变 |

> 只影响显示，不动任何计算口径。

---

**R99 · 用国服拆包表核对关卡口径 + 去掉「国服比国际服多 3 关」的臆测文案**

### 一、用户反馈

> 你这个逻辑很奇怪，参考下 pinkuro.top:9984/nikke/syncLevelCal
> 主要是游戏里我的进度就是按我选的这样，你不能臆想啊

上一轮我断定「用户漏选末关」，属于**在缺数据时下结论**。这轮用拆包表把能查的都查清。

### 二、拆包表核对（母体 B `21_数据表/任务与奖励/原始数据表JSON`）

| 比对 | 结果 |
| :--- | :--- |
| 国服 `CN_sd.bin_CampaignStageTable.json` vs 国际服 `CampaignStageTable.json`，0~32 章逐章实战关数 | **每章 0 差异**（Normal/Hard 双侧累计都是 1036 关） |
| 国际服拆包 0~46 章 vs 本地 `stage_map.json` 逐章关数 | **每章 0 差异**（含 Chapter 40 = 44 关、Chapter 42 = 44 关） |
| 国服包覆盖范围 | 官方第 1~33 章（`chapter_id` 1~33）；**用户所在 40/42 章不在包内** |
| 公式（本站 / nikkeoutpost / NikkeCalc） | 三处同构：`⌊(普通位置 − 2-12位置 + 困难位置 − 0-1位置 + 1)/5⌋ + 1` |
| pinkuro.top:9984 | 该站**不推算基地等级**，基地等级是手填输入框（max 800）—— 与「以手填为准」同一思路 |

**能确定的**：0~32 章国服与国际服关卡结构完全一致，公式三方一致。
**不能确定的**：33 章之后国服是否与国际服有 1 关的结构差 —— 手上没有国服新包，无法验证。
差 1 级的来源只能在 33 章之后，**没有数据就不下结论**（上一轮的错误就在这里）。

### 三、改动

| # | 文件 | 改了什么 |
| :-: | :--- | :--- |
| 1 | `js/app.js` | `#baseHint` 三处文案去掉「国服统计进度约比国际服多 3 关，推算值可能偏高」——这句话没有任何数据支撑，且会让用户以为推算有系统性偏差。改为「与游戏内不一致时以手填为准」 |
| 2 | `js/v16.js` | `paintServerLabel()` 删掉三条对应的替换规则（源文案已不存在），只留「国际服口径 → 国服口径」兜底 |
| 3 | 版本号 | `app.js` / `v16.js` 引用 → `20261120h` |

### 四、验证

| 项 | 结果 |
| :--- | :--- |
| 语法 | `node --check` app / v16 通过 |
| 回归 | 15 个测试文件全过（15/15） |
| 文案 | 「国服统计进度约比国际服多 3 关」全站 0 处 |

> 关卡下拉的「（末关）」标记保留：它不是结论，只是让用户能看清每章最后一关是哪个。

---

**R100 · 结果页分块再分色：达成目标方案 + 即刻飞升都各成一色块**

### 一、用户需求

> 再拆分成2个色块吧，这样看着更明显点。
> 即刻飞升（不做规划，直接梭哈）那个区块也要操作下做跟达成目标方案的处理。

### 二、改动

| # | 文件 | 改了什么 |
| :-: | :--- | :--- |
| 1 | `js/app.js` | 达成目标方案的 `targets.forEach` 加索引，块类名带 `tone-0 / tone-1` 交替；即刻飞升三块固定 ①`tone-0` ②`tone-1` ③`tone-0` |
| 2 | `css/style.css` | `.summary-card .summary-block` 与 `.target-card .summary-block` 统一卡片化（圆角 10px、padding 10/12、块间距 10px、边框）；`.tone-0` = 冷白蓝 `#f3f8fd` / 边 `#d8e7f4`，`.tone-1` = 冷白绿 `#f1faf5` / 边 `#cfe9dc` |
| 3 | 版本号 | `style.css` / `app.js` 引用 → `20261120i` |

配色语义：蓝=现状类（①现状、目标同步器等级），绿=新主线/后续类（②考虑新主线、后续追求目标等级），交替出现便于扫读。

### 三、验证

| 项 | 结果 |
| :--- | :--- |
| 语法 | `node --check js/app.js` 通过 |
| 回归 | 15 个测试文件全过（15/15） |
| 结构 | `summary-block tone-` 在 4 处生成点全部带上 |

> 只动呈现层，计算与文案未改。

---

**R101 · 结果页小类配色回调：同色系一白一淡（撤回跨色系色块）**

### 一、用户反馈

> 有点丑，回退色块调整。参考这个吧，类似大类里再分两个不同颜色的小类。

上一版（R100）把小类做成 `tone-0 冷白蓝 / tone-1 冷白绿`，**跨了色系**：
绿卡里塞蓝块、蓝卡里塞绿块，两种色系混在一起发花。

### 二、改动（`css/style.css`）

| 大类 | tone-0（第一个/第三个） | tone-1（第二个） |
| :--- | :--- | :--- |
| `.summary-card`（即刻飞升 · 绿系） | 白底 `#fff` + 绿边 `#d9ece3` | 浅绿底 `#eefaf5` + 绿边 `#c9e8da` |
| `.target-card`（达成目标 · 蓝系） | 白底 `#fff` + 蓝边 `#d8e6f3` | 浅蓝底 `#eff6fd` + 蓝边 `#c9def2` |

要点：
- **不再跨色系**，每个大类内部只用自己的主色做深浅两档。
- 不加左侧色条：内层 `.box-card` 本来就有 4px 绿色左边条，再加会变成三层叠色。
- 圆角 10px、padding 10/12、块间距 10px 保持不变。

### 三、验证

| 项 | 结果 |
| :--- | :--- |
| 规则落位 | `.summary-card .summary-block.tone-1` / `.target-card .summary-block.tone-1` 各 1 条 |
| 语法 | CSS 无语法改动风险（仅颜色与边框值） |
| 回归 | 15 个测试文件全过（15/15） |

---

**R102 · 结果页小类改用左侧竖条分档 + 删掉与卡片重复的方案文字**

### 一、用户反馈

> 还是不好看，底色我建议都保持一致，左边考虑跟即刻飞升 / 达成目标方案一样，用个带颜色的竖条做下拆分
> 达成目标方案底下有方案了，不用再重复说明

### 二、改动

| # | 文件 | 改了什么 |
| :-: | :--- | :--- |
| 1 | `css/style.css` | 小类块**底色统一（transparent）**，取消圆角卡片与浅色填充；改用 `border-left: 3px` 竖条分档，跟两个大类卡片的 5px 左条同一套语言。粗细递进：大类 5px → 小类 3px → 内层箱卡 4px |
| 2 | `css/style.css` | 两档竖条同色系深浅：`.summary-card`（即刻飞升）`#1d9e75` / `.tone-1` `#86cfb4`；`.target-card`（达成目标）`#185fa5` / `.tone-1` `#7fb3dd` |
| 3 | `js/app.js` | 第 ④ 分支（全箱梭哈可达）的 `boxPlanText` 打 `planVerbose: true`；渲染时若有箱子卡片/固定箱表格就不再输出这段文字 —— 那段话把每个箱子的分配又列了一遍，与下方卡片完全重复 |
| 4 | `js/app.js` | 第 ③ 分支文案压成「方舟 / 30天成长补给箱无需开启」（固定箱表格与挑战者卡片已在下方，不再复述数量） |
| 5 | 版本号 | `style.css` / `app.js` 引用 → `20261120k` |

### 三、验证

| 项 | 结果 |
| :--- | :--- |
| 语法 | `node --check js/app.js` 通过 |
| 回归 | 15 个测试文件全过（15/15） |
| 结构 | 两块共用 `.summary-block.tone-0/.tone-1`，竖条色由大类决定 |

---

**R103 · 补回小类之间那条分隔线**

### 一、用户反馈

> 中间的分界线要保留呀

R102 把小类块的 `border` 整体清零只留左竖条，把原来块与块之间的 `border-top: 1px dashed` 一起冲掉了。

### 二、改动（`css/style.css`）

| 项 | 值 |
| :--- | :--- |
| 块间分隔线 | 恢复 `border-top: 1px dashed`；绿卡 `#d5e7df`，蓝卡 `#d9e6f2`（沿用原配色） |
| 左竖条 | 保留 3px（R102 的成果） |
| 第一块 | `.summary-title + .summary-block` / `.target-title + .summary-block` 不画顶线（否则标题下多一条多余横线） |

### 三、验证

| 项 | 结果 |
| :--- | :--- |
| 规则落位 | 竖条 + 顶线 + 首块豁免三条规则均在 |
| 版本号 | `style.css` 引用 → `20261120l` |

---

**R104 · 小组件补完整边框：大组件包 2 个带框小组件**

### 一、用户需求

> 你可以一个大的组件包裹2个小的组件，组件要有边框线

R102/R103 只给了左竖条 + 虚线，组件本身没有闭合边框，看着还是像"分栏"而不是"卡片"。

### 二、改动（`css/style.css`）

| 项 | 值 |
| :--- | :--- |
| 小组件 | `border: 1px solid` 完整边框 + `border-left: 3px` 竖条 + `border-radius: 10px` |
| 底色 | 统一 `#ffffff`（大组件是渐变底，白卡在上有对比） |
| 绿卡（即刻飞升） | 边 `#d9ece3`，竖条 `#1d9e75`（tone-0）/ `#86cfb4`（tone-1） |
| 蓝卡（达成目标） | 边 `#d8e6f3`，竖条 `#185fa5`（tone-0）/ `#7fb3dd`（tone-1） |
| 块间分隔 | 10px 间距 + 各自边框，不再叠虚线（避免边框与虚线双重线条） |

### 三、验证

| 项 | 结果 |
| :--- | :--- |
| 规则落位 | 基础框 + 两档竖条共 4 条规则 |
| 版本号 | `style.css` 引用 → `20261120m` |

---

## 2026-11-18（第三十六轮）

**R89 · 求解器性能优化：evaluate() 1.96s → 28ms（输出逐字节不变）**

### 一、用户需求

> 检查下计算器的算法规则，看看还有没有什么值得优化的点，没有的话不用强求。

### 二、改动

| # | 文件 | 改了什么 |
| :-: | :--- | :--- |
| 1 | `js/boxes.js` | `fastThreeTwoFlexiblePlan()` 三重枚举改为**等价裁剪**。三项自选箱（方舟 / 30天 / 挑战者）里每箱只贡献一种资源、成本恒为 1 箱，故某项投给某资源的数量一旦超过 `ceil(该资源剩余缺口 / 单箱价值)`，再多的部分全是溢出浪费，不可能出现在「总箱数最少」的解里。据此把上界从 `q3` 压到「按需上界」，86 箱从 **10.6 万组降到约 400 组**。 |
| 2 | `js/boxes.js` | 内层循环去掉 `C.zeroRes()` / `labels3` / `combos` / `remaining` 等每轮新建的对象，改成 3 个数字累加；二选一箱（挑战者）的贡献与条目恒定，提到循环外只算一次。 |
| 3 | `js/boxes.js` | 二选一箱的 `two.left = 0` / `two.choices[...]` 原来写在循环体内就地改；一旦循环没产出方案，被改过的状态会污染后面的贪心兜底。改为**命中方案后才回写**。 |
| 4 | `js/boxes.js` | `auto` 双跑的下标不再写死 `0 / 1`，改用 `challengerIndexForPref(snapshot,"battle"/"dust")` 按奖励内容解析。当前表顺序是 `[战斗数据辑, 芯尘]`，写死虽等价，但上表顺序一旦调整就会静默变成「战斗优先」，与「都可达取芯尘」的口径相反。两个下标相同时只跑一次。 |
| 5 | `js/scenarios.js` | `evaluate()` 里 `scenario_f` 与 `scenario_f_alt` 是**参数完全相同**的两次调用，而 `scenario_f` 全站无人读取 —— 白算一整份（含 `naturalToTarget` 的逐级推进）。改为算一次、两处引用；两个目标等级相同时连 `scenario_f_target` 也复用。 |

### 三、验证

| 项 | 结果 |
| :--- | :--- |
| 输出等价性 | 优化前后各生成 54 条组合基线（4 种箱型组合 × 7 个目标步数 + `evaluate` + `bestEffortPlan`），`json.dumps(sort_keys)` 逐条比对 —— **54/54 完全一致，0 处差异** |
| 性能（Node 22，同一快照） | `evaluate()` **1964ms → 28.0ms（70×）**；`optimizeSelectableForTarget(100步, auto)` 155.6 → 13.0ms；`scenarioF` 260 → 0.8ms；`bestEffortPlan(200)` 1027 → 50.3ms |
| 回归测试 | `test_golden` / `test_box_gain` / `test_stage_clear` / `test_keep_one_box` / `test_event_units` / `test_monthly_card` / `test_overload_combat` / `test_ledger`(40/40) 全过；`test_challenger` 仍因 `solveWithChallenger` 改名而报错（陈旧测试，与本次无关） |
| 边界实验（未落地） | 临时放开 `quantity <= 100` 上限后，大箱量场景 `boxes_used` 完全相同（300 → 300），只是分配次序不同 —— 无收益，**已还原**，不改既有结果 |

---

**R90 · 关卡只能选到 Chapter 48：还原被 `23a23c8` 退回的 51 章关卡表 + 拆回两套起点字段**

### 一、用户需求

> 线上的问题修复了吗？为什么章节关卡只能选到 48 章了？？？

### 二、根因

又是 `23a23c8`（11-13）的批量回退，这次伤的是**数据文件**：

| 文件 | 10-29（R68）正确版 | 被退回成 |
| :--- | :--- | :--- |
| `data/stage_map.json` | 1,875 关 / **51 章（Chapter 0–50）** | 1,787 关 / 49 章（Chapter 0–48） |
| `data/stage_clear_resources.json` | 51 章 / `fallback_chapter: 50` | 49 章 / `fallback_chapter: 48` |

`servers.js` 里的档案一直写着 `chapters: 51 / max_chapter: 50 / base_cap: 747`，但关卡表只剩 49 章 → 下拉框自然只能选到 Chapter 48。

**连带隐患**：10-29 版 `stage_map.json` 的 `normal_start_id` 是 **1**（关卡下拉起点），基地计数起点是独立字段 `base_start_normal_id`（=19）。重构后的 `outpost.js` 把两者混成一个字段，还原数据后会把 Chapter 0–1 从普通下拉剔除、且基地等级整整高 3 级（50-36 双侧算出 751 而非 747）。

### 三、改动

| # | 文件 | 改了什么 |
| :-: | :--- | :--- |
| 1 | `data/stage_map.json` | 从 `aacdd86` 还原：1,875 关 / 51 章 / 末章 Chapter 50 |
| 2 | `data/stage_clear_resources.json` | 从 `aacdd86` 还原：51 章 / `fallback_chapter: 50` |
| 3 | `js/outpost.js` | `computeBaseLevel()` 改用 `base_start_normal_id`(19) / `base_start_hard_id`(1)；`allStages()` 用 `normal_start_id`(1) 作下拉起点；兜底默认值同步拆开 |
| 4 | `js/outpost.js` | 补只读访问器 `stageMap()` / `stageCount(mode)`，让 `test_server_split.js` 这道守卫能真正跑起来 |
| 5 | `test_server_split.js` | 去掉已删除的 `O.setServer` / `O.clampSection` 旧 API 调用；「不截断」改为直接断言 50-36 BOSS / 49-28A-2 等关卡在表中存在。`income_scale` 机制自检改为断言现行契约（两服均为 1.0） |
| 6 | `index.html` / `mobile.html` / `redesign/index.html` | `outpost.js?v=` → `20261118c` |

> 未回退 `data/outpost_income.json`：它在 `23a23c8` 里是**变大**的（多出 `_mul` 含加成字段、扩到 800 级），与官方 `OutpostBattleTable` 对拍过，属正确版本。
> `data/overload_combat_data.json` 的改动只是路径重写（`Nikke\outputs\…` → `03_归档\Nikke_历史混杂工作区\outputs\…`），保留。

### 四、验证

| 项 | 结果 |
| :--- | :--- |
| 基地等级金标准 | 2-12 仅普通 **Lv1** ／ 20-1 双侧 **Lv208** ／ 40-1 双侧 **Lv554** ／ 48-36 BOSS 双侧 **Lv712** ／ 48-36 仅普通 **Lv354** ／ **50-36 BOSS 双侧 Lv747** —— 6/6 |
| 章节覆盖 | 普通 / 困难各 51 章，首章 Chapter 0，末章 Chapter 50；Chapter 50 共 44 关（含 50-15A/B、50-27A/B 分支），末关 50-36 BOSS |
| 收益表 | Lv747 有行：`credit 75670 / battle 779130 / core_dust 121.49` |
| 守卫测试 | `test_server_split.js` **124 项全过**（此前因 `stageMap/clampSection/setServer` 全缺而长期红着，等于这道闸门一直没生效） |
| 其余回归 | `test_golden` / `test_box_gain` / `test_stage_clear` / `test_keep_one_box` / `test_event_units` / `test_monthly_card` / `test_overload_combat` / `test_ledger`(40/40) 全过 |

---

**R91 · 群报数「没同步到计算器」：默认区服 + 同天空行两处修正**

### 一、用户需求

> QQ机器人登记的石头没有同步到计算器里！需要看下，注意用户的数据

### 二、排查结论：数据一条没丢，是**展示默认值**的问题

| 环节 | 实测 |
| :--- | :--- |
| 机器人写入 | ✅ 正常。11-19 07:42 那条 `国际服 2211` 已在云端（`at: 2026-11-19T07:42:46+08:00`） |
| 云端账户 | ✅ 该账号 `cn 0 天 / global 60 天`，含 11-19 |
| 计算器默认区服 | ❌ `currentServer = localStorage.getItem('nikke_current_server') \|\| 'cn'` |

**因为绑定前的本地备份只有 2 天，这是新设备/新浏览器** —— localStorage 里没有 `nikke_current_server`，页面落到默认的「国服」，而群报数全在「国际服」。数据已经在本地存着了，只是没人把它显示出来。

> 另附一处自纠：云端 `updated_at` 是 **UTC**，`2026-11-18T23:46:57Z` = 本地 `11-19 07:46:57`，正是那次绑定。一开始把它当成「昨晚 23:46 没写入」是我读错了时区。

### 三、改动

| # | 位置 | 改了什么 |
| :-: | :--- | :--- |
| 1 | `mod_stats.html` | 新增 `autoPickServer()`：云端拉回来后，若**当前这本账是空的、另一本有记录**，自动切过去并提示。只改视图、不动记录；每次打开页面最多切一次，用户手动切回去不会被抢。 |
| 2 | `mod_stats.html` | `adoptCloud()` 新增唯一例外：本机同一天是**空壳**（`runs`=0 且掉落全 0）而云端有数时，允许补满。有真实数据的日期仍然一律不动 —— 不覆盖用户手填。 |
| 3 | `tools.json` | `mod_stats.html?v=` → `20261119a` |

### 四、验证

| 项 | 结果 |
| :--- | :--- |
| 新增回归 | `nikke_test_adoptcloud.js` **8/8**：复现「空账+国际服有数 → 自动切服」、当前账有数不切、空壳行补满、有数行绝不覆盖（连写盘都不发生）、自动切服只发生一次 |
| 既有回归 | `test_mod_stats.js` **PASS=27 / FAIL=0** |
| 用户数据 | 全程只读排查；机器人档案与云端记录未做任何写入或删除（绑定前的本地备份 `L6DX9CERQC5G.20261119-074656.bak.json` 原本就由绑定流程生成） |

---

**R92 · 首页重排 + 用户提的七项修正**

### 一、用户需求（原文）

> - 设置移入计算器，用小图标显示
> - 前哨基地防御等级移动到原本第一位的位置，优化下章节进度选取组件（参考 pinkuro 的收起方案，加一个计算器图标，点开展示对应组件、支持收起）
> - 预计新主线推图的收益对比有 BUG，一直不按用户填入的前哨基地防御等级来对比，更改等级时也不跟着刷新
> - 云同步按钮逻辑：开启时点击计算会同步，关闭时不会
> - 活动收益：①增加历史记录图标，已过期活动收入历史记录 ②不展示「最后一天」这一列
> - 每日一举歼灭次数选项卡移到第一页，默认选 1 次，信息窗备注「包含每日免费次数」
> - 挑战者箱资源选择相关注释收纳入信息窗
> - 达成目标方案：精简重复描述、重点是开箱方案、补挑战者箱资源选择方案

### 二、改动

| # | 文件 | 改了什么 |
| :-: | :--- | :--- |
| 1 | `js/v16.js` | 顶栏「设置」文字按钮 → 齿轮图标（`v3-gear`，带 title / aria-label） |
| 2 | `js/v16.js` | `arrange()`：`当前基地` 整块从第 2 页挪回**第 1 页、现有资源上一行** |
| 3 | `js/v16.js` | 关卡进度由 `<details>` 折叠条改成**字段名旁的算器图标**（`v4-icobtn`）+ 默认收起面板（`v3-progwrap[hidden]`），点击展开/收起；参照 pinkuro 的「基地等级是输入框、章节进度只是换算器」的做法 |
| 4 | `js/v16.js` | 新增 `attachInfo()`：把长说明收进 i 信息窗（复用 `bindPop`），供歼灭次数与挑战者箱两处使用 |
| 5 | `js/v16.js` | 每日一举歼灭次数从设置弹窗搬回第 1 页（现有资源块尾），并挂信息窗注明**包含每日免费次数**；`app.js` / `index.html` 默认值 3 → **1**（今天已完成同步改 1） |
| 6 | `js/app.js` | `syncFutureBase()`：未来等级**不低于手填当前等级**（`Math.max(level, curManual)`）。没填当前关卡进度时 offset 只能取 0，会出现「未来 588 < 当前手填 589」的自相矛盾 |
| 7 | `js/v16.js` | `paintFutureIncome()` 补监听 `f_base` / `f_tactics` / 三个收益字段：改手填等级时「新主线开放后·前哨基地」卡**立即重绘**（原来只监听「预计新主线进度」块） |
| 8 | `js/v16.js` | 云同步按钮语义改为**开关**：`paintSyncBtn` 按 `nikke_calc_autosync` 显示「计算后自动同步 / 不同步」，点击 `toggleSync()` 翻转并回写设置里的下拉；开启且未登录时顺带叫出登录面板 |
| 9 | `js/v16.js` | 活动：去掉「最后一天」表头与 `.ev-end` 输入（值仍保留、仍参与计算）；新增卡头「历史」图标 + 条数角标 + 只读浮层，**已结束活动自动从主列表移入历史**（MutationObserver 跟随状态刷新） |
| 10 | `js/app.js` | 挑战者箱卡片新增「资源选择：<b>芯尘</b>（自动择优）」一行，并说明不受基地等级影响、优先项可切换 |
| 11 | `js/app.js` | 达成目标方案：顶部长段解释压成一句；**开箱方案提到配平诊断之前**；不可达分支的重复尾注压成一句 |
| 12 | `css/v16.css` / `css/style.css` | 新增 `.v3-gear` / `.v4-icobtn` / `.v3-progwrap` / `.v3-pop-sm` / `.v3-histbtn` / `.v3-histn` / `.v3-histtbl` / `.bc-pick` 等样式 |

### 三、验证

| 项 | 结果 |
| :--- | :--- |
| 语法 | `node --check js/v16.js` / `js/app.js` 通过 |
| 逻辑回归 | `test_golden` / `test_box_gain` / `test_stage_clear` / `test_keep_one_box` / `test_event_units` / `test_monthly_card` / `test_overload_combat` / `test_ledger`(40/40) / `test_server_split`(124) / `test_mod_stats`(27) **全过** |
| 行尾 | 改动的 6 个文件 CRLF 完整（v16.js 1631/1631、app.js 2237/2237、style.css 664/664、v16.css 1018/1018） |
| 版本号 | `css/style.css`、`css/v16.css`、`js/app.js`、`js/v16.js` 统一 → `20261119a` |

> 未做：本机没有 playwright/puppeteer，UI 重排只做了静态接线检查 + 语法检查，实际观感需在浏览器里过一眼（尤其第 2 页少了基地块之后的留白）。

---

**R93 · 修「采用推算值」不可见 + 未来基地等级吃到旧值**

### 一、用户反馈

> 完进度后可点「采用推算值」？并不能
> 新主线开放后 · 前哨基地 Lv 535 我明明手填的 553 级，且关卡进度都一样，怎么会缺少等级

### 二、根因

| # | 现象 | 根因 |
| :-: | :--- | :--- |
| 1 | 基地卡提示「可直接点下方按钮采用」，但按钮点不到 | R92 把整个「关卡进度」块收进折叠面板，而 `#btnAdoptBase` 长在那个块里 —— **连按钮一起藏了**。提示文字在基地卡上（可见），说的却是面板里的按钮 |
| 2 | 手填 553、未来卡显示 535 | `f_future_base` 只在 `syncFutureBase()` 里写，**页面加载时不重算**，读到的是上次会话存进 localStorage 的旧值；`buildSnapshot()` 又直接信这个隐藏输入框 → 显示与计算各用一套 |

### 三、改动

| # | 文件 | 改了什么 |
| :-: | :--- | :--- |
| 1 | `js/v16.js` | 「采用推算值」按钮在隐藏面板之前先提到基地卡上（`fs.appendChild`），可见可点 |
| 2 | `js/app.js` | 新增 `resolveFutureBase(f)`：**未来基地等级的唯一口径**（未来关卡推算 + 手填偏移，且不低于手填当前）。`syncFutureBase()` 与 `buildSnapshot()` 共用同一份 |
| 3 | `js/app.js` | `buildSnapshot()` 里未来基地与未来收益改为**现算**（`incomeForLevel(resolved)`），不再信任隐藏输入框 |
| 4 | `js/app.js` | 初始化末尾补 `syncCurrentBase()` + `syncFutureBase()` 并派发一次 `change`，让 v16 卡片按新值首绘 |
| 5 | `js/app.js` | 「采用推算值」点击后补 `syncFutureBase()` + 派发事件（原先漏了，采用后未来卡不动） |

### 四、验证

| 项 | 结果 |
| :--- | :--- |
| 新增回归 `nikke_test_futurebase.js` | **5/5** —— 从 `js/app.js` 抠出真函数跑（不是另写一份）：①同关卡同手填 ②**当前关卡未填时未来不得低于手填**（复现本次报障）③差值带到未来 ④未来进度落后时取手填 ⑤未填未来关卡返回 null |
| 既有测试 | 10 个文件全过（golden / box_gain / stage_clear / keep_one_box / event_units / monthly_card / overload / ledger 40 / server_split 124 / mod_stats 27） |
| 版本号 | `js/app.js`、`js/v16.js` → `20261119b` |

---

**R94 · 挑战者箱「自动择优」选错 + 方案不写选了哪项**

### 一、用户反馈

> 挑战者箱子自动择优有 BUG，明明选择自动择优，达成目标方案却没有选择正确的择优方案

### 二、根因（三处叠加）

| # | 问题 | 说明 |
| :-: | :--- | :--- |
| 1 | **都可达时无脑取芯尘** | `optimizeSelectableForTarget` 的 auto 双跑里，两条路线都可行就直接 `return runB`（芯尘）。但「可行」不等于「更优」：芯尘早已被裸资源覆盖时，选芯尘等于白开一个方舟箱，选战斗数据辑反而一个箱子都不用多开 |
| 2 | 达成目标方案第 ②③ 步的预扣写死第一项 | `chalRes = B.challengerUnitsResources(s2)`（auto 时取 `options[0]` = 战斗数据辑），与求解器实际选的那项可能不一致，于是「只开挑战者即可达成」这类结论会算错 |
| 3 | 方案文案不写选了哪项 | `boxPlanText` 把挑战者单独渲染成「挑战者成长宝箱全开」，**整段没有资源名**，所以即使选对了也看不出来 |

### 三、改动

| # | 文件 | 改了什么 |
| :-: | :--- | :--- |
| 1 | `js/boxes.js` | auto 双跑：**都可达时先比 `boxes_used`**，箱数少者胜；箱数相同才按「芯尘优先」 |
| 2 | `js/app.js` | 第 ② 步加 `plan2.feasible` 守卫：求解器自己说不可行时，不再宣称「只开挑战者即可达成」 |
| 3 | `js/app.js` | 第 ③ 步加 `remaining_shortage` 全零校验：按该方案开完仍有缺口就落到 ④，交给求解器口径 |
| 4 | `js/app.js` | `boxPlanText` 的挑战者一行补上所选资源：`挑战者成长宝箱全开（选 芯尘）` |

### 四、验证

| 项 | 结果 |
| :--- | :--- |
| 新增回归 `nikke_test_chalpref.js` | **8/8** —— A 两方都可达→芯尘；B 只有战斗可达→战斗；**E 芯尘已被裸资源覆盖→取战斗（本次报障）**；C/D 手动偏好两项；外加可达性与箱数断言 |
| 既有测试 | 10 个文件全过（golden / box_gain / stage_clear / keep_one_box / event_units / monthly_card / overload / ledger 40 / server_split 124 / mod_stats 27） |
| 版本号 | `js/boxes.js`、`js/app.js` → `20261120a` |

> 同批把两个临时回归收进仓库：`test_challenger_pref.js`（8 项）、`test_future_base.js`（5 项），
> 并在 `docs/DEVELOPMENT.md` 的测试清单里登记。此前它们只在 `%TEMP%`，重启即失。

---

**R95 · 结果页分层 / 分页改名 / 移除进度球 / 手机端跳转与遮挡 / 模组日历视图**

### 一、用户需求（原文六条）

> - 现在 4 组计算结果的分层不够明显，需要优化下
> - 分页栏：第一项选项卡文案修改为资源摸底，第二选项卡文案修改为节点统计
> - 移除百分比悬浮窗
> - 手机端点击计算时跳转到结果页，不要直接在分页底部显示结果
> - 手机端底部这个计算按钮，在登陆时可以被点击到，很违和
> - 定制模组统计，历史统计增加日历视图，可切换列表视图以及日历视图，日历视图需要用不同颜色，以及深浅对应不同的涨幅变化。需要注意文本显示清晰可见，注意检查页面不能有bug。

### 二、改动

| # | 文件 | 改了什么 |
| :-: | :--- | :--- |
| 1 | `js/v16.js` + `css/v16.css` | 四张卡改三层结构：**起点**（虚线底、弱化）→ **①仅固定箱 → ②全箱梭哈**（主结果：主色描边 + 浅绿渐变 + 30px 数字 + 序号徽章）→ **另一条路**（自然升级，缩小淡化）。卡间加 `→` 连接（移动端 2 列时隐藏） |
| 2 | `js/v16.js` | 分页文案：`填写 → 资源摸底`、`推图进度&活动 → 节点统计` |
| 3 | `index.html` / `js/app.js` / `css/style.css` / `css/mobile.css` | 移除右下角**百分比进度球**及其明细面板（DOM + `updateProgress()` + 3 处调用 + 全部样式） |
| 4 | `js/v16.js` | 「开始计算」跳结果页的监听从只有 `#btnCalc` 扩到 `#btnCalcFab`（移动端吸底按钮），点完 600ms 自动切到第 3 页 |
| 5 | `js/sync.js` | 云同步遮罩 `z-index: 5000 → 10001`：原先低于吸底计算按钮（9000）与移动顶栏（9400）/底部 Tab（9500），登录时按钮浮在遮罩之上，能点 |
| 6 | `css/v16.css` | 设置弹窗遮罩/面板 `80/81 → 10002/10003`，同理不再被吸底按钮压住 |
| 7 | `mod_stats.html` | 历史记录新增**列表 / 日历**双视图：卡头切换按钮（记忆在 `nikke_mod_hist_view`）；日历按周一起始排格，格内显示「日号 + 累计偏差%」，颜色分 3 档深浅 × 绿（偏欧）/红（偏非），浅底深字保证对比度；今天描边；翻月按钮在最早/最晚月禁用；无记录日灰底 |
| 8 | `tools.json` / `mobile.html` | 入口与资源版本号同步到 `20261120b` |

### 三、验证

| 项 | 结果 |
| :--- | :--- |
| 新增回归 `test_mod_stats_calendar.js` | **19/19** —— 色阶分档 7 项（含 2%/6% 边界）、格子数 = 空白格 + 当月天数、1~30 每天都恰好出现一次、有记录日带色阶与偏差文本、无记录日不显示百分比、今天高亮、翻月边界禁用 |
| 逻辑回归 | 其余 12 个测试文件全过（golden / box_gain / stage_clear / keep_one_box / event_units / monthly_card / overload / ledger 40 / server_split 124 / mod_stats 27 / challenger_pref 8 / future_base 5） |
| 结构 | 历史面板 div 9/9、table 1/1 闭合；`node --check` 通过（app / v16 / sync / mod_stats 内联脚本） |
| 版本号 | `style.css` `v16.css` `app.js` `v16.js` `sync.js` → `20261120b`；`mod_stats.html` 入口 → `20261120b` |

> 日历是纯前端渲染、不写任何数据；列表视图与导出/同步逻辑完全未动。

---

**R96 · 移除 XLSX/跨设备同步 / 开箱顺序收敛进信息窗 / 达成目标方案重构 / 收益明细分区**

### 一、用户需求（原文六条）

> - 下载 XLSX 模板，导入 XLSX，📡 跨设备同步相关功能移除
> - 开箱顺序（全箱梭哈）：① 挑战者成长宝箱全开 → ② 固定小时箱按需 → ③ 自选箱按下表逐箱开启：… 这些不用反复出现，说明一次即可，建议提炼开箱顺序的规则，用信息窗收纳就行
> - ✅ 已达目标级 541 类似的描述很多余，用户不是傻子
> - 达成目标方案：口径那段无意义，移除；直接给方案表格，3 类箱的开箱方案如果需要用上也要展示；「三资源配平诊断（现状口径）」移除，改成**目标无法达成时按智能配平之后的资源缺口用表单显示**
> - 奖励明细也需要做分区，样式同总览
> - 活动收益仅展示收益表单，收益日期计入时间段这些信息用信息窗收纳起来

### 二、改动

| # | 文件 | 改了什么 |
| :-: | :--- | :--- |
| 1 | `index.html` / `mobile.html` / `js/app.js` | **移除 XLSX 模板 / 导入 XLSX / 跨设备同步**：3 个按钮 + 隐藏 file input + `buildXlsxTemplate` / `readXlsxFile` / `shareCodeOf` / `unshareCode` / `applyFormFromCode` / `buildShareModal` + 全部事件监听 + `ensureVendor` 的 xlsx 条目（净减 254 行）。`redesign/index.html` 是**冻结原型**（加载 20261029a 旧 app.js，其 bindEvents 会硬绑这些节点），按钮保留并加注释说明 |
| 2 | `mobile.html` | 顺带修 R95 遗漏：顶栏 `#progressFab` 进度球 DOM 还在（样式与 `updateProgress()` 已删，只剩死按钮），本次移除；同时删掉 `m-hidden` 里为旧版 app.js 保留的 XLSX 三件套 |
| 3 | `js/app.js` | **开箱顺序规则收敛成信息窗**：新增 `BOX_ORDER_HTML` + 通用 `infoPop()`（全站唯一信息窗构造器，支持字符串与 DOM 节点混合）。「即刻飞升」「达成目标方案」两个标题各挂一个 i，规则只在这里说明一次；删掉 4 处重复的「① 挑战者全开 → ② 固定小时箱按需 → ③ 自选箱按下表逐箱开启」文案、3 处 `selCaption`、`fixedPlanTable` 里「与上方表单同表形」 |
| 4 | `js/app.js` | 删「✅ 已达目标级 N」两处（`ok-tag`） |
| 5 | `js/app.js` | **达成目标方案重构**：删「口径：…」整段；删 `balanceDiagTable`（三资源配平诊断）与死代码 `diagOf()`；新增 `gapTable()` 出「智能配平后的资源缺口」——**目标累计消耗 / 智能配平可用 / 缺口 / 折算 1H 箱**，只在目标不可达时渲染。结构改为：可达→直接给方案；不可达→先报上限与缺口，再给「最优均衡能到哪」的逐箱方案 |
| 6 | `js/app.js` + `css/style.css` | **收益明细分区**：新增 `.extra-card`（与 `.target-card` 同款蓝系），把 5 个 `h3.sec` 平铺区块改成 5 张卡；每张卡的长口径说明收进 i 信息窗，卡内只留必要一行 |
| 7 | `js/app.js` | **活动收益只留收益表单**：活动清单表（模板/窗口/计入区间/天数/状态）、计入区间规则、与开放日的关系、商店与每日任务规则全部进信息窗；卡内只保留「本表单持仓 / 活动计入 / 合计」表 + 折合等级增量一行 |
| 8 | `css/style.css` | `.summary-card` / `.target-card` 加 `position: relative`（信息窗以卡片为定位宿主）；信息窗内表格字号与颜色单独调优 |
| 9 | `index.html` / `mobile.html` | `style.css` / `app.js` → `20261120c` |

### 三、验证

| 项 | 结果 |
| :--- | :--- |
| 语法 | `node --check` 通过（`app.js` / `v16.js`） |
| 逻辑回归 | 13 个测试文件全过：golden / box_gain / stage_clear / keep_one_box / event_units / monthly_card / overload / ledger 40 / server_split 124 / mod_stats 27 / challenger_pref 8 / future_base 5 / calendar 19 |
| 残留符号 | `shareCodeOf` / `buildShareModal` / `buildXlsxTemplate` / `readXlsxFile` / `btnShare` / `btnTemplate` / `btnImport` / `fileXlsx` / `LZString` / `selCaption` / `diagOf` / `balanceDiagTable` 全部 0 引用 |
| 行尾 | 5 个改动文件 CRLF 与总行数一致（2045/2045、244/244、353/353、674/674） |
| 依赖符号 | 新代码引用的 `el/table/infoPop/boxOrderInfo/extraCard/gapTable/fmtNum/fmtInt/fmtDays/esc/localDateStr/levelGainSplit/allInTotal/DEFAULT_FIXED/RESOURCE_LABELS/affordableLevelsSingle/planForTarget` 全部存在 |

> 边界说明：本机无 playwright/puppeteer，UI 仅做语法 + 符号 + 行尾检查，未跑真实浏览器。

---

## 2026-11-17（第三十五轮）

**R87 · 活动时长按官方公告可覆盖；状态分色与「即将上线」；分页/信息窗调整**

### 一、用户需求（原文六条）

> 1. 活动时间需要读取官方的说明，然后有部分活动会受强更的影响，需要注意下
> 2. 最后一天没标红（后续按时间的长短依次调整颜色为：绿、黄、红）
> 3. 即将上线的内容需要修改下文案为「即将上线」（判断标准 1 周内）
> 4. 结果页这个生成时间很多余，去除掉
> 5. 信息窗对应是到下面这几个栏目后面加一个信息窗说明
> 6. 当前基地（前哨站 · 以手填等级为准）这块移动到分页 2，分页 2 修改下文案，这个不是目标了，是推图进度&活动

### 二、改动

| # | 文件 | 改了什么 |
| :-: | :--- | :--- |
| 1 | `js/app.js` · `js/events.js` | 活动行新增「最后一天」日期列（`.ev-end`，可留空）。留空 = 按模板天数（28/21/14 天，04:00 重置次数）；填了 = 以官方公告为准，`instantiateWithEnd()` 覆盖 `window.end`，状态、计入天数、收益全按它算。早于开始日的值自动忽略。 |
| 2 | `js/app.js` · CSS | 状态徽章分色：剩余 > 7 天绿（`.on`）、1~7 天黄（`.warn`）、最后一天红（`.danger`）、已结束灰红（`.done`）、数据异常红。`v16.js` 的 `paintEventNames` 不再按文案 toggle `.on`（会把黄/红覆盖成绿）。 |
| 3 | `js/app.js` | 未开始的活动：距开始 ≤ 7 天显示「即将上线」（`.soon`，蓝），更远仍是「未开始」。 |
| 4 | `js/v16.js` | 删掉结果页顶部 `#v3Time`「生成于 …」时间条及其两处写入点。 |
| 5 | `js/v16.js` | 原来「四张卡的口径」是一个总弹窗，现按 ①②③④ 拆开、各挂到对应数字卡右上角；⑤（活动收益不计入现状）并入第 1 张卡。`cards-caption` 隐藏，`.v7-card-pop` 浮层挂在 `.cards` 上（卡片太窄）。 |
| 6 | `js/v16.js` | 「当前基地（前哨站 · 以手填等级为准）」连同内部的「关卡进度推算」折叠从第 1 页移到第 2 页，排在「预计新主线」之前；步骤条第 2 步文案「目标 / 新主线 · 活动」→「推图进度&活动 / 基地 · 新主线 · 活动」，底部按钮同步。 |

补充：`sched.dates` 为空（活动全部结束）时补一次 `refreshActivityStatus()`，徽章不再停在旧文案；结束日填得过短时报错文案改为可照做的说明（原文是「stage_blocks/open 有误」）。

### 三、验证

| 项 | 结果 |
| :--- | :--- |
| `node test_event_units.js` | ALL EVENT TESTS PASSED（基线未破） |
| 结束日覆盖（large21 11/18 起，覆盖到 12/09） | 计入 21 → 22 天，信用点 4,580,500 → 4,826,060 |
| 结束日早于开始日 | 忽略，退回模板天数 |
| 状态徽章（2026-11-17 实测） | 10/21 与 11/04 两期「今天最后一天」红；11/18「即将上线」蓝；12/02 起「未开始」灰 |
| 覆盖 11/04 那期为 11/20 | 「剩余 3 天」黄 |
| 数据日期推后 / 活动全结束 | 状态转「已结束」，汇总走「已计入 0 天」 |
| 无头 Chrome 探针 | 步骤条文案、P1/P2 分区、4 卡 4 个 i、`#v3Time` 已被移除、控制台零报错 |

探针脚本：`临时车间\cdp_probe_20261117.js` / `cdp_cards_20261117.js` / `cdp_ev_20261117.js` / `cdp_expired_20261117.js`（一次性，不入库）。

### 四、上线

| 端 | 状态 |
| :--- | :--- |
| GitHub Pages | ✅ 已推 `0970130`（rebase 到远端 `6f76af4` 之上），线上 30~60s 生效 |
| WorkBuddy | ⛔ **本轮未同步**，原因见下 |

**WorkBuddy 端被工作区应用槽位挡住**：本工作区 `D:\Codex\Nikke` 已绑定「思凯角色档案」应用（`wbapp_DfSOJ5MV4P164QxXuS94U8`）。实测 4 次，无论目录换成 `D:\Codex\临时\nikke_level_deploy_20261117`、删掉 `.wbapp_DfSOJ5MV4P164QxXuS94U8.genie`、给目录补 `.workbuddy`、还是显式传 `appId=wbapp_Jf0Q8SP3b2SJ91mSeeDgtL`，deploy 一律把内容覆盖到思凯那个应用上，不会新建应用。

已 4 次把思凯档案按原 `localDir` 重新 deploy 回去，线上 `title` 复核为「思凯 · SKY｜NIKKE 角色档案」，内容无损。计算器旧 WorkBuddy 链接（`nikke-level-planner-07475...`）仍在，内容停在 11-15 版（`v16.js` 无 `decorateCards`、`v16.css` 无 v17 标记，已复核）。

**发计算器的正确路径**：另开工作区 → 在新会话发布 → 会**新建应用、换新链接**。坑已写进 `docs/DEPLOY.md`「同步 WorkBuddy 镜像」。

---

**R88 · 修复云同步按钮：点击不上传、计算后也不自动同步**

### 一、用户需求

> 现在计算器的保存按钮貌似有bug，点击同步按钮状态，且已开启计算同步的情况下没有同步

### 二、根因

不是按钮坏了，是**从来没接上线**。23a23c8 删掉 R46 的快捷同步逻辑后，v16 把那颗云图标当成「样式」画了回来：`#chkAutosync` 只有一个 `change` 监听用来改自己颜色，全站没有一处调用 `__nikkeSync.quickUpload`；`calculate()` 里也没有 R46 的 `autoSyncAfterCalc()`。所以：

| 现象 | 原因 |
| :--- | :--- |
| 点一下只变色 | 圆图标是个 `<label>` 包着隐藏 checkbox，点击 = 切勾选，无任何上传 |
| 勾着「计算后自动同步」也不传 | `autoSyncAfterCalc()` 整个函数在事故里丢了，`quickUpload` 零调用方 |

线上数据佐证：Supabase `sync_data` 表 144 行里 `feature='planner'` **一条都没有**（其余全是定制模组统计）。

### 三、改动

| 文件 | 改了什么 |
| :--- | :--- |
| `js/v16.js` | `buildSyncTog()` → `buildSyncBtn()`：改成真 `<button>`，点击 `syncNow()` → `__nikkeSync.quickUpload('planner')`；未登录由 `quickUpload` 自己开面板引导。按钮色改为反映登录态（绿=已登录），新增 `is-busy` 脉冲与 `is-ok` 成功态。`onAuth` 订阅 + 1.2s 兜底重画（`getSession` 不触发 `onAuthStateChange`） |
| `js/v16.js` | 设置弹窗「计算设置」新增「计算后自动同步云端」是/否，写 `nikke_calc_autosync`（沿用 R46 原键名）。用 `select` 是沿用「战术学院」写法，零新增 CSS |
| `js/app.js` | 补回 `autoSyncAfterCalc()`：开关开 + 已登录才 `quickUpload('planner')`；未登录静默跳过。挂在 `calculate()` 的 `saveForm()` 之后 |
| `css/v16.css` | `.as-tog` 补 `padding:0; font:inherit`（button 默认内边距会把图标挤歪）+ `.is-busy` / `.is-ok` |
| `index.html` · `mobile.html` | 版本号 `20261117a` → `20261117b`（app.js / v16.js / v16.css） |

### 四、验证

无头 Chrome 探针 `F:\Codex\临时\verify_sync_20261117.js`（把 `quickUpload` 换成记录器，只验接线不碰网络），**同一套脚本对修复前后各跑一次**：

| 检查项 | 修复前 | 修复后 |
| :--- | :-: | :-: |
| 点云图标调用 `quickUpload` | ❌ 0 次 | ✅ 1 次 |
| 传入 id = `planner` | ❌ 空 | ✅ |
| 已登录 → 按钮开启态 | ❌ data-on=0 | ✅ data-on=1 |
| 设置内有 `#v16Autosync` | ❌ null | ✅ 默认「是」 |
| 开始计算 → 自动上传 | ❌ 0 次 | ✅ 1 次 |
| 关掉开关 → 计算不上传 | ✅ | ✅ |
| 关掉开关后仍可手动同步 | ❌ 0 次 | ✅ 1 次 |
| 未捕获异常 / 控制台报错 | 0 / 0 | 0 / 0 |

合计：修复前 6 项失败 → 修复后 10/10 通过。
`node --check` 三个 JS 全过；`css/v16.css` 大括号 406/406 平衡。

> 未验证项：真实 Supabase 往返（探针绕过了网络）。登录态下点一次云图标后的落库结果，要等线上有登录账号时人工确认一次。

---

## 2026-11-15（第三十四轮）

**R86 · 恢复活动收益与计算口径，计算器 v16 外壳上线**（`638684f`、`67a20e1`、`a1e4b32`）

### 一、用户需求

> 可以同步线上了，注意用户的数据
>
> 后续同步线上都要同时同步一下 github 以及 workbuddy 的页面

本轮之前还累积了 14 条改版需求（分页化、设置收纳、活动云端下发、结果收明细等），走的是「原型迭代 → 定稿 → 上线」的路子，原型在 `临时车间\改版原型_20261116\`，方案在 `核心目录\方案文档\计算器v2改版方案_20261115.md`。

### 二、改动

#### 1. 恢复 23a23c8 削掉的活动收益（4 处）

| 文件 | 丢了什么 | 处理 |
|---|---|---|
| `js/events.js` | 一次性任务箱类奖励 `addInto(days[d0], tsk.boxes)` | 回滚到 `bc4d8a8` |
| `data/event_templates.json` | `large28map`（28 天带地图大活动）、`large21.label` 回退 | 补回模板，内容与事故前全等 |
| `js/app.js` | `renderEventTotals()` 三块预览表 + 8 个辅助函数 | 手工搬回（不整体回滚，保住 progressFab 等新功能） |
| `test_event_units.js` | 47 行活动用例 | 回滚到 `bc4d8a8` |

#### 2. 恢复 R62 / R60 计算口径

`test_box_gain` 7 项失败的根因不是测试过时：

- `js/boxes.js`：`fixedBoxResources` 退回逐箱 floor（R62 被删），`dustTrunc` / `hoursOfFixed` / `joinHours` 三个函数消失 → 改回「先累加总小时、最后统一 floor 一次」
- `js/scenarios.js`：`boxGain` 退回整数等级差（R60 被删）→ 1.85% 收益差下恒为 0；改回连续口径，`days` 改回 `Math.floor`
- `css/style.css`：补回 `.res-icon` 尺寸规则（18×18），资源图标不再按原图几百 px 铺开

#### 3. v16 外壳（新增文件，不动 index.html 结构）

`index.html` 只加两行引用，业务代码、字段 id、`localStorage` 键一个没改：

| 文件 | 内容 |
|---|---|
| `css/v16.css` | 三步分页、设置弹窗、信息窗、收益明细分块 |
| `js/v16.js` | 运行时重排；图标在线上走 `assets/` 真实路径（单文件预览才用注入的 data URI） |

功能点：

- **三步分页**：填写 / 目标 / 结果，与表单卡共用一张外框，翻页回到子页第一行
- **设置弹窗**（居中）：服务器（国服 / 国际服）、战术学院是否满级、每击歼灭次数、月卡、每种箱留 1 个
- **信息窗**：前哨基地收益、推图奖励（表格）、活动收益明细、结果口径说明，都是卡片内小窗
- **收益明细分块**：资源 / 固定小时箱 / 自选箱三块，首列补道具图标，全表统一边框与斑马纹
- **结果可读性**：长小数收成 1 位（只处理 3 位以上的机器精度尾巴，51.6 天 / 1.85% 这类不动）
- **活动排期预置**：7 行（`large28map` ×1 + `small14` ×3 + `large21` ×3，2026-10-21 ~ 2027-01-13），5 行带国服官方活动名

#### 4. 启动时机修复（`a1e4b32`）

上线后 GitHub Pages 上外壳**完全不生效**，WorkBuddy 却正常。实测 `document.readyState` 长时间停在 `interactive`（字体 / Supabase 等外部资源慢），`window.load` 永不触发，而第一版正好在等 load。

改为 `DOMContentLoaded` 启动 + `load` + **3 秒超时**三保险，`bootOnce()` 去重；仍用 `setTimeout(…, 0)` 让出这一轮，保证晚于 `app.js` 在 DOMContentLoaded 里对 `#formSection` 的事件绑定。

### 三、验证

**测试套件（全部通过）**

| 测试 | 结果 |
|---|---|
| `test_golden` | ALL PASSED |
| `test_event_units` | ALL PASSED（含恢复的 47 行用例） |
| `test_box_gain` | ALL PASSED（原先 7 项失败） |
| `test_keep_one_box` / `test_monthly_card` / `test_stage_clear` | ALL PASSED |

**双端线上实测**（无头 Chrome，两端各跑一次）

| 项 | GitHub Pages | WorkBuddy |
| :--- | :--- | :--- |
| 分页外壳 / 设置按钮 / hero / 工具导航 | 1 / ✓ / ✓ / 5 项 | 同 |
| 计算结论 | 489 → 503 → 514，51.6 天 | 同 |
| 长小数残留（≥3 位） | 0 | 0 |
| 收益明细三块 | 3 块 / 22 图标 / 坏图 0 | 同 |
| JS 异常 | 0 | 0 |

**用户数据**

- `localStorage` 键仍是 `nikke_planner_form_v1`，字段 id 全部沿用 → 老表单原样读回
- 搬进设置弹窗的 4 个字段（`f_tactics` / `f_keep_one_box` / `f_monthly_card` / `f_wipeouts`）按 id 读写，不依赖元素在 `#formSection` 内，保存恢复正常
- WorkBuddy 换了域名，旧域名的 localStorage 不会迁移（旧域名本身已 403）；GitHub Pages 地址未变，数据完好

### 四、上线地址

| 端 | 地址 |
|---|---|
| GitHub Pages | https://theifxzx666-blip.github.io/Nikke_Level/ |
| WorkBuddy | https://nikke-level-planner-07475.app.workbuddy.host/?sharecode=YHW5333IQR |

> WorkBuddy 旧 app（`wbapp_Gg6VAj3R43dpJZtGByLF2T` / `nikke-level-planner.app.workbuddy.host`）已 403 失效，现用新 app `wbapp_Jf0Q8SP3b2SJ91mSeeDgtL`。双端同步流程见 `核心目录\方案文档\PUSH_GUIDE.md` §7.4。

仓库 About 区同期补齐（原先 description / homepage 均为空，违反项目规范「仓库 Description 禁空」）：

| 字段 | 值 |
| :--- | :--- |
| description | 含 WorkBuddy 备用镜像地址，并标注「链接需带访问码」 |
| homepage | GitHub Pages 地址（About 右侧 Website） |
| topics | `nikke` `calculator` `github-pages` `vanilla-js` `gaming-tools` `planner` |

> WorkBuddy 托管**必须带 `?sharecode=`**：实测去掉后返回 403「链接不完整」，平台级分享机制，无法简化；域名里的 `-07475` 也是创建时因旧应用占用前缀而自动分配的，改不了。对外统一用 GitHub Pages 的纯链接。

---

## 2026-11-13（第三十三轮）

**R85 · 回滚 23a23c8 造成的能力缺失：mod_stats 同步器档位与 sync.js 登录态**（`edae923`、`154f01d`）

### 一、问题

`23a23c8`（工具导航注册表化 + 战力计算 Beta 接入 + 路径重写）在重写文件时顺带削掉了两块能力：

- `mod_stats.html`：同步器档位（3 / 4 / 5 次）与第 4 / 5 次掉落记录消失
- `js/sync.js`：`user` / `ready` / `onAuth` / `pull` / `push` 与 `mod_stats_qq` 功能 id 丢失 → 跨设备同步不可用

同一提交还削掉了活动收益（见第三十四轮）与 `.res-icon` 尺寸规则，当时未全部发现。

### 二、改动

| 文件 | 处理 |
|---|---|
| `mod_stats.html` | 整文件回滚到 `bc4d8a8` |
| `js/sync.js` | 整文件回滚到 `bc4d8a8` |

### 三、验证

- 同步器档位可在 3 / 4 / 5 次之间切换，第 4 / 5 次掉落记录可填可存
- 跨设备同步链路恢复（`user` / `ready` / `onAuth` / `pull` / `push`），`mod_stats_qq` 功能 id 回到注册表
- 11-13 17:30 复核：两个文件与 WorkBuddy 镜像一致

---

## 2026-10-31（第三十二轮）

**R84 · 「全部周期」清单行高 24→29、字号 12.5→13**（`78225c0`）

### 一、用户需求

> 全部周期有点太小了。有点点别扭

R83 为了「右列不溢出」把 5 行清单压到 24px 行高、12.5px 字号，读起来憋。真要靠放宽 `min-height` 换行高就会把右列顶出左面板，所以只能从**右列上方的留白**里挪空间。

### 二、改动（全部写在 `@media(min-width:1081px)` 内）

| 位置 | 前 | 后 |
|---|---|---|
| `#periodPanel .period-card` padding | 12px | **10px** |
| `#periodPanel .p-mid` margin-top | 6px | **3px** |
| `#periodPanel .p-main` 字号 | 26px | **24px** |
| `#periodPanel .p-seg` padding-top / line-height | 8px / 1.65 | **6px / 1.45** |
| `#periodPanel .period-dots` margin-top | 5px | **3px** |
| `#periodPanel .period-dots button` 热区高 | 20px | **18px** |
| `.period-all` margin-top | 8px | **5px** |
| `.period-all-row` min-height / 字号 | 22px / 12.5px | **24px / 13px** |
| `.period-all-row .pa-main em` | 11.5px | **12px** |
| `.period-all-head` 字号 | 11 / 12 | **11.5 / 12.5** |

卡片视觉骨架（标题行 / 主数字 / 偏差 / 本段）层级不变，只是不再松垮；省下的 ~22px 全给清单。**手机与平板单列布局零影响**（覆盖全部带 `#periodPanel` 前缀且在 `>1080px` 媒体查询内）。

### 三、验证

- 行高实测：1440 / 1280 = **29px**，1100 = **33px**（左表单换行变高 389 → 右列跟随），1600 = 29px
- 等高：四档 `topDiff=0 / bottomDiff=0`（本地 / GH / 镜像三处复测）
- 无截断：1100 档右列 396px，`.period-all-head` `scrollWidth == clientWidth`，所有 `.pa-main` 无省略号
- `test_mod_stats` **27/27**（+4 条守护：桌面卡片压缩覆盖不得删、主数字与 p-seg 行高覆盖、行字号 13px、圆点热区 18px）；11 套 `test_*` 全绿
- 本地 6 套冒烟全绿；GH Pages 与镜像：`_smoke_r69` **36/36 桌面 + 36/36 手机**、`_smoke_r80_scroll` 18/18、`_smoke_r79_shelliframe` 7/7
- 线上 `Last-Modified` = 2026-10-31 15:26:46Z；镜像第二十八轮全树 IDENTICAL 1741、`verified: true`、sandboxId 与分享链接未变

### 四、踩坑

- 注释写进 `@media(min-width:1081px){` 后紧跟的第一段会把 `test_mod_stats` ⑱ 的 `/@media\(min-width:1081px\)\{[\s\S]{0,400}\.period-all\{display:flex/` 断言窗口（400 字符）撑爆 → 断言假失败。已把 R84 的长注释挪到媒体查询**外面**，断言窗口不动。
- 桌面圆点热区由 20 → 18px 只在 `#periodPanel` 作用域内，基础规则仍是 `18×20`，R81 的「热区 ≥16×20」源码断言不受影响。

---

## 2026-10-31（第三十一轮）

**R83 · 右列（堆叠卡 + 全部周期）与「添加每日记录」等高，不溢出**（`874715e`）

### 一、用户需求

> 全部周期、堆叠卡片跟添加每日记录要保持在一行（2 个卡片加起来的总高度要跟添加每日记录保持一致），不要溢出

### 二、问题定位

`#periodPanel` 已是 `align-self:stretch` + `.period-all{flex:1 1 auto}`，本该跟着左面板高度走；但**右列自身的 min-content 比左面板高**，把 grid 行高顶起来了 —— 实测左 366px、右 422px，溢出 56px。构成：卡 173 + 圆点 30 + 清单 margin 12 + 清单 207（5 行×32 + gap 20 + 头部 27）。

### 三、改动（目标：右列 min-content ≤ 左面板，留出余量让 flex 分配）

| 项 | 前 | 后 |
|---|---|---|
| `.period-all-row` min-height | 32px | **22px**（行高由 `flex:1 1 0` 分配，实测 24px） |
| `.period-all-list` gap | 5px | **4px** |
| `.period-all-head` padding-bottom / 字号 | 7px / 11.5px·12.5px | **3px / 11px·12px** |
| `.period-all` margin-top | 12px | **8px** |
| `.period-dots` margin-top / 按钮热区 | 6px / 18×24 | **5px / 18×20**（视觉点仍 6px，选中 16px） |

右列 min-content 422 → **353**，比左面板 366 少 13px，剩下的空间由 `.period-all-list` 的 flex 分配（每行 24.8px）。

### 四、验证

| 宽度 | 左面板 | 右列 | 底边差 | 行高 |
|---|---|---|---|---|
| 1100 | 389 | 389 | **0** | 29 |
| 1280 | 366 | 366 | **0** | 24 |
| 1440 | 366 | 366 | **0** | 24 |
| 1600 | 366 | 366 | **0** | 24 |

- `test_mod_stats` 27/27（新增 3 条：行 min-height ≤26、`.period-all{flex:1 1 auto}`、列表 gap 3~4）；11 套全绿
- 本地 + GH + 镜像：`_smoke_r69` 36/36 ×双端、`_smoke_r73` 29/29 ×双端、`_smoke_r77` 20/20 ×双端、`_smoke_r75` 26/26 & 25/25、`_smoke_r80_scroll` 18/18 ×双端、`_smoke_r79_shelliframe` 7/7
- 线上 + 镜像等高复测 `bottomDiff=0`；镜像第二十七轮 IDENTICAL 1741、`verified: true`、sandboxId 与分享链接未变

---

## 2026-10-31（第三十轮）

**R82 · 移除顶部「已记录 N 天 + 90 天进度条」样本条**（`0188a9a`）

### 一、用户需求

> 已记录 52 天 这段要移除（`.sample-item` 整块）

### 二、改动

| 层 | 处理 |
|---|---|
| DOM | 删掉 `<div class="sample-bar"><div class="sample-item">…</div></div>`（含 `#statDays`、`#sampleProgress`） |
| CSS | 基础样式 `.sample-bar / .sample-item / .sample-value / .sample-hint / .sample-bar .progress` 与 `.sample-track` 全删；`@media(max-width:720px)` 内 2 条与 `≤1080px` 内 6 条同名覆盖一并删除 |
| JS | `render()` 里 `#statDays.textContent` 与 `#sampleProgress.style.width` 两行删除（`SAMPLE_DAYS=90` 常量保留，仍被 `PERIOD_TARGETS` 与两处 tag 使用） |
| 测试 | `test_mod_stats` 新增 2 条守护：`.sample-bar`/`#statDays` 不得再现、`.sample-*{` 规则不得复活 |

### 三、口径不受影响

天数信息仍有两处：历史记录面板头 `共 N 条`、周期卡与「全部周期」清单（90 天行带「建议样本」tag + 偏差色点）。样本进度条本身只是重复表达。

### 四、验证

- `test_mod_stats` 27/27；11 套 `test_*` 全绿
- 本地 + GH + 镜像：`_smoke_r69_modstats` 36/36 ×双端、`_smoke_r80_scroll` 18/18、`_smoke_r73` 29/29、`_smoke_r75` 26/26 & 25/25、`_smoke_r79_shelliframe` 7/7
- 几何：`.sample-bar` / `#statDays` / `.sample-track` 计数 0/0/0；统计卡与下方面板间距 14px（桌面）/ 18px（手机），无残留空白；文档高 1474（删掉 27px）
- 线上 `Last-Modified` = 2026-10-30 23:23:51Z；镜像第二十六轮全树 IDENTICAL 1741、`verified: true`、sandboxId 与分享链接未变

---

## 2026-10-31（第二十九轮）

**R81 · 定制模组统计：「建议样本」tag 归位到 90 天那一行 + 圆点恢复「随手远跳」**（`9381c5a`）

### 一、用户需求（2 条）
1. 「建议样本」标签不该打在「已记录 N 天」后面，应该在堆叠卡片下面的 90 天那行
2. 卡片下面的页面定位（圆点）不能随意点击跳转了 —— 之前能从第 1 个直接点第 5 个，现在只能按顺序点

### 二、实现
**① tag 归位**
- 顶部 `sample-bar` 只留「已记录 N 天 + 进度条」，`<em class="sample-tag">` 从这里移除（R80 挂在这儿被反馈成「打在已记录后面」）。
- 90 天抽成常量 `SAMPLE_DAYS=90`，`PERIOD_TARGETS` 与样本进度条共用；`periodAllRow()` 里 `o.target===SAMPLE_DAYS` 时在 `pa-main` 尾部追加 tag（已完成 / 未完成两个分支都加）。
- 为什么塞进 `pa-main` 而不单独占一列：清单是 `52px | 1fr | 62px | 14px` 四列 grid，单独加列会让 90 天行的正文起点和其他四行错开；内联进文本流则整列仍对齐。
- `.sample-tag` 样式改为内联胶囊（`display:inline-block` + `margin-left:6px` + 绿色 primary 描边），离开 `sample-track` 后不再是「竖线+右圆角」那套；窄屏媒体查询里那条 `.sample-tag` 覆盖删掉（≤1080px 清单不渲染）。

**② 圆点远跳**
- 热区：`.period-dots button` 从 `6×6`（视觉点本身就是热区）改成 `18×24`，点改由 `::after` 画（6px，选中 16px）。高亮拉长时容器宽度恒定，不再挤动相邻点。
- 节流解绑：R80 给 `periodGo` 加的 `PERIOD_STEP_MIN_MS=110` 是「非 force 一律卡」，任何漏传 force 的入口都会被削成一次一格。R81 改为**白名单** —— 只有滚轮传 `{gate:true}` 才走闸门（被拒时返回 `false`，调用方保留 `wAcc`，下一帧继续翻），点击圆点 / 清单行 / 键盘 / 触摸 / 自动轮播一律直通。R80 的快滚防鬼畜行为实测零回归（18/18）。

### 三、验证
- `test_mod_stats.js` **27/27**（两处源码级断言随改动更新：`.on` 允许画在 `::after`、新增「热区 ≥16×20」守护、`PERIOD_TARGETS` 接受 `SAMPLE_DAYS`）
- 本地：`_smoke_r77` 20/20、`_smoke_r73` 29/29 桌面 + 29/29 手机、`_smoke_r75` 26/26、`_smoke_r80_scroll` 18/18 桌面 + 18/18 手机
- 线上 GH Pages（md5 命中 `134d190e…`）：`_smoke_r69` 36/36 双端、`_smoke_r80_scroll` 18/18、`_smoke_r79_shelliframe` 7/7（**首跑洗词条 iframe 停 480 为冷启动竞态，原样重跑 7/7**）
- 镜像（第二十四轮，全树 IDENTICAL 1741、`verified: true`、sandboxId 与分享链接未变）：`_smoke_r69` 36/36 双端、`_smoke_r80_scroll` 18/18、`_smoke_r79_shelliframe` 7/7（iframe 高 1148）
- 探针实测：`tagInBar=false`、90 天行 `insideRow=true`（tag 落在行矩形内）、圆点 `18×24` 且边缘 ±7px 仍命中按钮；远跳 `idx 0 → 4`、`0 → 2` 均直达（逻辑点击 + 真实鼠标点击双路径）

### 四、R81b 跟进（`8f5b962`）· 窄屏挂点
- 「全部周期」清单是 `@media(min-width:1081px)` 才渲染，手机上彻底没有，tag 跟着消失 → 在 90 天那张周期卡的标题行再挂一份 `.sample-tag.p-sample`。
- 两份互斥：`.p-sample{display:none}` 默认隐藏（宽屏只认清单行），`@media(max-width:1080px)` 里改 `inline-block`；已完成 / 未完成两个分支都带，手机上翻到 90 天卡看到「📆 90 天 `建议样本` … 样本期」。
- 验证：`test_mod_stats` 27/27（新增 4 条双挂点断言）；本地 `_smoke_r75` 25/25 手机、`_smoke_r73` 29/29 手机、`_smoke_r80_scroll` 18/18 桌面；线上 GH `_smoke_r69` 36/36 双端；镜像第二十五轮 IDENTICAL 1741、`verified: true`、`_smoke_r69` 36/36 手机 + `_smoke_r79_shelliframe` 7/7；真站手机实测 `cardTag{display:inline-block,w:47,h:16,visible:true}`、桌面 `display:none`。
- 线上生效耗时 **220s**（GH Actions 排队，平时 20–80s）—— 轮询别提前判失败。

---

## 2026-10-31（第二十八轮）

**R80 · 定制模组统计：信息窗改悬停浮层 + 修快滚鬼畜 + 纵向压紧**（`3eebd59`）

### 一、用户需求（8 条）
1. 信息窗点击后「在旁边展示即可、做悬停展示」，不要 toast 弹窗
2. 「已记录 52 天 还需 38 天达到建议样本」这句没用，移除
3. 90 天的进度条上打个 tag「建议样本」
4. 堆叠卡一旦滚动速度变快就鬼畜、偏移原有位置，动画也不够优雅
5. 参考标题的信息窗，悬停展示 `#recordCount` 里的文本
6. 「添加每日记录」后面加信息窗，把「先选择当天设置…」收进去（悬停/点击在旁边展示）
7. 「双倍日也填写实际数量，不要自行乘以 2」文本标红
8. 添加每日记录 + 右侧两个卡片还能再压，让历史记录往上一点

### 二、实现
**信息窗（1 / 5 / 6）**：把 R79 的「居中 dialog + 半透明遮罩」整套换成 `.info-tip` 悬停浮层——
- 三处 ⓘ（标题 / 添加每日记录 / 历史记录）共用一套 `bindInfoTips()`：mouseenter 即开、移开 160ms 收、
  点击可钉住，✕ / Esc / 点空白关闭；手机无 hover，点按同样能开。
- 定位全用 JS 按按钮矩形写 px：宽度 `shrink-to-fit` + `max-width:440px`（「共 52 条」这种短内容
  不再拖出一条 440px 空条，实测 server 440 / entry 403 / history 264），上下自动翻向，
  `max-height` 也用 px 而**不用 vh**（本页被 `index.html` 以 iframe 嵌入，vh 会正反馈）。
- 小三角用 `--tip-arrow` 对齐按钮中心；`#serverInfo` 容器名不变，`updateServerSummary()` 路径不动。
- 内容：奖励参数与期望口径 / 录入说明（原 panel-sub + 双倍日提示）/ 记录概况（原 `#recordCount`）。

**样本条（2 / 3）**：删 `#statDaysSub`（「还需 N 天达到建议样本」）；新增 `.sample-track` 把
「建议样本」tag 挂在 90 天进度条末端（条满 = 90 天，tag 就是终点刻度）。

**标红（7）**：`.lbl-note.warn{color:var(--red)}`，只作用于「（双倍日也填写实际数量，不要自行乘以 2）」。
顺带修正帮助文案——原文「系统会将当天直接掉落…按双倍规则计算」与代码不符：直接掉落用用户填的
实际值（不乘 2），只有克拉肯碎片自动 `×2`。

**快滚鬼畜（4）三个根因**：
1. 每个 wheel 事件都翻一张（快滚时 1 秒 20~30 次）→ `periodGo` 加 `PERIOD_STEP_MIN_MS=110` 节流；
   被拒时**保留累计位移**（`wAcc -= STEP` 而非清零），下一帧继续翻，不丢滚动量；
   点击圆点/清单行/键盘/触摸是离散操作，`force:true` 直通。
2. `layoutPeriods` 每次都先 `height:auto` 再全量测量（快滚下 50+ 次强制布局/秒）→ 卡高缓存
   `periodMaxH` + `periodDirty`，只在 render / resize / `document.fonts.ready` 时重量。
3. 环绕时旧主卡从「主卡位」瞬移到「另一侧远隐位」也走同一个 `transition` → 反向穿过整张卡飞出去
   （残影）。位移 > 半卡高改「跳位瞬移」（`transition:none` + 强制 reflow + 下一帧恢复）。
4. 让位阈值 `PERIOD_WHEEL_ESCAPE` 520（一圈）→ **1000（两圈）**：实测 520 时「快速连滚看几张」
   就会命中，页面一下滚走 400~500px，正是被反馈成「位置偏移」的现象；让位那一格仍 `preventDefault`，
   下一格才交给页面。动画 `0.45s → 0.42s`，曲线改 `cubic-bezier(.22,.72,.2,1)`。

**纵向压紧（8）**：删掉 entry / history 两个面板头的副标题行（内容进 ⓘ，`panel-head` 高 80→52），
`panel-head` 11/16、`form-body` 15/16、`entry-row` 14/14/26、周期卡 padding 12、`p-main` 26px、
`period-dots` 9px、KPI 卡 `min-height` 112 + padding 16、模块间距 14、header 12/12。
桌面实测（1440×1000，52 条数据）：历史面板 top 748→**700**、表格 top 829→**753**（-76px）、
文档高 1577→**1495**；手机 390×844：表格 1435→**1339**（-96px）、文档 1986→**1884**；
iframe 内高度 1231→**1155**。

### 三、踩坑（都是断言/探针写错，不是页面坏）
1. **`getBoundingClientRect().height` 会被露边卡的 `scale(.965/.93)` 缩掉** → 量出 126/122/117
   以为是「五张卡不等高」，`offsetHeight` 才是真实高度（全员 126）。
2. **CDP 的 `mouseWheel` 在 headless 下会合并/丢事件**（24 发只到 15 个、12 发只到 6~7 个）→
   「快滚翻几张」的断言不能按事件数算，要从帧序列统计 `periodIdx` 变化次数；要滚满阈值就
   把 `deltaY` 提到 400 用更少事件。
3. **`deviceScaleFactor:2` 也会让鼠标/滚轮坐标按设备像素换算**（不只是 `mobile:true`）→
   窄视口探针一律 `dpr=1 + mobile:false`，否则 390 档滚轮全打到错误位置（表现为「慢滚不翻页」）。
4. **页面压紧后 `recenter()` 居中卡片时可能已贴到页面底部**，「让位」再多也滚不动 → 假失败；
   让位类断言要先 `scrollTo(0,0)` 再重算坐标。
5. **让位计数只从「末张环绕」那一下开始累计** → 测试不先 `periodGo(4)` 就永远等不到让位。
6. **GH Pages 上字体常最后到，字体到位后卡高会再变一次** → 卡高断言前必须 `await document.fonts.ready`。
7. `_smoke_r69_modstats` 的参数顺序是 `<HOST> <W> <H> <PAGE> <TAG>`，漏了 PAGE 会把 `f1` 当成页面名 → 404 全红。

### 四、验证
- 11 套 `test_*` 全绿（`test_mod_stats` **27/27**，5 处源码级断言随新版式更新）
- `_smoke_r69` **36/36**（本地 / GH × 桌面 / 手机）；`_smoke_r77` **20/20** ×4；
  `_smoke_r73` **29/29** ×2；`_smoke_r75` **26/26 & 25/25**；`_smoke_r79_shelliframe` **7/7** ×3
- 新增 `_smoke_r80_scroll`（18 项）：三处 ⓘ 悬停出现/移开收起/不与按钮重叠/宽 ≤440、
  快滚 12 次翻 ≥3 张且 `scrollY` 漂移 0、主卡恒 1 张、单卡大幅反向 <4 次、收敛后主卡 y=24、
  慢滚仍一格格翻（3 次 = 3 张）、猛滚 40 次最终让位（不锁死）、卡高缓存随内容刷新
- 新增 `_probe_r80_compress`（改前/改后 A/B 压缩量）+ `_shot_r80_tips`（三处浮层截图）
- `_probe_r79_iframe_info` 改为遍历三处 ⓘ：iframe 高 1562 恒定、父页 scrollHeight 1784 零漂移
- 真站 GH Pages：`_smoke_r69` 36/36 ×2、`_smoke_r80` 18/18 ×2、`_smoke_r77` 20/20、shell 7/7
- 线上 `Last-Modified` = 2026-10-30 16:57:21Z（commit `00:55:33+08:00`）；`tools.json` 版本 `20261031c`

---

## 2026-10-30（第二十七轮）

**R79 · 定制模组统计三处做减法 + 外壳 iframe 高度修复**（`530cc0f` + `0bee4f9`）

### 一、用户需求

1. 「已记录 52 天 / 还需 38 天达到建议样本」根底下「全部周期」的进度条重复了，建议移除
2. 「双倍日 19 天 · 活动双倍记录」移到「历史记录」的「碎片累计 / 可兑换」旁边
3. 「定制模组统计」标题旁增加信息窗 UI，把「奖励参数与期望口径」相关文本移进去

### 二、改动

| # | 项目 | 说明 |
|---|---|---|
| 1 | 删「全部周期」行底进度条 | 已完成行的 `|偏差%|` 量尺、未完成行的样本完成度，都与同一行的「-11.4%」「还需 26 天」以及顶部样本条进度条重复，12px 行内三条同类信息互相打架。`.pa-bar` 及 5 条 CSS 规则一并删除，行内只留文本 + 状态圆点 |
| 2 | 双倍日归位历史记录 | 顶部样本条只留「已记录 N 天 / 还需 N 天达到建议样本」一条主线；`#statDouble` / `#statDoubleSub` 移除，改由历史面板头金色徽章 `#doubleDaySummary` 渲染（与「碎片累计」「可兑换」并排） |
| 3 | 奖励口径改信息窗 | 原顶部折叠长条（收起仍占 46px）→ 标题旁 ⓘ 按钮 + 居中浮层（`fixed`，不进文档流）。点遮罩 / ✕ / Esc 关闭，`aria-expanded` 与 `hidden` 同步；内容容器仍是 `#serverInfo`，`updateServerSummary()` 渲染路径不动 |
| 4 | 文案纠错 | 使用说明里「每 2.6 秒轮播」是 R77 改 4.6s 时漏改的，一并修正 |

### 三、附带修掉的外壳 bug（`0bee4f9`）

线上 GH Pages 首访点「定制模组统计」，iframe 停在默认 **480px** 高、页内出现双向滚动条，必须 resize 窗口才撑开（headless 与有头 Chrome 均可复现；本地起服务因资源快而复现不了）。根因两条叠加：

1. `switchTo` 里 iframe 刚 append 就调 `fitFrame`，此时 `contentDocument` 还是 `about:blank`（`body.scrollHeight=0`）→ `apply()` 直接 return；
2. 同一次调用却已 `new ResizeObserver` 并 observe 了这份**马上被丢弃**的 about:blank body → 真实文档换进来后再没有观察者。若 `load` 事件又因某个子资源迟迟不完成而延后，就两头落空。

修法：`window.__frameBody[id]` 记录上次观察的 body，换了才重建 RO；`fullscreen` lock 分支同步清掉；新增 `scheduleFit()`（250ms×3 + 600ms×6 ≈ 4.4s）有限次重试兜住 load 迟到。**R70 的「目标与当前差 ≤6px 即收敛」正反馈防线原样保留**。版本 `js/shell.js?v=20261030a → 20261031a`。

### 四、验证

- 本地 8811 全绿：`test_mod_stats` 27/27，其余 10 套 `test_*` 通过；`_smoke_r69` **36/36**（桌面 1440 + 手机 390）；`_smoke_r77` 20/20、`_smoke_r73` 29/29、`_smoke_r75` 26/26 & 25/25
- 新脚本 `_smoke_r79_shelliframe`（遍历 5 个导航项）：本地桌面 / 手机 index / 手机 mobile.html 各 **6-7 项 FAIL=0**；线上 GH 桌面 7/7、手机 7/7 —— mod_stats 1231（桌面）/ 1683（手机）、reroll 988/2386、战力 2430/3458，头像预览 fullscreen 走 lock 分支不受影响
- 新探针 `_probe_r79_iframe_info`：打开/关闭信息窗期间 iframe 高恒定（手机 1683 / 桌面 1231），父页 `scrollHeight` 零漂移 → 新弹窗不会撑高父页
- 页面整体上移 **62px**（顶部折叠条消失）；手机 390 历史面板三个徽章同一行（右边界 329 < 可用 366），无横向溢出
- 踩坑记录：`_smoke_r79_shelliframe` 首版断言 `h>400` 会被 iframe 默认 480 骗过（假绿）；reroll 页骨架先到 878、数据补完后 988，拿首帧判稳定也会误报 → 改「尾帧对比 + h>600」；GH 偶发 CDN 抖动会让 `readyState` 卡在 loading 90s，重跑即可

---

## 2026-10-30（第二十六轮）

**R78 · 定制模组统计：桌面右列补「全部周期」清单填空 + 滚轮改累计位移分页**（`8290acb`）

### 一、用户需求

1. 堆叠卡片底下有点空，需要优化，但不能影响手机端浏览
2. 每次滑动循环，滚轮会让页面滚动，"应该加载有点问题"

### 二、留空的真实来源

桌面两列（>1080px）时左列表单 414px、右列周期卡只有 198px，卡下方空 **217px**。
实测数据：`entryPanel.b=780` vs `periodPanel.b=563`，差 −217px。

### 三、改动

| # | 项目 | 说明 |
|---|---|---|
| ① | 「全部周期」清单 | 5 行（60/30/90/180/365），行高 32~56 由 `flex:1` 自适应；改后 `delta=+6px`（几乎齐平），1100px 宽时 `delta=0` |
| ② | 同源数据 | 与堆叠卡共用同一份 `order`：点行切卡、当前行高亮，圆点/键盘/滚轮/轮播全部同步 |
| ③ | 行底细条 | 3px，已完成周期＝`\|偏差%\|/20%` 量尺（绿/红/金同偏差带），未完成周期＝样本进度（灰绿） |
| ④ | 手机零影响 | `.period-all{display:none}`，只在 `@media(min-width:1081px)` 打开；390 实测 `.period-all` 高度 0、`periodPanel` 仍 191px |
| ⑤ | 滚轮去时间锁 | 删掉 380ms 时间锁（会把快速滚动整段吃掉，只翻 1 张就不动）→ 改累计位移，每 100px 翻一张 |
| ⑥ | 滚动不跟手 | 手势间隔 >200ms 视为新手势 → 慢慢一格一格滚永远在翻页、页面不动（用户反馈的核心） |
| ⑦ | 让位阈值 | 只有「环绕后同一次手势继续同向滚」累计 520px（约绕满一圈）才把滚动交还页面，保留「滚轮不能锁死页面」铁律 |
| ⑧ | 触摸让位 | 从「下一次手势无条件让位」改为 600ms 时间窗，行为可预期 |
| ⑨ | deltaY 归一化 | `deltaMode===1` 时 ×16（行模式滚轮） |

### 四、验证

- 11 套 `test_*.js` 全绿（`test_mod_stats` 26→27，新增⑱）
- `_smoke_r77_period_loop` 20/20（慢滚 4 次翻页且 `scrollY` 不变；快滚 6 次后页面接管）
- `_smoke_r73` 29/29（③f 改判「慢滚不带动页面」+ 新增 ③g「快滚能脱出」）、`_smoke_r75` 26/26 / 25/25
- GH + 镜像 × 桌面 1400×800 + 手机 390×844 全绿；iframe 高度探针桌面 1288 / 手机 1722 `STABLE`
- 镜像第二十一轮：3 文件覆盖、清理 0、全树 IDENTICAL 1741、`verified: true`，sandboxId 与分享链接未变

### 五、踩坑

1. **`mobile:true` 会让 `Input.dispatchMouseEvent` 坐标按设备像素换算** → 390 宽时滚轮打偏到页面外，表现为「页面滚、卡片不翻」的假失败。窄视口用 `width:390 + mobile:false` 即可（`_smoke_r73` 一直如此）。
2. **`querySelector('.period-card')` 取的是 DOM 第一张，不是当前主卡** —— 主卡翻到末张时第一张已被移出视口，坐标算到页面外。改用 `[aria-hidden=false]`。
3. **`html{scroll-behavior:smooth}` 会让 `scrollIntoView` 之后的坐标测量错位**：必须先把 `documentElement.style.scrollBehavior='auto'`，再轮询矩形稳定（两次相同才采用）。
4. 慢滚时浏览器 scroll anchoring 会在卡片缩放后微调几个像素 → 断言给 ±8px 容差。

---

## 2026-10-30（第二十五轮）

**R77 · 定制模组统计：周期堆叠卡改环形无限循环，自动轮播 2.6s → 4.6s**（`ec94b06` + `7ea0be8`）

### 一、用户需求

> 堆叠卡片要支持可以无限滚动，从 1 混到末尾之后又可以循环，导致从末尾滚到 1 也可以循环，卡片自动翻页时间要长 2 秒。

### 二、实现

| # | 改动 | 说明 |
|---|---|---|
| ① | `periodGo` 取模 | `Math.max(0, Math.min(n-1, i))` → `((i % n) + n) % n`：`-1`＝末张、`n`＝首张，圆点 / 键盘 / 滚轮 / 触摸 / 自动轮播全部走同一入口 |
| ② | 环形偏移 `periodOffset` | `d = (i - focus + n) % n`；`d ≤ 2`（主卡 + 2 层露边）恒排在视图下方；更远的隐藏卡按方向摆（前进放下方、后退放上方），新卡才从正确方向滑进来 |
| ③ | 方向判定 `periodDir` | `((next - focus + n) % n) > n/2` 判为反向 —— 只取最近的一圈，圆点回跳 3 格不会被拉去横扫整圈 |
| ④ | 删 `period-no-anim` | 末张→首张本就是同一方向的滑动，不再需要瞬切复位（类与 JS 一并删除，单测反向断言） |
| ⑤ | 轮播 2600 → **4600ms** | 轮询 400 → 150ms，实测间隔 4649～4662ms |
| ⑥ | 环绕后**页面让位** | 无限循环会把页面滚死（历史坑：滚轮到边界必须放行）。滚轮：环绕过一次后 0.9s 内同方向继续滚一律 `return`（不拦截）→ 实测 `scrollY 55 → 195`；触摸：环绕后下一次手势整段让给页面（`periodTouchPass`，touchmove 不 prevent、touchend 不翻页） |

### 三、踩坑

- **只有「全部折成负偏移」会让堆叠感消失**：第一版后退方向把所有卡折成 `-(n-1)..0`，结果反向翻页 / 圆点回跳后卡片变平（只剩 1 张可见），A 版露边丢了 —— 老 `_smoke_r75` 的 ④b/④c 当场抓到（`tops 24/-760/-570/-380`、`zoom 1/1/1/1`）。改成「露边恒在下方、只有隐藏卡按方向摆」后，末张 365 也能看到下一圈（60/30）的露边，与循环语义一致。
- 冒烟脚本里的 `periodAutoHold=1e12` 是**过去时间**（`Date.now()` 已 ≈1.7e12），等于没暂停，截图会截到轮播中途 —— 一律写 `Date.now()+600000`。
- 磁盘满（`Errno 28`）导致镜像同步解包失败：清掉 `临时文件/out/` 下 918 个 `_cdp_*` 无头 Chrome 用户目录（约 6GB）后重跑。

### 四、验证

- `test_mod_stats` 25 → **26**（新增⑰环形循环：取模、偏移、方向判定、让位常量），11 套 `test_*.js` 全绿
- 新增 `_smoke_r77_period_loop` **19 项**：前进连翻 5 次回到原点、末→首环绕（`dir=+1`、被翻走的卡透明移出、3 层可见）、首→末环绕（隐藏卡在上方、露边仍在）、圆点直达、滚轮环绕、滚轮让位（页面 scrollY 增长）、触摸环绕 + 让位手势、自动间隔实测
- 本地 1400×800 / 390×844 各 19/19；GH 双端 19/19；镜像双端 19/19
- 回归：`_smoke_r73` 28/28（③d 改判「首张上滚＝环绕到末张」、③e/③f 改判「环形不卡死 + 让位后页面能滚」）、`_smoke_r75` 26/26（轮播时序全部按 4.6s 放宽）
- iframe 高度探针（390）：`RESULT=STABLE`（末帧 1728，尾部 4 帧零变化）
- 镜像第二十轮：3 文件覆盖、清理 0、全树 IDENTICAL 1741、`verified:true`，sandboxId / 分享链接未变

---

## 2026-10-30（第二十四轮）

**R76 · 定制模组统计：安卓竖屏浏览紧凑化，整页 2892 → 2062px（-29%）**（`82d3240`）

### 一、用户需求

> 安卓竖屏浏览器浏览体验有点差，需要优化下。现在有很多大块的留空

### 二、根因：`flex-basis` 在纵向退化成高度基准

`.entry-row .drop-wrap{flex:1 1 250px}` / `.note-wrap{flex:1 1 140px}` 是给**桌面横排**写的（basis 当宽度用）。≤720px 时 `.entry-row` 改成 `flex-direction:column`，basis 立刻变成**高度基准**：

| 子块 | 内容真实高度 | 被撑成 | 多出的空白 |
|---|---|---|---|
| `.drop-wrap`（每次直接掉落） | 101px | 250px | **149px** |
| `.note-wrap`（备注） | 68px | 140px | **72px** |

合计 220px 虚假留白 —— 就是用户看到的「大块留空」。修法：≤720px 覆盖 `flex:0 0 auto`，高度交还内容。

### 三、逐项改动（全部限定 ≤720 / ≤560，桌面与平板零影响）

| # | 项 | 改前 | 改后 |
|---|---|---|---|
| ① | `.entry-row` 子项 | `flex:1 1 250px/140px` | `flex:0 0 auto`（表单 833 → 418px） |
| ② | 顶部动作 | 3 键一行 +「清空当前服」独占整行 | 四键一行（`flex:1 1 0` + 12px），header 281 → 229px |
| ③ | KPI 卡 | `min-height:124px` | `min-height:0`，padding 11/12，value 23px |
| ④ | 样本条 | 两行（`sample-item{width:100%}`） | 一行，73 → 34px |
| ⑤ | 表单 | 单列 4 行 | 两列 `139px + 1fr`：日期｜Boss、次数｜双倍 |
| ⑥ | 下拉箭头 | 原生箭头占 ~20px 且不可压 | `appearance:none` + 自绘 9×6 svg，宽度还给文字 |
| ⑦ | 历史记录 | 行高 72px | 行高 ~44、字号 12、首列 `sticky` 横滑不丢日期 |
| ⑧ | 周期间距 | 48px（`period-wrap` 与 `#periodPanel` 重复计数） | 24px |
| ⑨ | `.table-scroll` | 曾写 `min(58vh,520px)` | **固定 440px** —— 禁 vh，否则 iframe 内又成高度正反馈 |

### 四、下拉文本实测（canvas measureText，360 / 390 / 412 三档）

| select | 文本 | need | avail | 结果 |
|---|---|---|---|---|
| `#inputBoss` | 克拉肯 · 定制模组 + 碎片 | 131~140 | 164 / 186 | fit |
| `#inputRuns` | 3 次（同步器 <400） | 111~112 | 116 | fit（单独 11.5px 留余量） |
| `#inputDouble` | 否 · 普通日 | 58~61 | 164 / 186 | fit |

### 五、验证

- 11 套 `test_*.js` 全绿（`test_mod_stats` 25/25 不变，纯 CSS 不改逻辑）
- 390 竖屏：`docH` **2892 → 2062**，`scrollWidth == 390` 无横向溢出
- 线上 GH 与镜像双端：`_smoke_r75_layout` 26/26（桌面）+ 25/25（手机）、`_smoke_r73_period_stack` 28/28
- iframe 高度探针：桌面 `RESULT=STABLE`（内 body 1288）、**手机 390 新增探针 `RESULT=STABLE`**（iframe 1728 / 内 body 1722，6 秒零增长）

### 六、遗留

历史记录表格 16 列在 390 下仍需横滑（已加首列吸附 + 压行高）。可选下一步：精简列 / 卡片化，待用户裁决。

---

## 2026-10-30（第二十三轮）

**R75 · 周期卡改 A 版轻堆叠 + 2.6s 自动轮播；添加记录与周期统计并排一行**（`1ce3002`）

### 一、用户需求

> 轻堆叠 · 单卡改为方案A，并且会自动轮播，2~3秒轮播一次 添加每日记录
> - 优化：「同步器 · 每日次数」修改为「同步器 · 每日次数（国服按每日 3 次计算）」【底下的国服按每日 3 次计算需要移除】
> - 「每次直接掉落 · 按拦截顺序填写」修改为「每次直接掉落（双倍日也填写实际数量，不要自行乘以 2）」【底下的双倍日也填写实际数量，不要自行乘以 2 需要移除】
> - 这块区域的「每次直接掉落 · 按拦截顺序填写」、「备注（可选）」、「➕ 保存记录 重置」可以优化为一行显示
> - 添加每日记录 跟 周期统计看看能不能一行显示

### 二、周期统计：A 版轻堆叠 + 自动轮播

| 项 | 实现 |
|---|---|
| 露边 | `PERIOD_PEEK=12, PERIOD_PEEK_SCALE=0.035, PERIOD_PEEK_MAX=2`；主卡铺在视口底部，后两张各上移 12px、从底边缩 3.5%，只露顶部一条边 |
| 视口高度 | `卡高 + 24`（两层露边），不多占高度 |
| 轮播间隔 | `PERIOD_AUTO_MS=2600`（2.6s 一张） |
| 循环 | 末张后回到第 1 张，加 `.period-no-anim` 禁一次过渡 → 瞬切复位，避免倒着滑过 5 格 |
| 暂停 | 鼠标悬停 / 手动翻页（滚轮·触摸·圆点·方向键）后 9s 内 / `document.hidden` / `prefers-reduced-motion: reduce` |

`periodAutoHold` 是模块级 `let`，冒烟脚本可直接赋值按住轮播，避免 2.6s 一次的自动翻页打断手动翻页断言。

### 三、并排一行 + 文案

- 新增 `.entry-period`：`grid-template-columns:minmax(0,1.62fr) minmax(0,1fr)`，添加每日记录在左、周期统计在右，`≤1080px` 回落上下单列
- 表单 `.form-grid` 由 4 列改 **2 列**（只占左列时 4 列会被挤成 145px 一格，下拉框放不下「否 · 普通日」）
- 底部三块合并为 `.entry-row` 一行：掉落输入 / 备注 / 保存·重置；`≤720px` 竖排
- **掉落汇总行「当天直接模组 / 每次 0~3」改绝对定位**挂到行底预留区：否则这一格比其他两格高，`align-items:flex-end` 后三个输入框顶端差 31px
- 「同步器 · 每日次数」加 `.lbl-note` 小字（12px）`（国服按每日 3 次计算）`，删掉输入框下方那行 `#runsHint`；国际服仍在同处显示 `（400+ 4 次 · 600+ 5 次）`，日期细节进 `title`
- 「每次直接掉落」加 `（双倍日也填写实际数量，不要自行乘以 2）`，删掉底部那句独立的 `.form-note`；`.form-footer` / `.entry-bottom` 两个旧容器一并删除

### 四、验证

| 项 | 结果 |
|---|---|
| `test_mod_stats` | 22 → **25** 项（⑭ 并排容器与一行布局 / ⑮ 文案与旧节点清零 / ⑯ 露边常量与轮播间隔 2~3s） |
| 新冒烟 `_smoke_r75_layout.js` | **26 项** × 本地 1400/760/390 + GH 桌面 26/26 · 手机 25/25 + 镜像桌面 26/26 · 手机 25/25 |
| `_smoke_r73_period_stack.js` | 适配 A 堆叠后 27→**28** 项（新增 ①h 露边层次），本地三档 + GH 双端 + 镜像双端全绿 |
| R69 结构 35 / R71 配色 38 | 本地双端、GH、镜像全绿 |
| 其余 10 套 `test_*.js` | 全绿 |
| 主站 index / mobile | 双端 ALL PASSED |
| iframe 高度探针 | `RESULT=STABLE`，内高 1471 → **1288**（并排后页面变矮） |
| 镜像 | 3 文件差异 → 全树 **IDENTICAL 1741** → `verified:true`，分享链接未变，3 个关键文件线上 md5 全 MATCH |

线上 `Last-Modified` = 2026-10-30 12:44:17Z（commit `20:42:34+08:00`）。数值口径零改动。

> 三条探针/桩的坑：① 测试桩没有 `setInterval`/`matchMedia` → 自动轮播一启动就 `ReferenceError`，已补；② 窄屏下周期卡不在首屏，悬停测试的鼠标坐标命中不到元素 → 先 `scrollIntoView` 再派发；③ 760px 这类中间宽度其实放得下一行，断言不能写死「窄屏必须竖排」，改成「同一行或依次竖排且不重叠」。

---

## 2026-10-30（第二十二轮）

**R74 · 周期统计去掉面板外框与标题行，只留卡片本体**（`ee3b9fb`）

### 一、用户需求

> 📊 周期统计 累计：第 1–N 天 · 本段：仅当前区间 这些描述包括外框都可以移除，就留一下里面的预期卡片就行

### 二、改动

| 位置 | 改前 | 改后 |
|---|---|---|
| 容器 | `<section class="panel" id="periodPanel" aria-labelledby="periodTitle">` | `<section id="periodPanel" aria-label="周期统计">`（无白底 / 边框 / 圆角 / 阴影外框） |
| 标题行 | `📊 周期统计` + `累计：第 1–N 天 · 本段：仅当前区间，不含之前累计` | 整段 `panel-head` 删除，`aria-labelledby` 一并去掉 |
| `.period-wrap` | `padding:16px` | `padding:0;margin-bottom:24px`（补回面板原有的 24px 底距） |
| `.period-card` | 底 `#f9fdfb→#f0f7f4`，无投影 | 底 `#ffffff→#f7fcf9` + `box-shadow:0 1px 3px rgba(24,60,45,.05)`；hover 投影加深到 `0 6px 16px rgba(24,60,45,.09)` |

**为什么要动卡片底**：body 是 `#f7fbf9 → #eff5f2` 的浅绿渐变，原来卡片底 `#f9fdfb` 与它几乎同色 —— 外框一去掉，卡片会「融进背景」。改成白色渐变 + 自身细投影后，卡片作为独立组件浮在浅绿底上，边界一眼可辨。

**保持不变**：一屏一张、最近完成的排最上（90→60→30，未完成 180/365 在后）、滚轮 / 上下滑动 / 底部圆点 / 方向键翻页、到首尾放行、`periodFocus` 按天数记忆。

### 三、验证

| 项 | 结果 |
|---|---|
| `test_mod_stats` | 21 → **22** 项，新增 ⑬c 锁「无 `class=panel` 外框 / 段内无 `panel-head`·`panel-title`·`periodTitle`·描述文字 / 卡片自带白底与投影 / 圆点仍在」 |
| 其余 10 套 `test_*.js` | 全绿 |
| R73 翻页冒烟 27 项 | 本地 1400/760/390 **27×3**、GH 桌面 **27/27** + 手机 **27/27**、镜像桌面 **27/27** + 手机 **27/27** |
| R69 结构回归 35 项 / R71 配色回归 38 项 | 本地双端、GH、镜像全绿 |
| 主站 index / mobile | `_smoke_live_wb_1016` 双端 ALL PASSED |
| iframe 高度探针 | `RESULT=STABLE`，内高 1477 → **1471**（少了标题行那一行的高度），6 秒零增长 |
| 镜像 | 3 文件差异 → 覆盖刷新 → 全树 **IDENTICAL 1741** → deploy `verified:true`，`sandboxId` 与分享链接未变 → 3 个关键文件线上 md5 全 MATCH |

线上 `Last-Modified` = 2026-10-30 10:49:02Z（commit `18:48:15+08:00`）。

> 探针加固一条：`_smoke_r71_boss_color.js` 原来在导航后固定等 1500ms 就判「页面就绪」，GH Pages 冷启动要拉 Supabase SDK + 字体 + 图片，常常等不到 → 误报「历史记录 0 条」连带 23 项失败。已改成**轮询就绪最多 10s**，重跑 38/38。**以后新写冒烟脚本一律轮询，别写死 sleep。**
>
> 断言写错一条：⑬c 初版用 `html.indexOf("panel-head") === -1` 判全文件，但「历史记录」等其它面板本来就有 `panel-head` → 必然假失败。已改成**只切出 `periodPanel` 这一段再判**。

---

## 2026-10-30（第二十一轮）

**R73 · 周期统计改「一屏一张的堆叠翻页」，底部只留页数圆点**（`38823cf`）

### 一、用户需求

> 「周期统计」优化成类似安卓的堆叠组件一样，不要太过分强调堆叠，最顶上展示最近已完成的统计任务卡牌，支持滑动以及鼠标滚轮翻页。
> 先给我几个原型图做挑选（→ 三版原型 A/B/C）… C 更好一点，然后只保留底部的页数示意。

### 二、原型选择

先出了三版可交互原型（`临时文件/proto/周期统计_堆叠原型.html`，自包含、浅绿 + MaiYuan、滚轮/拖拽/圆点都能真翻页）：

| 方案 | 形态 | 露边 | 翻页 |
|---|---|---|---|
| A 轻堆叠 | 主卡 + 2 层缩进露边（各 12px，逐层缩 3.5%） | 2 层 | 横向 |
| B 预览式轮播 | 主卡 80% 居中，两侧露邻卡 + ‹ › 箭头 | 单侧约 20px | 横向 |
| **C 顶条提示（选中）** | 满宽卡，无露边，顶上一条「还有 N 张」胶囊 + 右侧竖条 | 无 | 竖向 |

用户选 C，并明确**只要底部页数示意**——所以落地时把 C 的顶条胶囊与右侧竖条全部去掉，只留底部 5 个圆点。

### 三、落地实现

| 项 | 改前 | 改后 |
|---|---|---|
| 容器 | `.period-grid{display:grid;grid-template-columns:repeat(5,1fr)}` | `.period-view` 视口（`overflow:hidden` + `contain:inline-size`）+ `.period-dots` 圆点 |
| 卡片 | 5 张平铺，各占 1 列 | 5 张 `position:absolute` 叠在同一格，`translate3d(0,(i-idx)*(H+10),0)` 平移 |
| 排序 | 固定 30/60/90/180/365 | **已完成按天数倒序（最近完成的在最上）+ 未完成正序**：64 天时 = 60 → 30 → 90 → 180 → 365 |
| 高度 | 各卡自适应 | `layoutPeriods()` 量最高那张，统一卡高、视口高＝卡高，不多占一像素 |
| 翻页 | 无 | 滚轮 / 上下滑动 / 点圆点 / 方向键（Home·End 也能跳）；**到首尾自动放行**，不锁死页面滚动 |
| 记忆 | 无 | `periodFocus` 存**天数**不存序号，数据刷新后还停在原周期，不会跳页 |
| 卡片内部 | 左对齐竖排，满宽后数值散落两端 | 左：主数 + 期望；右：偏差 + 状态徽章；底部「本段」整行 |

移除的三个断点规则：`@media(max-width:1150px)` 整条删掉，`720` / `480` 里的 `.period-grid` 片段一并删。

**踩坑 1**：`.p-status` 是 `display:inline-block`，放进 `display:flex;flex-direction:column` 的卡里被 `align-self:stretch` 拉成**整条红带**。修法是把偏差+徽章收进 `.p-right{display:flex;flex-direction:column;align-items:flex-end}`。
**踩坑 2**：原型页 390 下整页被撑到 890px——`.track` 里 5 张 `flex:0 0 86%` 的百分比 flex-basis 在内在尺寸计算里按 auto 处理，min-content 变成 5 张之和。视口容器加 `contain:inline-size` 解决，上线时一起带上。

### 四、验证

| 项 | 结果 |
|---|---|
| 11 套 `test_*.js` | 全绿；`test_mod_stats` 19 → **21**（新增 ⑬ 容器结构 / ⑬b 排序与翻页逻辑） |
| 新冒烟 `_smoke_r73_period_stack.js`（27 项） | 本地 1400/760/390 三档 **27×3 全绿**；GH Pages 桌面 + 手机 **27/27**；镜像桌面 + 手机 **27/27** |
| 覆盖点 | 排序 / 初始停最近完成 / 卡等高 / 视口高＝卡高 / 圆点数量与选中 / 圆点在卡下方 / 滚轮上下翻 / 到边界不越界且页面能继续滚 / 点圆点跳转 / Home·End / 触摸上滑 / 重渲染不跳页 / 无横向溢出 / 无 JS 异常 / 无 4xx / 无外部域名 |
| R69 结构回归（35 项） | 全绿（周期卡断言改为按 `data-target` 取卡，不再依赖 DOM 序号） |
| R71 配色回归（38 项） | 全绿，五色与页头图标未被碰坏 |
| iframe 高度探针 | `RESULT=STABLE`，1585 内高、父页 1725，6 秒零增长（R70 修复未回退） |
| 镜像 | 3 文件差异 → 全树 **IDENTICAL 1741** → deploy `verified:true`，`sandboxId` / 分享链接未变 → 关键文件线上 md5 全 MATCH |

> 假警两条：① GH 上 `_smoke_r69` 的「字体已加载」断言连续 3 次报 `ready=false`，探针实测 3s 时 `document.fonts.status=loading`、`await document.fonts.ready` 后为 `loaded` —— **GH Pages 的 subset woff2 下载慢，是探针竞态**，已改成先等 `fonts.ready`（并等图片加载）；② GH 首跑 R71 出现 9 项失败（含 `renderBossInfo is not defined`），原样重跑 38/38，属 CDN 尚未切新版本时读到的半截页面。

---

## 2026-10-30（第二十轮）

**R71 · 定制模组统计：页头换成模组图标 + Boss 标签按游戏内五属性配色**（`2231f8e` + `c2530d1`）

### 一、用户需求

> - 调整 `<div class="brand-mark"><span>⚙</span></div>` 替换成 `https://theifxzx666-blip.github.io/Nikke_Level/assets/nav_modstats.webp` 的图标
> - 增加 boss 标签颜色区分，根据 boss 颜色展示不同颜色，死神（火属性）、镜像容器（水属性）、过激派（电属性）、茵蒂维利亚（风属性）、克拉肯（铁甲属性）
> - 追加定色：死神红 / 镜像容器蓝 / 过激派紫 / 茵迪维利亚绿 / 克拉肯黄（不要太透亮）

### 二、页头图标

| 项 | 改前 | 改后 |
|---|---|---|
| 结构 | `<div class="brand-mark"><span>⚙</span></div>` | `<div class="brand-mark"><img src="assets/nav_modstats.webp?v=20261030a" alt="定制模组统计图标" width="48" height="48"></div>` |
| CSS | `.brand-mark span{font-size:23px;…}` | `.brand-mark img{width:100%;height:100%;object-fit:contain;padding:5px;…}` |
| 兜底 | — | `.brand-mark` 加 `overflow:hidden` + `flex:0 0 auto`，长标题挤不扁方框 |

图标复用侧边导航那张 `assets/nav_modstats.webp`（64×64 蓝色结晶），**用相对路径而不是 GH 绝对地址**——GH Pages 与 WorkBuddy 镜像两个域名都能命中，也不会触发「禁引外部域名」那条铁律。实测加载后 naturalSize 64×64、渲染 46×46、`object-fit:contain` 不变形。

### 三、Boss 属性配色

`BOSS_CONFIG` 增补两个**纯展示字段**（不进 localStorage、不参与任何计算，所以存档 / 云同步 / 分享码零影响）：

| Boss | 属性 | elem | 色值（浅底深字，`c2530d1` 定稿） |
|---|---|---|---|
| 死神 | 火 | `fire` | `#bf3b26` 红（未变） |
| 镜像容器 | 水 | `water` | `#1b6cb8` 蓝（未变） |
| 过激派 | 电 | `elec` | `#6c3bb8` 紫（原 `#a1770a` 琥珀 → 改） |
| 茵迪维利亚 | 风 | `wind` | `#1c8352` 绿（未变） |
| 克拉肯 | 铁甲 | `iron` | `#7f5c06` 金 + 底 `rgba(178,133,12,.20)` / 边 `.46`（原 `#6a4ab4` 紫 → 改） |

⚠ 首版（`2231f8e`）把**电与铁甲写反了**：电用了琥珀、铁甲用了紫。游戏内实际是 电=紫、铁甲=黄，`c2530d1` 已按用户定色校正。铁甲那条特意把底色 alpha 从 `.14` 提到 `.20`、边框 `.38` → `.46`、文字压深到 `#7f5c06`，因为用户要求黄色**「不要太透亮」**——要的是偏实的金，不是透明浅黄。`test_mod_stats` 新增 ⑫ 项锁死五色 + 四层一致性 + 旧色（`#a1770a` / `#6a4ab4`）零残留，防再次写反。

四处同步染色（都由 `bossElem()` 一个函数出口，改配色只改 CSS）：

1. 历史记录的 Boss 徽章 `.badge.boss.elem-*`（主诉求），`title` 补「X属性」
2. 「奖励参数与期望口径」里的 Boss 参数名 `.param.boss-param.elem-*`
3. 「添加每日记录」右上角日范围徽章（含属性中文名）
4. Boss 下拉框左侧 3px 色条（`select[data-elem]` 用 inset 阴影，不占布局）

「使用说明」补一条五色图例，玩家不用猜颜色含义。

### 四、验证

| 项 | 结果 |
|---|---|
| 11 套 `test_*.js` | 全绿；`test_mod_stats` 16 → **18**（属性映射 + 页头图标）→ **19**（`c2530d1` 五色锁） |
| 本轮冒烟（38 项 × 1400 / 760 / 390） | 本地 **114/114**、GH Pages 桌面 **38/38**、镜像桌面 **38/38** + 手机 **38/38**（定色后复跑同样 38/38 × 本地 3 档 + GH + 镜像双端） |
| R69 结构回归（35 项） | 全绿，作者新版 UI 未被碰坏 |
| iframe 高度探针 | 稳定在 1584px，1.2s 到位后 6 秒零增长（R70 修复未回退）。探针判定同步改为「取已设高后尾部 4 帧是否一致」，原先拿首帧（冷启动默认 480）比末帧会误报增长 |
| 主站 index / mobile | `_smoke_live_wb_1016` 双端 ALL PASSED（`EXPECT_V=20261029a`、`style.css 20261027b`、`mobile.css 20261019c`） |
| 镜像 | 3 文件差异 → 覆盖刷新 → 全树 **IDENTICAL 1741** → deploy `verified:true`，`sandboxId` 与分享链接未变 → 4 个关键文件线上 md5 全 MATCH |

> 假警一条：手机端第一次跑主站冒烟报了 `style.css 版本 ≠ 20261029a`，原因是没传 `EXPECT_V_CSS`，`mobile.html` 引的仍是 `20261027b`。补参数后全绿，非页面问题。
>
> 定色那轮又踩两条：① GH Pages 首次冒烟报「页面就绪」失败（冷启动 4 卡+表格没渲染完），原样重跑即 38/38；② 镜像手机主站冒烟首次 `FAILED: 3`，重跑全绿。**冷启动首跑别当回归，先原样重跑一遍再判断。**

---

## 2026-10-30（第十九轮）

**R70 · 修「定制模组统计」页面高度无限增长**（`3cab19d`）

### 一、用户反馈

> 那个滚动条，我这边打开之后就无限变长

### 二、根因：两个因素相乘

| 因素 | 说明 |
|---|---|
| ① `mod_stats.html` 的 `body{min-height:100vh}` | 本轮跟随作者新版 UI 时带进来的（R68 那版没有）。作者是**独立打开**用的，不存在 iframe 场景；一旦被 `index.html` 以 iframe 嵌入，`100vh` 就等于 **iframe 自身的高度**，body 被撑到视口高 |
| ② 父页 `shell.js` 的 `fitFrame()` | 把 iframe 高度设为 `max(body.scrollHeight, documentElement.scrollHeight) + 6`，而 `documentElement.scrollHeight` 在 iframe 内**下限就是视口高度** |

两者相乘 → 「`100vh` 把 body 撑到视口 → 父页再 +6 → `100vh` 又变高」的正反馈，`ResizeObserver` 每轮都触发 `apply()`，没有终止条件。

实测（本地无头 Chrome，1400×1200，打开子页后每 400ms 采样）：

| 时刻 | iframe 高度 | 父页 scrollHeight |
|---|---|---|
| 0ms | 492 | 1212 |
| 2.4s | 2454 | 2588 |
| 6.0s | **3768** | **3902** |

父页滚动高度同步增长，就是玩家看到的「滚动条无限变长、永远拉不到头」。

### 三、修法（两处，缺一不可）

- **`mod_stats.html`**：删掉 `body{min-height:100vh}`，原位留注释说明为什么不能再加回来。独立打开时 body 背景会自动传播到 canvas，照样铺满整个视口 —— 已用 1400×2400 高视口 + 空数据截图确认底部没有断边。
- **`js/shell.js` `fitFrame()`**：加收敛判定，目标高度与当前高度相差 ≤6px 就不再改动。这条是根治 —— 否则任何子页只要出现「内容比 iframe 视口矮」，重算时都会 +6 自举，单次交互看不出来，长期累积同样会把页面撑长。

修复后：

| 子页 | iframe 高度变化 | 父页 scrollHeight |
|---|---|---|
| 定制模组统计 | 1584 → 1584（= 内容 1578 + 6，正好包裹） | 1718 → 1718 |
| 洗词条计算器 | 988 → 988 | 1212 → 1212 |
| 战力计算Beta | 2299 → 2299 | 2433 → 2433 |

> 「收益账单」在 `tools.json` 里 `enabled: false`，没有导航入口，不参与。

### 四、影响面

- `shell.js` 是全站 iframe 宿主，但它只多了一个「差值 ≤6px 不动」的判定，首次设高与内容大改时行为不变；三个启用中的子页高度均重新实测确认正常。
- `index.html` / `mobile.html` 的 `js/shell.js?v=` `20261009b → 20261030a`；`tools.json` 的 `mod_stats.html?v=` `20261030a → 20261030b`。
- 数据格式、导出、云同步、游戏数值全部未动。

### 五、验证

| 项 | 结果 |
|---|---|
| 11 套 `test_*.js` | 全绿（含 `test_mod_stats` 16/16） |
| mod_stats 冒烟 35 项 × 1400 / 390 / 760 | 105 项，FAIL=0 |
| iframe 联动探针 | 11/11（**新增第 9 项「iframe 高度 3 秒内不增长」**，把这次的问题锁死） |
| 主站 index / mobile | 各 29/29（`shell.js` 有改动，双端复跑） |
| 真站 GH Pages | mod_stats 35+35、主站 29+29、iframe 11/11、子页高度全稳定 |
| 镜像 WorkBuddy | 同上全部一致；5 个改动文件 md5 全 OK，`sandboxId` 与分享链接未变 |
| 线上生效 | `Last-Modified` = `2026-10-30 09:15:35Z`（= 17:15:35 +08:00），提交 17:09:34 |

### 六、踩坑（探针自己的假警）

- **首采样点太早**：真站懒加载慢，第一次采样发生在 `fitFrame` 首次设高之前，把 `480 → 1584` 的「首次设高」误判成增长。改为先等 2.5s 再采基准。
- **就绪选择器不精确**：`'.nav-btn,[data-view]'` 会被页面里其它带 `data-view` 的元素提前命中，于是在导航还没渲染完就去找按钮 → 误报「入口不存在」。改用准确的 `.app-nav-btn`。
- 顺手把 iframe 探针里写死的版本号 `v=20261030a` 改成「只要带 `?v=` 即通过」，免得每轮升版本都要改探针。

---

## 2026-10-30（第十八轮）

**R69 · 定制模组统计跟随作者新版 UI**（`156dd65`）

### 一、用户需求

> 作者优化 UI 了，需要你同步下，然后我的主题以及字体还是保持不变。

即：`mod_stats.html` 是作者 sa_yuki 的页面，作者改版后要跟；但浅绿主题、MaiYuan 字体、作者名牌、☁️ 账号同步入口必须原样保留。

### 二、作者这版改了什么（全部采纳）

| 项 | 旧 | 新 |
|---|---|---|
| 统计卡 | 6 张（实际/天数/双倍/理论/偏差/偏差%） | **4 张**（实际/理论/偏差/偏差%） |
| 天数·双倍 | 占两张卡 | 下沉成一条**样本条**（带 90 天进度条） |
| 周期卡 | 只有累计 | 累计 + **「本段」增量行**（虚线分隔，注明区间） |
| 表格表头 | 单行 16 列 | **两级表头**（记录4 / 掉落2 / 碎片3 / 累计3 / 偏差2 / 备注操作2 = 16） |
| 表格滚动 | 整页滚 | 表体限高 620px 独立滚动、日期列横向吸附 |
| 奖励参数 / 使用说明 | 常驻面板 | 改成可折叠 `details` |
| 日历弹窗 | 只往下弹 | 按剩余空间**自动上下翻转**，超高内部滚动 |
| 表单 | 7 列挤一行 | 4 列主字段 + 「掉落 / 备注」双栏 + 底部说明与操作条 |
| 服务器按钮 | 长文案常显 | 长后缀收进 `.srv-suffix`（默认隐藏） |
| 主题 | 只有深色 | 深色 + `prefers-color-scheme` 浅色分支 |

### 三、我方保留（下一轮别当"遗留"删掉）

- 浅绿主题 `--primary #1d9e75` + MaiYuan 字体（`@font-face` → `assets/fonts/maiyuan-subset.*`）
- 作者名牌 `author-chip` → `space.bilibili.com/76579052`
- ☁️ 账号同步入口 + `openParentSync()`（iframe 内调父页 `__nikkeSync.open('mod_stats')`）
- **R65 数据安全三条**：存储键 `nikke_mod_stats_v3` 与 `{cn:[],global:[]}` 一字不动；记录层 `runs/drops` 与 `d1/d2/d3` 双写；`saveAll` 失败返回 `false`，新增/删除/清空/导入四处都会中止并提示
- `syncTier` 本机无偏好时用最近一条记录的 `runs` 兜底

### 四、口径

游戏数值一位没动：国服触发率 0.58 / 国际服 0.69，碎片 37 / 50，1·2·3 个概率 0.700963 / 0.289037 / 0.01，期望与偏差判定全部照抄作者新版。

作者这版新增 `EPS = 1e-6` + `cmpBand()` 做浮点分档（偏差 > 0.3、百分比 > 5 才变色），顺带替掉我方原来的裸比较，避免边界值抖动。

**深色主题不启用**：删掉整段 `@media(prefers-color-scheme: dark/light)`，`<meta>` 与本页 `:root` 固定 `color-scheme: light`。

### 五、顺手修的两处

1. 补 `<link rel="icon" href="assets/favicon.jpg">`（与 `index.html` 一致）—— 原先浏览器会去请求 `/favicon.ico` 吃 404。
2. 顶栏按钮在 ≤720px 由 `flex:1` 等分改为 `flex:1 1 auto` + `nowrap`：我方比作者多一个「账号同步」，等分四格会把「清空当前服」挤成两行。

### 六、验证

| 项 | 结果 |
|---|---|
| `node test_mod_stats.js` | 16/16 |
| 11 套 `test_*.js` | 全绿 |
| `_smoke_r69_modstats.js` 本地 1400×1200 / 390×844 / 760×1000 | 35 + 35 + 35，FAIL 0 |
| 真站 GH Pages 桌面 / 手机 | 35 + 35，FAIL 0 |
| 镜像 WorkBuddy 桌面 / 手机 | 35 + 35，FAIL 0 |
| `_probe_r69_iframe.js` 本地 / 真站 / 镜像 | 10 + 10 + 10，FAIL 0 |

冒烟脚本不是只查元素存在，而是**用 Node 侧独立公式复算**再对 DOM 取数：预置 64 天后校验 实际 294.36 / 理论 257.47 / 碎片 8436 / 偏差 +36.89 逐项一致；再走真实表单录入当天一条 → 65 条且落盘；国服↔国际服切换隔离与恢复；`Emulation.setEmulatedMedia` 模拟系统深色后仍是浅绿；`document.fonts.check('14px MaiYuan')` 为真。

首轮曾有 4 项 FAIL，全是**我断言的错**，页面本身没问题，记下来免得后续误判：

- 分组表头是 **6 组**（作者设计 4/2/3/3/2/2），我写成 8 组；
- 取表头底色时 `querySelector('thead th')` 命中的是分组行（`#eef4f1`），明细行才是 `#e7efeb` —— 两者本来就差一档，不是漏改深色。

### 七、遗留

`client_errors` 上报端点仍返回 404（Supabase 侧表未建，`docs/错误上报-建表.sql` 待执行）。属 R55 既有待办，与本轮无关。

---

## 2026-10-29（第十七轮）

**R68 · 主线 49/50 章推图收益采集上线**（`1e0889f`）

### 一、用户需求

> 主线更新49~50章了，需要你采集下收益，更新到计算器里。

### 二、数据源：两条链路，这次都通了

| 链路 | 取法 | 结果 |
|---|---|---|
| PC 客户端 `StreamingAssets/sd.bin` | 该文件本身就是 ZIP（文件头为 PK 压缩包魔数），直接解出 `CampaignChapterTable` / `CampaignStageTable` | 5 张表，2026-10-29 00:24，比任何历史拆包都新，**不需要 salt** |
| 官方 `StaticData.pack` | lobby 接口 → salt1/salt2 → 解包 → `tmp_mpk2json.py` | 9,820 个 mpk；`RewardTable`（8.65 MB）与 `MainQuestTable`（629 条）均成功转出 |

拦路两件事，都记在这免得下次重踩：

1. **lobby 接口只接受 TLS 1.1**（`https://global-lobby.nikke-kr.com/v1/get-static-data-pack-info-mpk`）。curl / Python urllib 一律被 EdgeOne WAF 挡成 `567`，换 UA、`--tlsv1.1`、`--resolve` 全部无效。可行解是 .NET 的 `SocketsHttpHandler.ConnectCallback` + `SslStream`，且 `EnabledSslProtocols = Tls11`。
2. **本机 DNS 对该域返回 `0.0.0.0`**（`nslookup` 落到 `black.nikke-kr.com`）。必须先用 DoH（`dns.google` / `cloudflare-dns.com`）取真实 IP `43.169.55.10`，再在 C# 里 `new DnsEndPoint(ip, 443)` 直连（`TargetHost` 仍填域名以便 SNI 与证书校验）。

`MainQuestTable` 的 MemoryPack 布局在本版**变了**，旧 schema 解不开（报 `string 长度 1536000257 异常`）。重新反解出：记录头后依次 `Id / Group_id / Category / Condition_id` + 2 个 `Nullable<int>` + 4 个字符串 + 4 个 `i32` + 1 个字符串。判定依据是「629 条解析完，游标恰好落在文件末尾」。

### 三、口径（先自证，再采信）

只累加 `stage_type = Main` 且 `chapter_mod ∈ {Normal, Hard}` 的关卡；`reward_id → RewardTable.Rewards[]` 只取 `Reward_type = 3` 的货币行（1000 → battle、2000 → credit、3000 → dust），credit/battle ÷1000 记 K。

用这套口径复算官方 1~49 章（键 0~48），与线上已发布文件逐字段比对：

| 断言 | 不一致字段数 |
|---|---|
| 推图收益（Normal / Hard × credit / battle / dust + 关数） | **0** |
| 主线任务（task_credit / task_battle / task_dust / task_count） | **0** |

### 四、数值影响（本轮唯一影响；键 0~48 一位未变）

| 键 | 章名 | 官方章 | 关数 N/H | 普通 credit/battle/dust (K) | 困难 credit/battle/dust (K) | 任务 credit/battle/dust · 条数 |
|---|---|---|---|---|---|---|
| 49 | 决战 | 50 | 44/44 | 16090.0 / 48233.4 / 390 | 2929.9 / 40873.8 / 900 | 250.35 / 0 / 650 · 9 |
| 50 | 登上地面 | 51 | 44/44 | 16362.7 / 49178.5 / 440 | 2953.2 / 41226.6 / 900 | 377.55 / 8609.2 / 1950 · 24 |

选最高章 50 时推图收益 = **键 49 + 键 50 合计**（`NEW_CHAPTERS_PER_UPDATE = 2`）：

- 普通 `32452.7 / 97411.9 / 830`
- 困难 `5883.1 / 82100.4 / 1800`
- 任务 `627.9 / 8609.2 / 2600`

连带更新：

| 项 | 旧 | 新 |
|---|---|---|
| `stage_map.json` 关卡数 / 末章 | 1,787 / `Chapter 48` | 1,875 / `Chapter 50` |
| `servers.json` `chapters` / `max_chapter` | 49 / 48 | 51 / 50 |
| 满进度 | `48-36 BOSS` 双侧 → total 3556 → Lv712 | `50-36 BOSS` 双侧 → total 3732 → **Lv747** |
| `base_cap` | 712 | 747 |
| `fallback_chapter` | `48` | `50` |

新章关卡标签（44 关，含两处 A/B 分支）：
`49-1 … 49-13`、`49-13A-1/2`、`49-13B-1/2`、`49-14 … 49-28`、`49-28A-1/2`、`49-28B-1/2`、`49-29 … 49-36 BOSS`；`50-x` 同构。与社区对照站 `nikkeoutpost` 的 1,875 关逐条零差异。

### 五、验证

- `_r68_build_chapters.py` 写盘前双断言（见 §3）**0 不一致**
- 11 个 `test_*.js` 全绿；`test_server_split.js` 新增 ⑥ 组 17 项数据一致性断言（110 → **127** 项）
- 本地无头 Chrome 双端各 **29/29 FAIL=0**
- 真站 GH Pages：桌面 3 次 **29/29**、手机 **29/29**
- 镜像 WorkBuddy：桌面 **29/29**、手机 **29/29**；8 个关键文件与 `git archive` 出口 md5 全 OK
- 线上 `Last-Modified` = `Thu, 29 Oct 2026 05:52:34 GMT`（= 13:52:34 +08:00），与提交时间 13:51:33 对得上，排除「推送成功但 Pages 没构建」

### 六、遗留 · 待用户裁决

**`official_chapter` 字段比官方公告编号大 1。** 数据里存的是静态表 `CampaignChapterTable.id`（= 游戏内关卡前缀 + 1），所以界面 note 会把键 50 写成「官方第 51 章」；而官方公告与 PV 的口径是：

| 来源 | CHAPTER 49 | CHAPTER 50 |
|---|---|---|
| 官方 4 周年公告 / 巴哈 PV 情报 | 「赌上一切的**决战**」 | 「我们要**登上地面**」 |

对照数据里 `键 49 = 决战`、`键 50 = 登上地面`，可推出 **键号 = 官方 CHAPTER 号**，即 `official_chapter` 整体偏 +1（R21 起沿用至今，共 51 个键）。本轮沿用旧口径未改，因为它牵涉全部键与界面文案，属口径决策而非 bug 修复 —— 待确认后单独一轮处理。

### 七、踩坑

- `test_stage_clear.js` 工作副本一度被写成**全 0 字节**（16,385 B），且 `git checkout` / Python 覆写均报 `Invalid argument` / `Permission denied`；改用 PowerShell 先改名再删才解开。按 HEAD 内容恢复后 `git diff --numstat` 为空（内容零变化），未纳入提交。
- 推送被拒（远端有 avatar R24 的独立提交），`pull --rebase` 因工作区有「仅换行差异」的文件而中止；`git add` 后该差异消失（index 与 HEAD 一致），rebase 顺利完成。
- 真站冒烟首轮出现过 23 项 FAIL 的**假警**：就绪判定只等「下拉项数 > 40」，冷启动时页面结构与数据未同时到位。已加固为「按钮 + 下拉 ≥ 51 + `NikkeServers`/`NikkeOutpost` 均已挂载」，并给单次 evaluate 加了超时重试。

---

## 2026-10-26（第十六轮）

**R67 · 整理仓库：重写 README、新建 docs/、删除无引用的 sync/**（`81c2ef2` + 措辞更正 `6dc023c`）

### 一、用户需求

> 整理下当前的项目文件夹，更新下 agent 以及 skills，并且更新到 GitHub 项目上。现在 GitHub 项目上有很多无用的描述，且项目文件夹划分以及注释说明等都很不专业，需要精简优化。

### 二、README 的问题（逐条核实）

原文件 166 行，是 2026-08-10 首版的遗留，与现实脱节：

| 问题 | 证据 |
|---|---|
| 占位链接没替换 | 第 3 行 `https://你的用户名.github.io/仓库名/` |
| 目录结构过期 | 写 `nikke-planner-web/`，真实仓库根本不叫这名；6 个入口页只提了 1 个 |
| 缺一半功能 | 全文不含 `mobile.html` / `mod_stats.html` / `ledger.html` / `combat_reroll.html` / `tools.json` / 账号同步 / `js/` 里 12 个模块中的 6 个 |
| 混进开发步骤 | 「更换背景图」「zip 打包分发」「GitHub Pages 四步部署教程」 |
| 过期数字 | 金标准仍写 474/487/496/503（R60 后 `box_gain` 已改连续值）；R63 已更正国服口径却仍留「国服约 40 章」 |

### 三、改法

- **README 重写为 96 行开发者向说明**：线上地址 → 6 个工具的功能表 → 真实目录结构 → 本地起服两条命令 → 测试 → 数据与口径 → 文档索引 → 免责声明与存档键约定。选「开发者向」而非「玩家向」，因为这个仓库的读者是改代码的人，玩家看的是站点本身。
- **新建 `docs/`（8 个文件）**：`ARCHITECTURE.md`（模块职责 + 数据流 + 9 条不变量）、`CONTRIBUTING.md`（改动流程 / `?v=` 规则 / 提交规范 / 验证要求 / 发布方式），另迁入 5 份数据口径与核对报告 + `错误上报-建表.sql`。过程性的实施提示词、逐日更新日志不进仓库。
- **删除 `sync/`**：7 个 JSON 是 2026-10-20 NikkeBot 推送的分享码快照，`grep` 全站（js / html / py）零引用。
- **`.gitignore` 注释中性化**：去掉「工程铁律 4」「2026-10-26 用户裁决不入库」这类内部话术，改为说明用途。
- **`test_*.js` 保留在根目录**：11 个脚本内部用 `require("./js/core.js")` 与相对根的数据路径，移进 `tests/` 要逐个改路径，且 100+ 处文档引用会失效，收益不抵风险。
- **事后更正一处**（`6dc023c`）：首版写成「移动端访问会引导到 `mobile.html`」，但 `index.html` 里没有 UA 判断或跳转逻辑，`mobile.html` 是需要单独给链接的独立入口，措辞已改为与实际一致。

### 四、数值影响

**零。** 本轮没有改动任何 `.html` / `.js` / `.css` / `data/*.json`，也没有升 `?v=`。证明方式：把 `eb0cad7` 与 `81c2ef2` 两次归档的运行时资源（html/js/css/json/图片/字体，共 1688 vs 1681 个）逐文件 md5 比对，**内容不同 0 个**，差异恰为被删的 7 个 `sync/*.json`。

### 五、验收

- 11 套 node 测试全绿（ledger 40/0、server_split 97/0、mod_stats 16/0、golden / event_units / monthly_card / stage_clear / box_gain / challenger / keep_one_box / overload_combat 全 PASSED）
- 本地静态服务：8 个入口 + README 里的 8 个 docs 链接全部 200，`sync/_speed.json` 404
- 线上 GH Pages：`README.md` md5 与 `git show HEAD:README.md` **一致**（第 1 次轮询即 MATCH），`docs/ARCHITECTURE.md` 200，`sync/_speed.json` 404
- WorkBuddy 镜像：`git archive` 基准比对 → 写入 10 / 清理 7 / 删空目录 1 → **IDENTICAL** → deploy `verified: true`、`sandboxId` 未变 → `README.md` / `docs/*` / `index.html` / `js/app.js` md5 全部 MATCH

### 六、踩坑

1. **`_verify_r66.js` 对远端站点会偶发假 FAIL**：三次连跑 GH Pages 得 46/46、44/2、43/3，失败项每次都不一样（`__nikkeSync.open` 读到 undefined、点了切服值没变）。原因是手机端 `sync.js` 是动态加载的、`app.js` 的监听绑定晚于「章节下拉已填满」，固定轮询条件不足以覆盖。**不是产品回归** —— 运行时资源与 `eb0cad7` 逐字节相同，而 `eb0cad7` 当时是 46/46。
2. **WorkBuddy 镜像不支持删除已上传文件**：本地目录已删掉 `sync/` 且全树 IDENTICAL，但镜像上 `sync/_speed.json` 仍返回 200（`sync/zzz_not_exist.json` 正确 404 → 不是缓存，是沙箱里文件还在）。站内零引用，不影响使用；换新 sandbox 时会自然消失。
3. **镜像对点开头文件返回 403**（`/.gitignore` → 403），静态服务器拒绝 dotfile，属正常行为，不必处理。

---

## 2026-10-26（第十五轮）

**R66 · 服务器选项挪进「关卡进度」标题行 + 切服静默 + 「用云端覆盖」去掉确认框**（`eb0cad7`）

### 一、用户需求

> ① 优化账号同步功能，现在除了主页，其他页面都不能同步；② 取消掉点击「用云端覆盖」的弹窗提示；③ 服务器这个选项卡移入关卡这里，一行显示即可，默认选中 国服；④ 取消切换服务器类型时的 toast 提示。

### 二、逐条落地

| # | 需求 | 做法 | 结果 |
|---|---|---|---|
| 1 | 子页面也能同步 | 排查结论：**R65 已修好**。`mod_stats` 页的 ☁️ 按钮走 `parent.__nikkeSync.open('mod_stats')`，R65 上线前它只有一句「请回到主页」兜底文案 | 双端 + 真站实测：点按钮 → 父页面面板直接弹出（`#nkSyncPanel.show`，`z-index 5000`），帧内不再出现「请回到主页」。截图里的提示是**旧缓存页面** |
| 2 | 去掉「用云端覆盖」确认框 | `sync.js` 下载分支删掉 R61 的「差异逐项确认」弹窗（`mismatch` / `msg` / `window.confirm`），点了即写盘 | 覆盖前 `pushBackup` 自动备份**保留**，面板里可一键「恢复上一份」；结构校验与版本闸门保留（那两条挡的是「根本不该写」，不是「要不要问」） |
| 3 | 服务器挪进关卡、一行、默认国服 | 删掉「账号状态」顶部的 `.srv-bar` 独立选择块；`关卡进度` 的 `legend` 改 `.lg-split`：左侧药丸「关卡进度 ⓘ」+ 右侧 `.srv-tabs` 分段选项卡，同一行；`#f_server` 降级为 `.field-hidden` | 真值仍写在 `#f_server` 上（存档 / 云端 / 分享码 / 账单口径读的都是它），选项卡只改 `class` 与 `aria-pressed`；新访客默认 `cn`（`state.server` / `defaultForm` / `renderForm` 兜底 / 启动 `applyServerRuntime` 四处同改） |
| 4 | 去掉切服 toast | `applyServerSwitch` 删掉 `notes` 收集与 `tip(msg)` | 越界关卡收敛逻辑**原样保留**（R63 后两服关卡表一致，通常不触发），视觉反馈交给选项卡选中态 |

### 三、踩坑

- **选项卡长在 `<legend>` 里，手机端会误折叠分组**：`setupMobileForm()` 给 `legend` 挂了 `click` 折叠。首版点「国际服」直接把「关卡进度」收起来（截图高度 182 → 64）。→ `click` / `mousedown` / `touchstart` 全部 `stopPropagation`。
- **`#f_server` 改值不会触发重绘**：`setVal()` 只写 `.value`，选项卡选中态会停在上一次。→ 新增 `paintServerTabs()`，在 `renderForm()` 里跟着一起刷。
- **远端站点验证要轮询就绪**：镜像上 `app.js` 的 `init()` 异步加载 `servers.json` + 关卡表，固定 `sleep(2500)` 会偶发「点了没反应」假失败（连跑两次失败项还不一样）。→ 轮询 `#f_normal_chapter.options.length > 0 && .srv-tab === 2` 再断言。
- **镜像别拿 `git show HEAD:` 的 md5 对**：仓库里 `index.html` 是 CRLF 存储、`css/style.css` 是 LF，`git archive` 出口统一成 LF。GH Pages 发的是 blob 原样、WorkBuddy 镜像是归档出口 → 两边 md5 天然不同。**镜像基准用 `_base_*`（archive 解包），GH 基准用 `git show HEAD:`**。

### 四、数值影响：零

- 两服 `max_chapter 48` / `base_cap 712` / 关卡表完全一致；`weekly_reset_day`（周一 vs 周日）与 `equipment_exp_save_ratio`（0.9 vs 1.0）**当前不参与任何计算**。
- 双端实测计算仍出「一共升 10 级」；老存档里的 `server` 字段照旧优先，只有新访客 / 清空后才是国服。
- 11 套 node 测试全绿（ledger 40/0、server_split 97/0、golden / box_gain / stage_clear / challenger / event_units / keep_one_box / monthly_card / overload_combat / mod_stats 全 PASS）。

### 五、版本号

`css/style.css` `20261019d → 20261027b`；`js/app.js` `202610270b → 20261027c`；`js/sync.js` `20261027a → 20261027b`（`index.html` / `mobile.html` 各 1 处同步）。

### 六、验收

- `_verify_r66.js`：静态 4 条 + 双端各 21 条 = **46/46**（本地 / GH Pages / WorkBuddy 镜像三处各跑一遍全绿）。
- 线上：commit `eb0cad7`，`Last-Modified: Mon, 26 Oct 2026 10:10:26 GMT`，5 个改动文件 md5 逐个 MATCH。
- 镜像：HEAD 1707 = 镜像 1707，仅 5 个文件不同 → 写入后复检 **IDENTICAL** → deploy `verified: true`，`sandboxId 1202cc0126f74f1da772352133d20b33` 未变（分享链接不变）。

---

## 2026-10-26（第十四轮）

**R65 · 定制模组统计对齐作者新版（同步器 3/4/5 次 + 掉落数组）：只搬逻辑不搬皮，账号同步侧加「条数」闸门**（`d03f05f`）

### 一、用户需求

> 作者更新了一下页面，现在需要你：① 更新相关逻辑，页面的主题色等还是以我的风格为主；② 需要注意兼容账号同步，避免用户数据丢失。

两条硬约束：**A 只搬逻辑不搬皮**（记录结构 / 次数 / 期望算法 / 表头 / 录入控件照作者；配色字体名牌账号入口照我方）；**B 数据一条都不能丢**。

### 二、作者新版改了什么（逐行对读，40,903 B 深色蓝版 vs 我方 39,352 B 浅色绿版）

| # | 项 | 作者新版 | 我方原状 | 本轮 |
|---|---|---|---|---|
| 1 | 记录结构 | `{date,boss,double,runs,drops[],note}` | `{date,boss,double,d1,d2,d3,note}` | 采新版 + **双写旧字段** |
| 2 | 每日次数 | 下拉 3/4/5，国际服 `2026-10-29` 起、按记录日期判定 | 硬编码 3 次 | 采新版 |
| 3 | 期望算法 | `bossDayExpectation(boss, runs, isDouble)` | 固定 3 次 | 采新版 |
| 4 | 表头 | 16 列（新增「次数」，三次掉落合并「每次掉落」） | 17 列（掉落 1/2/3 分列） | 采新版 |
| 5 | 掉落输入 | 按次数动态 3~5 格 | 固定 3 格 | 采新版 |
| 6 | 导出 | `version:4`，两服都过 `normalizeRecord` | `version:3`，原样 | 采新版 |
| 7 | 存储键 | `nikke_mod_stats_v3`（**没升**） | 同 | **保持不动** |
| 8 | 主题 | 深色 `#0b0f14` + 蓝 `#63a8ff` | 浅色 `#f5f7f6` + 绿 `#1d9e75` + MaiYuan | **不采** |

### 三、数据安全：五道保险

1. **存储键与顶层结构一字不动**：`localStorage["nikke_mod_stats_v3"]` 仍是 `{"cn":[…],"global":[…]}`。加顶层字段或换键 = 云端同步（`sync.js` 的 `ls`）、分享码（`app.js` 的 `v:2` 包）、浏览器里缓存的老页面**三处同时断链**。作者本人也刻意没升键。
2. **记录层双写**：`normalizeRecord` 输出同时带 `runs/drops` 与 `d1/d2/d3`（= drops 前三次）。旧页面读到新数据仍是「2 / 1 / 0」而不是「0 / 0 / 0」。
3. **写盘失败明说**：`saveAll` 加 `try/catch` 返回 `false`；保存 / 删除 / 清空 / 导入失败一律 toast「本机存储空间不足（或处于隐私模式），这次改动没有保存」，不再静默抛异常。
4. **同步面板按条数把关**（`js/sync.js`）：摘要显示「国服 N 条 / 国际服 M 条」；**上传前若本地条数少于云端 → 二次确认**（该功能没有版本号也没有数据日期，整份搬运时条数是唯一分量指标）。
5. **次数字段兜底**：本机没有 `nikke_sync_tier` 时取最近一条记录的 `runs`，新设备下载云端存档后不用重新选档。

### 四、顺带修的排版问题

7 列表单原来用 `align-items:end`（底对齐），「同步器·每日次数」带 hint 后比其它列高 27px，标签与输入框前后错位。改成 `align-items:start` + 按钮 `padding-top:21px` → **7 个字段标签同一水平线、输入框同一水平线、保存按钮与输入框齐平**（手机端 1 列时按钮上边距归零）。hint 文案也压成一行（`10-29 起：400+ 4 次 · 600+ 5 次`），避免把整行拉得参差不齐。

### 五、数值影响

- **3 次记录：所有统计值与改动前逐位相同**（国服老数据零漂移，老记录 2/1/0 → 直接模组 3、理论 3.39、碎片 111）。
- 国际服克拉肯 **5 次**：每日期望 4.21 → **7.02**（×5/3），碎片 150 → **250/日**。
- 历史记录**一律按存入时的 `runs` 计算，不按新规则回算**（作者口径）。
- 今天（2026-10-26）界面上次数下拉**仍是置灰 3 次**，因为 `extraRunsFrom = 2026-10-29` 还没到 —— 这是正确表现。

### 六、版本号

- `tools.json` → `mod_stats.entry: mod_stats.html?v=20260923a → 20261027a`
- `js/sync.js?v=20261026a → 20261027a`（`index.html` / `mobile.html` 双端）

### 七、验收

- 新增 `test_mod_stats.js` **16/16**：v3↔v4 记录互通、`runs` 越界（7/2/字符串）回落 3、drops 补零截断、legacy 双写、按次数期望（5 次 = 3 次 ×5/3、双倍 ×2）、`2026-10-29` 边界、导出往返不丢第 4/5 次、写盘失败返回 `false`、`syncTier` 推断。
- 既有 10 套 node 测试全绿（ledger 40/0、server_split 97/0、golden / challenger / event_units / keep_one_box / monthly_card / stage_clear / box_gain / overload_combat 全 PASS）。
- CDP 端到端 **78 项**：桌面 1400×1200 与手机 390×844 各跑 `real`（今天 → 下拉置灰）与 `fake`（页面内伪造 2026-11-05 → 走完整 5 次录入保存链路）两遍，**FAIL=0**。
- 外壳导航 14 项：iframe src 已是 `?v=20261027a`、帧内 16 列表头、主题未变、高度自适应正常。
- 真站 GH Pages 双端 **9/9 + 9/9**；镜像第五轮（`d03f05f`）关键文件 md5 全等、双端 19/19 + 20/20 + 9/9 + 9/9。

### 八、踩坑

- **headless Chrome 窗口有最小宽度**：`--window-size=390,844` 实测 `innerWidth = 500`。要真 390 视口必须用 `Emulation.setDeviceMetricsOverride`，否则"手机端无溢出"是假绿。
- **跨 realm 数组比较**：`test_mod_stats.js` 在 `vm` 里跑页面脚本，页面里生成的数组原型属于另一个 realm，`assert.deepStrictEqual` 会报「same structure but not reference-equal」→ 断言前先 `Array.from()`。
- **`statTheory` 是累计理论，不是日期望**：日期望在 `statTheorySub`。拿 `statTheory` 断言「5 次 = 7.02」会在空数据时得到 0.00。
- **`_shot_r65.js` 缺 `process.exit(0)`**：脚本跑完 ws 关掉了但 node 不退出，被外层 timeout 打死并报 SIGTERM，看起来像失败 —— 长脚本结尾务必显式 `process.exit`。

### 补记：R61–R64（`5c4fd70`）

当天更早四轮（分服口径 + 基地等级公式对齐两站 + 新增战斗重开计算器）一次性提交，**当时未写 CHANGELOG 小节**，细节见该 commit message 与 `test_server_split.js`（97 项）。其中 R64 把基地等级改回 `max(0, 普通id − 19) + 困难id + 1`（满级 712，不是 715）。

---

## 2026-10-26（第十三轮）

**R60 · 「箱子等到开放日再开箱多赚」改成连续值（小数级），不再在 0/1 之间跳**

### 一、用户问题：577 → 576、多赚 1 → 0，怀疑算错

用户提供 2026-10-26 的导出 JSON，问「前两天算出来是 577，现在越来越少了；而且等到开放日再开箱可多赚 0 级，之前是 1 级」。

用导出反推输入后**完整复现**了当天的结论 —— 开放日 **576**、`box_gain 0`、等待期信用点 **50,319,800**，三个数全对。反推要点：输入是基地 **571** 的收益（`63620 / 643570 / 105.87`）对预计基地 **588**（`64800 / 657000 / 107.47`）；导出里 `projected_snapshot.income_per_hour` 显示 64800 是开放日快照把收益切成未来值所致，**不能当输入读**。

### 二、577 → 576 是时间衰减，不是 bug

同一份库存，只把「数据日期」往前滚：

| 数据日期 | 距开放日 | 等待期红球 | 等待期信用点 | 开放日全箱梭哈 |
|---|---|---|---|---|
| 10-16 | 33 天 | 105,515 | 74,561,920 | 581 |
| 10-18 | 31 天 | 99,099 | 70,151,500 | 580 |
| 10-20 | 29 天 | 92,659 | 63,907,860 | 579 |
| 10-21 | 28 天 | 89,435 | 61,921,620 | 578 |
| **10-24** | 25 天 | 79,819 | 55,623,900 | **577** ← 用户记的数 |
| 10-26 | 23 天 | 73,434 | 50,319,800 | **576** |

每 2 天掉 1 级，完全线性。等待期少了 2 天 = 红球少 6,385 个（≈0.4 级）+ 前置活动箱窗口也少 2 天。

「一共升 14 → 11」同理：1 级是上面的衰减，另 2 级来自「现在就开箱」由 563 涨到 565 —— 玩家自己攒箱变强了，「还值得等多少」自然变小。

### 三、多赚 1 → 0 与日期无关，是 0.9 级卡在整数边界

`box_gain_vs_now` 的代码只读「当前收益 vs 新收益」+ 当前库存，**完全不读日期** —— 实测 10-16~10-26 同一库存全程为 0。真相是它本来就不足 1 级：

| 项 | 值 |
|---|---|
| 收益差（588 / 571） | **+1.85%**（信用点）、红球 +1.51% |
| 凑出 +1 级需要 | **+2.02%** |
| 连续口径真值 | **≈0.79 级**（战斗数据层面：差 66,854,540 ÷ 78,347,000/级） |

旧口径是「两次整数等级之差」，0.79 级被取整成 0；而它对箱量**非单调**（×0.90→1、×0.97→0、×1.00→0、×1.02→1），所以会「忽有忽无」，看着像 bug 其实是半级量的取整抖动。

### 四、改法：换成连续值

`box_gain_vs_now` = **同一批箱按新收益 vs 当前收益折算出的资源差额 ÷ 箱子落地等级的单级消耗，取三资源最小值**（`scenarios.js` 新增 `boxResourcesOf()`）。

UI 统一走新加的 `lvText()`：整数就写整数，小数保留 1 位。三处同口径：

- 省流版 Block② 红字：`同一批箱子等到开放日再开箱可多赚 +0.6 级`
- 工具箱「全资源梭哈收益折算」caption：`箱子按新收益折算另 +0.6 级`
- ③ 整合结论① 行：`等到开放日再开箱可多赚 0.6 级`

**整数拆解仍然自洽**：`等待期 + 开箱 + round(多赚) === 总升`（引擎里 `wv + ov + Math.round(boxGain) === diff`）。

**数值影响**：只影响 `box_gain` 本身及其在拆解里的归属，**所有等级结论一个数没动**。默认场景 `多赚 2 → 0.6`（对应 `开箱 +2 → +3`，总升仍 11，第十二轮那条示例的拆分数已被本条取代）；用户实测场景 `0（取整）→ 0.79`。

### 五、验收

- 新增 `test_box_gain.js` **11/11**：收益相等→0、用户场景 0.788 基线锁定、对新收益严格单调、与数据日期逐位相同、对箱量单调、未填收益→0
- `test_*` 8 套全绿；`_verify_r60`（新增，13 条）本地 / GH Pages / WorkBuddy 镜像 × 桌面+手机 全 **13/13**
- 回归：`_verify_r59` 11/11、`_verify_r58` 19/19、`_verify_r42` 14/14、`_verify_r57` 20/20、`_smoke_live_wb_1016` 六端 ALL PASSED
- `?v=`：`js/scenarios.js` `20261014c → 20261026a`、`js/app.js` `20261024c → 20261026a`（双端 html 同步）；样式未改
- HEAD `0760f55`，线上 `Last-Modified` = 2026-10-26 04:55:22Z（commit `12:53:46+08:00`）；WorkBuddy 镜像同步至 `0760f55`（全树 IDENTICAL 1696 文件，分享链接未变）

> 踩坑：`_verify_r59` 的 `可多赚 +(\d+) 级` 只认整数，改小数后 R4 假 FAIL，正则已改 `(\d+(?:\.\d+)?)` 并按 `Math.round` 加和；`_verify_r60` 为了读工具箱文案点了 `tabExtra`，截图前必须先点回 `tabResult`，否则截到补充信息页。

## 2026-10-24（第十二轮）

**R58 · 模板下拉注明「21 天大活动」带地图 ｜ R59 · 省流版改「一共升 N 级」+ 只有「多赚」那项标红**

### 一、R58：21 天大活动确实带地图，标签补「·地图」

用户指出「现在计算器里的 21 天大活动是带了小地图的，也需要在计算器里注明清楚」。

依据在模板里本就写着：`large21.tasks.tokens = 6500`，其中包含**活动地图隐藏道具 1200**（30 件、无前置，可全拿）——所以 21 天变体本来就是带地图的那套。此前的标签只有 `28天大活动·地图` 带标记，21 天没标，容易让人以为它和无地图的 `large28`（ABSOLUTE）是同一套。

下拉四档现在是：

| id | 标签 | 地图 |
|---|---|---|
| `small14` | 14天小活动 | 无 |
| `large21` | **21天大活动·地图** | 有（隐藏道具 1200 已计入一次性代币） |
| `large28` | 28天大活动 | 无（ABSOLUTE 蓝本） |
| `large28map` | 28天大活动·地图 | 有 |

**命名约定**：带地图的模板一律以「·地图」结尾，无地图的不加后缀。已写进 `data/event_templates.json` 的 `_map_note`，并在 `test_event_units.js` 增加 4 条标签断言（带地图必带「·地图」、无地图不带），防止后续改标签时又漂回模糊表述。

**数值影响：无。** 只改 `label` 与版本号；四档基线一个数没动（small14 `2398520` / large21 `4580500` / large28 `5447420` / large28map `4073420`），UI 复验 large21 活动列 信用点 `4.6M` / 战斗 `13.1M` / 红球 `240` / 挑战者箱 `450` / 方舟Ⅰ `46` / 信用点盒 `35` / 战斗数据辑盒 `29` / 芯尘盒 `508` / 成长套组 `23`，与改前逐项一致。

### 二、R59：省流版 Block② 的「比现在多赚 +N 级」有歧义

用户反馈：这句里的 N 是「现在 → 开放日」的**总升幅**，不是白赚的量；而且拆解写「= 等待期到账资源 +6 级、开箱 +7 级」，6+7 与 14 差 1 —— 少的正是「箱子等到开放日再开才多赚」的那 1 级。

改为**可验算的加法**，并且只把真正「多赚」的那项标红（#b3283a）：

> 新主线开放日（2026-10-14），全箱梭哈可到 **同步器 525**（**一共升 11 级** = 等待期到账资源 **+7** 级 + 开箱 **+2** 级 + <span style="color:#b3283a">同一批箱子等到开放日再开箱可多赚 **+2** 级</span>）

- 恒等式 `等待期 + 开箱 + 多赚 === 总升幅`（引擎里就是 `wv + ov + boxGain === diff`），`_verify_r59` 直接解析这三个数做加法校验
- 三项用「+」相连，读者一眼能对上；`boxGain = 0` 时自动省略第三项
- 标红只作用于 `.em-earn` 这一段，其余两项保持原色
- 顺手把「比现在多赚」从结果区彻底清除（`_verify_r59` 断言全文不含该短语）

**数值影响：无。** 纯文案 + 一条 CSS 规则；引擎、账单、四档模板基线全部不变。

### 验证

- `test_*` 7 套全绿（`test_event_units` 新增 4 条标签断言）
- `_verify_r58`（新增）本地双端 **19/19**、GH Pages 双端 **19/19**、WorkBuddy 镜像双端 **19/19**
- `_verify_r59`（新增）本地双端 **11/11**、GH Pages 双端 **11/11**、WorkBuddy 镜像双端 **11/11**
- 回归：`_verify_r42` **14/14**（R3 断言按新口径更新）、`_verify_r57` 本地双端 20/20、`_smoke_live_wb_1016` 三处六端 **ALL PASSED**
- `?v=` → `js/app.js` **20261024c**、`css/style.css` **20261019d**、`data/event_templates.json` **20261024b**（`css/mobile.css` 本轮未改，仍 `20261019c`）

> 记一笔：`_smoke_live_wb_1016.js` 原来用一个 `EXPECT_V_CSS` 同时断言 `style.css` 与 `mobile.css`，本轮两者版本号不同（只升了改的那份）→ 新增 `EXPECT_V_CSS_MOBILE` 单独覆盖，手机端才不再假 FAIL。
> 推送时 `github.com:443` 直连超时、沙箱代理返回 502 / Empty reply，最后借用户已在跑的 Clash `127.0.0.1:7897` 推送成功（`9eec610..eb22b3c`）。

---

## 2026-10-24（第十一轮）

**R57 · 新增 28 天大活动（Map）模板 `large28map` + 模板下拉不再重复天数**

用户提供 `LIE CAUSE RECOIL_活动收益_zh-CN.xlsx`（官方 16 表拆包）：「这是 28 天大活动（Map）的活动收益，需要你录入并更新到计算器内，同时之前的模板里什么 14 天小活动（14 天）这个表述也优化下」。

带地图的 28 天活动与无地图的 `large28`（ABSOLUTE）**是两套模板**，故新增一档而不是改旧数值 —— 旧三档基线一个数都没动。

### 一、新模板 `large28map`（下拉显示「28天大活动·地图」）

| 板块 | 口径 |
|---|---|
| 主线 36 关 / 3 组 | S1N 第 1 天 / S2N 第 8 天（Part 2 = 02-19 05:00）/ S2H 第 15 天；一次性关只给通用主机（**代币 0**，与 ABSOLUTE 的 50 不同），可重复关给 资源盒1h + 咖啡（S1N 40、S2N 40~50、S2H 50）；扫荡目标仍 `S2H1-11`（芯尘盒1h×4 + 50 代币） |
| 挑战 7 关 | 与 xlsx 逐项一致（首通 19320 / 456292 / 16 …），开放日 0/3/6/9/12/15/18 —— 与 ABSOLUTE 完全相同 |
| 任务一次性代币 6970 | Group 10203 6850（12/36 关里程碑各 咖啡×900 + 逐关 100×12 + 150×11 + 200×11）+ Group 10201 里程碑 咖啡×120 |
| 一次性箱 3 类 | 芯尘盒1h×1、成长套组1h×1（10201 里程碑 40/100 点）、方舟Ⅰ×20（小游戏成就「TALENT 等级总和 9」）→ **新增 `tasks.boxes` 字段承载** |
| 每日任务 | **无箱类奖励** —— 本期 8 条每日任务只给活动点数（与 ABSOLUTE / UNBREAKABLE 不同），故 `daily_task` 缺省 |
| 签到 4 档 | 第 4/9 天 补给物资Ⅰ×5/×10、第 6 天 成长套组8H、第 12 天 成长套组12H（其余 10 档为招募券/主机/手册/胡桃） |
| 商店 19 项 | 4 件「免费珠宝 → 彼岸花」不走代币，**不入店**（合计 70 张 = `rush_buy.S2H 70`）；其余按商城展示顺序结算 |
| 未入表 | 地图 13 件（BGM 9 + 珠宝 400）、分卷加成（咖啡×50×2，依赖加成角色）、小游戏首通招募券 —— 均不涉三资源与箱量 |

### 二、引擎：`tasks.boxes`（一次性任务箱类奖励归首日）

`js/events.js` 与 `等级计算/活动收益引擎/skills/activity_income.py` **同构各改 1 处**；字段缺省即无 → 老模板行为零变化。JS / Python 逐日逐键比对 **1664 单元全等**（4 套模板）。

### 三、UI：模板下拉不再重复天数

`app.js` 渲染 option 时判断标签是否自带「N天」，自带则不再追加「（N 天）」：

`14天小活动` / `21天大活动` / `28天大活动` / `28天大活动·地图`（原来会拼成「14天小活动（14 天）」）。

### 数值影响

- **现有三档零变化**：small14 `2398520`、large21 `4580500`、large28 `5447420`（信用点全窗口基线不变）
- **新增 large28map 全窗口基线**：credit `4073420` · battle `13149806` · dust `240` · 挑战者箱 `625` · 方舟Ⅰ `35`
  箱量 信用点盒1h `14` / 战斗数据辑盒 1h `14` + 2h `15` / 芯尘盒 1h `613` + 2h `9` / 成长套组 1h·8h·12h 各 `1`
- `?v=` → `js/app.js 20261024a`、`js/events.js 20261024a`、`data/event_templates.json 20261024a`

### 验证

- `test_event_units` 增补 12 条（4 档清单 / large28map 基线 / `tasks.boxes` 单测）→ 全绿；node 8 套全绿
- `_verify_r57`（新增）本地桌面 **20/20**、手机 **20/20**；真站 GH Pages 桌面 **20/20**、手机 **20/20**
  （模板清单 4 档 / 下拉文案无重复天数 / 窗口 28 天 / 9 项数值 / 补充信息页可见 / 无异常无弹窗）
- 回归 `_verify_r56` 9/9、`_verify_ui_batch2` 全 PASS、`_smoke_live_wb_1016` 双端 ALL PASSED

> 记一笔：推送时被拒（`non-fast-forward`）—— 远端多了 12 个 `mod-sync:` / `speed` 提交，只新增 `sync/*.json`。
> `git -c rebase.autoStash=true rebase origin/main` 无冲突后推送（他人未提交的 README/css 未受影响）。
> 线上约 30s 生效，`Last-Modified 07:03:01Z` vs commit `15:02:05+08:00`。

### 四、WorkBuddy 镜像同步发布（第六轮，`177ac78`）

用户当轮「也一起更新」，并定为**此后默认流程**：每轮 GH Pages 上线后直接接着发布镜像，不再逐轮征询。

- `git archive HEAD` 基准 **1695** 文件 vs 旧镜像 **1688** → 仅基准有 7（远端 `mod-sync:` 新增的 `sync/*.json`）/ 仅镜像有 0 / 内容不一致 **6**（恰为 R57 变更集）→ 覆盖刷新后复比对 **IDENTICAL**
- deploy `verified: true`，`sandboxId` 与分享链接均未变：https://nikke-level-planner.app.workbuddy.host/
- 线上 6 个关键文件 LF 归一化 md5 与 HEAD 基准**全等**；真站 `_verify_r57` 桌面 **20/20** + 手机 **20/20**、`_smoke_live_wb_1016` 双端 **ALL PASSED**（无 4xx / 无外部域名 / 无弹窗 / 无异常）


---

## 2026-10-20（第十轮）

**R56 · 活动「剩余 N 天」基准改为今天（旧口径按数据日期，数字对但极易误读）**

用户：「活动日期计算这对吗？9.30 开始的活动，怎么还有 4 天？」

先说结论：**活动区间本身没算错，错的是「剩余」这句话的基准。**

9/30 起的 21 天大活动 = `9/30 ~ 10/20`（含头含尾共 21 天），今天 10/20 **正是最后一天**。但标签显示「剩余 4 天」——因为 R25 起这个标签的基准日是**数据日期**，4 = 10/20 − 10/16。数字自洽，可玩家读到的意思完全相反。

- **基准日**：`refreshActivityStatus` 由 `val("f_recorded")` 改为 `todayLocal()`，「未开始 / 已结束 / 剩余 N 天 / 今天最后一天」四档全部按今天判定
- **计入天数不丢**：那个数本来就该跟数据日期挂钩（活动从数据日期次日起才计入），出口照旧 —— 预览区「已计入 N 天（区间）」原样保留
- **新增 title**：悬停显示 `活动 2026-09-30 ~ 2026-10-20（按今天 2026-10-20 算剩余）；本次计入 4 天（2026-10-17 ~ 2026-10-20）`，两个口径同时可见，不再混读

复现与预期（node 直算引擎）：

| 数据日期 | 活动区间 | 计入区间 | 旧文案 | 新文案 |
|---|---|---|---|---|
| 2026-10-16 | 9/30 ~ 10/20 | 10/17 ~ 10/20（4 天） | 剩余 4 天 ❌ | **今天最后一天** ✅ |
| 2026-10-20 | 9/30 ~ 10/20 | 0 天 | 今天最后一天 | 今天最后一天（title 写明计入 0 天） |
| —（今天 10/20） | 10/03 ~ 10/23 | 10/21 ~ 10/23 | — | 剩余 3 天 |

数值影响：**零** —— 只改表单状态标签的判定基准与提示文案，`planActivity` / inject 区间 / `aggregate` 一行未动。
`?v=` → **js/app.js 20261020a**（仅此一个）。

验证：`_verify_r56`（新增）桌面 **9/9**、手机 **9/9**（今天最后一天 / 数据日期挪 30 天文本不变 / title 含区间与「计入 4 天」/ 剩余 3 天 / 未开始 / 已结束 / 计算主流程正常 / 无异常无弹窗）；回归 `_verify_ui_batch2` 全 PASS；node 8 套全绿；真站双端 9·9。

**踩坑**：`_verify_r56` 第一版就绪判定写的是 `!!document.getElementById('btnCalc')` —— 那是**静态 HTML 标签**，`app.js` 还没执行完就已存在，本地（文件秒开）不会露馅，真站上就变成「标签在、事件没绑」，点添加活动毫无反应、`.event-row` 恒为 null，8 条断言连环红。改成「等 `NikkeEvents.getTemplates()` 有模板，且点一次 `#btnAddEvent` 真能长出 `.event-row`」才稳住。**以后所有真站脚本的就绪判定都要看「行为」而不是「标签存在」。**

---

## 2026-10-19（第九轮）

**R55 · 错误码体系 + 云端错误上报（玩家侧故障可查）**

用户：「你就加个错误代码监测，然后有保存的，检测到发送到云端给我们查阅监测」。

R54 只解决了「这次为什么连不上」，但玩家关掉页面就什么都不剩。R55 补的是**事后可查**：所有错误带编号、先落本地、能补发就补发、脱敏后进云端表。

- **错误码字典**：`js/errlog.js` 里 `CODES` 是唯一来源（E1xxx 网络 / E2xxx 账号 / E9xxx 兜底，共 17 条）。错误条右上角直接显示编号，玩家报障只需说一个 `E1002`
- **先存后发**：`localStorage`（键 `nikke_errlog_q_v1`）队列，上限 80 条、5 分钟同码去重。**连不上云端正是最需要留下来的时候**，所以发送失败绝不丢数据；补发时机为 `online` / `visibilitychange` / 启动 1.5s / 每 45s
- **脱敏**：`redact()` 抹掉邮箱、JWT、40 位 token，message 截断 500 字；全局 `error` / `unhandledrejection` 只收同源异常，不碰第三方脚本噪音
- **直连 PostgREST**：上报走 `fetch` 打 `/rest/v1/client_errors`，**不建第二个 supabase client**（会抢 session 存储，登出登录互相打）
- **建表 SQL**：`docs/错误上报-建表.sql`，RLS 只开 INSERT、revoke SELECT，前端在表未建时静默保留队列不报错
- **`app_ver` 取 sync.js 的 `?v=`**，不是全页最大 `?v=` —— 否则记成 `ledger` 的版本，排查时分不清哪个模块在跑

数值影响：零（新增 `js/errlog.js` + `sync.js` 埋点 + 两个页面引入）。`?v=` → errlog **20261019a**、sync **20261019d**。

验证：`_verify_r55` 桌面 12/12、手机 12/12（页面内劫持 `fetch` 只截 `client_errors` 并返假 201，**不往线上表写脏数据**）；回归 `_r54` 8·8、`_r53` 22·23、`_r52` 34·34、`_r50` 23·23；node 7 套全绿；真站双端 12·12。

**部署事故**：`f00f481` 推送成功、`git ls-remote` 与 `raw.githubusercontent` 都取得到，但源站 `Last-Modified` 一直停在 `15:22Z`（=R54 的 `787f55b`），`js/errlog.js` 持续 404。`Age: 0` 刷新后仍是旧内容 ⇒ **不是 CDN 缓存，是 Pages 构建卡住**。补一个空提交 `4675fad` 也没产生新 deployment，最终在 Actions 里重跑 `pages-build-deployment` 才恢复（`Last-Modified` → `10-19 16:14:57Z`）。教训：**`push` 成功 ≠ 上线，判定看 `Last-Modified` 而不是只比 md5**。

---

**R54 · 账号连不上云端：15 秒超时 + 断点定位 + 连接自检**

用户：「用户设备能打开网页，但是每次使用账号功能都会提示没能连上云端，他也没开代理」。

**这不是站点故障。** 页面（GitHub Pages）与数据库（Supabase）走两套完全不同的境外线路，国内部分运营商只掐后一套，于是「站能开、云连不上」。而 supabase-js **默认不给请求设超时**，弱网下会一直转圈，最后只抛一句 `Failed to fetch` —— 既分不清超时还是被阻断，玩家也不知道下一步干什么。旧文案还写着「换个网络（或先关掉代理）」，对本案**恰好说反了**（玩家本来就没开代理）。

- **网络层**：`timeoutFetch` 通过 `createClient` 的 `global.fetch` 统一注入，所有 auth / db 请求 15 秒必返回；失败打 `__netStage`（`timeout` / `unreachable`）标记。SDK 自带 `signal` 时不接管，避免破坏它自己的取消能力。两处 `createClient` 收敛到 `newClient()`
- **文案纠偏**：超时与阻断分成两句不同的话，都给出可执行动作（网页与数据库是两条线路 / 挂代理或换网络 / 本地数据不会丢），不再把英文原文抛给玩家
- **连接自检**：登录面板底部「连不上云端？点这里自检」直探 `/auth/v1/health`。**判定标准是「有没有拿到响应」而不是状态码** —— 不带 apikey 返回 401 反而证明 DNS / TCP / TLS 三段全通。结论三档 + 显示检测目标与耗时，便于玩家截图反馈
- **兜底**：SDK 没加载出来时不再抛 `TypeError`，改为提示刷新 / 换浏览器 / 关广告拦截

**顺带修**：R53 引入的密码框「显示」按钮是 `position:absolute`，却被放在 `.nk-pwrow` **外面**（兄弟节点），最近定位祖先跳到面板层级 → 按钮浮在弹窗右边缘之外。挪进 `.nk-pwrow` 内部 + `padding-right:52px`，并加几何断言 N7 锁住。

数值影响：零（`js/sync.js` 纯 UI 层 + 两个 `?v=`）。`?v=` → **20261019c**。

验证：`_verify_r54` 桌面 8/8、手机 8/8（用 `Network.setBlockedURLs` 模拟运营商阻断，请求出不了浏览器、**不打线上库**）；回归 `_verify_r53` 22·23、`_r52` 34·34、`_r50` 23·23、`_r47` 24、`_r48` 23；node 7 套全绿；真站双端 8·8。

**踩坑**：① 本机 `9410` 端口被别的程序占着（返回 JWT 而非 CDP 列表）→ 脚本 `FATAL no target`，换端口即可，**先 `netstat` 确认空闲再起 Chrome**。② 阻断场景要用 `Network.setBlockedURLs`（`navigator.onLine` 不变，贴近运营商阻断），用 `emulateNetworkConditions offline` 会走「离线」分支，测不到要测的那条文案。

---

## 2026-10-19（第八轮）

**R53 · 修复邮箱注册：注册即可用 + 报错中文化 + 移动端补账号入口**

用户：「用户反馈无法注册邮箱，还有的用户忘了密码，但是我们没有相关的补救措施」。

排查后有 **四个**独立问题叠在一起：

| # | 问题 | 说明 |
|---|---|---|
| 1 | 文案把人带沟里 | Supabase 侧 `mailer_autoconfirm: true`（邮箱确认**本来就是关的**），但旧页面底部写着「注册后需到邮箱点确认邮件再登录」→ 玩家收不到信 → 以为注册失败 |
| 2 | `emailRedirectTo` 缺失 | `signUp` 没传回跳地址；GH Pages 是 `/Nikke_Level/` 子路径，只给 origin 会掉到根目录 |
| 3 | 报错全英文 | `Invalid login credentials` / `email rate limit exceeded` 直接抛给玩家，看不懂 |
| 4 | 手机端没有入口 | `addTrigger()` 只认桌面 `.hero-toolbar`，`mobile.html` 没有这个容器 → 手机端从未注入过「账号同步」按钮 |

改动（只动 `js/sync.js` + 两个页面的脚本版本号）：

- **注册链路**：`signUp` 补 `emailRedirectTo`（当前页面所在目录）；返回 `session`（关确认时的正常返回）→ 直接登录；只返回 `user` → 进「待确认」视图（邮箱回显 + 重发确认邮件 + 去登录 / 换邮箱重注册）；`identities` 为空（Supabase 防枚举）→ 回登录页提示「已注册，用原密码登录」。
- **报错中文化**：新增 `explainAuthError()`，按 `error.code` 优先、message 关键字兜底，覆盖密码错 / 邮箱未确认 / 已注册 / 密码太短 / 邮箱格式 / 限流 / 关闭注册 / 发信失败 / 网络 / 数据库。登录撞上「未确认」或「密码不对」时，错误条下直接给「重发确认邮件」入口。
- **输入体验**：邮箱前端格式校验（不合规不发请求）、提交时按钮显示「登录中…/注册中…」、登录↔注册切换保留已输入邮箱、注册模式 `autocomplete=new-password`。
- **移动端**：`addTrigger()` 增加兜底，挂到 `.m-top-act`（顶栏「保存 / 同步」右侧），复用 `m-top-btn` 样式，文案「账号」。

**数值影响：零**（引擎 0 行改动）。
**验收**：`_verify_r53` 桌面 22/22 · 手机 23/23（用可控假后端劫持 `window.supabase` 驱动真实 UI，不打线上库；断言含 `emailRedirectTo` / `resend` 参数 / 11 种报错文案）；回归 `_verify_r52` 34·34、`_verify_r50` 23·23、`_verify_r47` 24、`_verify_r48` 23；node 7 套测试全绿；真站双端冒烟 6·6。
**上线**：`c690171`，`?v=20261019a`（`js/sync.js`）。

⚠ **遗留**：「忘记密码」需要 Supabase 配自定义 SMTP（自带邮件服务每小时 2 封且只发项目成员），否则重置邮件发不出去 —— 等用户决定 SMTP 方案后做第二轮。

---

## 2026-10-19（第七轮）

**R52 · 收益账单：周期 = 统计窗口（不是预估）+ 箱子构成比重**

用户：「这个周期不是用来做估算的，而是用来统计这个周期内一共收了多少资源」「箱子 · 日均这里需要展示大致的箱子比重，比如用图标表示（例如信用点盒3：红球盒1：战斗数据辑1）」。

### ① 周期语义纠正：算账窗口，不是预测

R51 把周期做出来了，但文案处处是「口径 / 折算 / 预览 / 能攒多少」，读起来像在预测。本轮只改语义与措辞（**算法一行未动**）：

| 位置 | 改前 | 改后 |
|---|---|---|
| 区间条标签 | 统计周期 | **统计区间**，右侧加说明「选一个区间 = 这段时间里一共收到多少」 |
| 区间行 | 周期口径（30 天）· 每日基地产出按「…」折算 | **统计窗口 30 天** · 每天按「…」**入账** |
| 卡片副标题 | 区间合计 / 该周几合计 | 区间**累计** / 该周几**累计** |
| 小表标题 | 各周期对比 · 一个周期内能攒多少（合计口径） | **各统计区间累计** · 每行 = 这段时间里一共收到多少 |
| 小表表头 | 信用点合计 / 战斗数据辑合计 / 红球合计 | 信用点**累计** / 战斗数据辑**累计** / 红球**累计** |
| 未填开放日提示 | 暂按未来 14 天**预览** | 暂按未来 14 天**统计** |
| 底部说明 | 账单不替它**估算** | 账单不替它**折算**；并补一句「统计区间是算账窗口」 |

**口径澄清**（写进 `ledger.js` 头注释）：选 30/60/90/180/365 天 = 把这 N 天里逐日到账的收益加起来，回答「这段时间一共收了多少」。仍是 R51 的那一套——费率按开放日切换、推图只计一次，差异只有天数。

### ② 箱子 · 日均卡展示箱子构成比重

```
箱子 · 日均
7.2 个
累计 430 个 · 60 天里 11 天有箱
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░▁▁▁▁▁
[芯尘盒]277 [挑战者]84 [方舟]24 [战斗]23 [信用点]11 [成长]11
```

- **`boxMix(rows)`**（新增，`js/ledger.js`）：按**箱名合并**（8h 芯尘盒 + 2h 芯尘盒 = 芯尘盒），返回 `{ name, kind, count, pct }`，个数降序、同个数固定箱在前。`pct` 是**个数占比**，不是资源占比。
- **堆叠条 + 图标图例**：条宽 = 个数占比（`min-width:3px`，小占比不会消失）；图例 = 六个箱子各自的图标 + 个数，悬浮给「箱名 ×N（P%）」，条与图例的 `title` 都给「A 27 : B 8 : …」。
- **配色按「这箱给什么资源」**：信用点金 / 战斗蓝 / 芯尘红 / 成长绿 / 挑战者紫 / 方舟青。
- 比重随周几筛选同步变化（和其余 3 张卡一样走 `agg(rows)` 口径）。

### 关键取舍

1. **比重按箱名分，不按「资源类型」分**。芯尘盒 / 战斗数据辑盒 / 信用点盒本来就是一一对应资源，多定义一层「资源类型」只会和箱子明细汇总表打架；成长套组与自选箱（挑战者 / 方舟）是混合或玩家自选，**单独成类**才不误导。
2. **仍然只数个数**。R50 定下的「箱子不折算」在这次没有松动——比重条是「箱子个数之比」，`pct` 字段注释里写死了这句，防止以后有人拿它去乘资源。
3. **文案层面禁词**：`估算 / 预估 / 能攒`。`_verify_r52` 有一条断言直接扫整页 `textContent`，出现即红。
4. 桌面 `hint` 用 `margin-left:auto` 靠右；手机改用 `order`（`lab 0 / hint 2 / chips 3`）让说明与标签同行、chips 独占下一行，390px 下 6 个区间 chip 仍是一行。

### 坑

- **`.bar-hint` 一开始在 DOM 里排在 `.chips` 之后**，而手机上 `.chips{width:100%}`，说明文字被挤到 chips 下面变成第三行。改 `order` 而不是改 DOM 顺序——桌面靠 `margin-left:auto` 右对齐，DOM 一调就会跑到 chips 左边。
- **`_verify_r52` 第一次用了 30 天窗口**，而注入的快照里活动从 10-22 才开始、30 天窗口（09-03→10-02）箱数是 0 → M 区 5 条断言全红。**测「有箱子」的功能要挑真有箱的窗口**（改 60 天，430 个箱子），并且加了一条 `M0 boxTotal > 0` 的前置断言把这种情况先喊出来。
- **R50 的历史脚本断言副标题 `/^合计 \d+ 个/`**，本轮把「合计」改成「累计」后会红 → 同步更新 `_verify_r50.js` 的这条断言。改文案要连带扫一遍历史脚本里的文案断言。

### 数值影响：零

`core` / `events` / `outpost` / `boxes` / `scenarios` / `app.js` / `css/*` 一行未动；`js/ledger.js` 只**新增** `boxMix`（纯统计层，不参与 `build()`），`build()` 与 `spanStats()` 的输出逐值不变（`test_ledger.js` 的对拍断言全部保留且绿）。

**验收**：`test_ledger.js` **40/40**（新增 4 条 `boxMix`）；新增 `_verify_r52.js` 桌面 34/34、手机 34/34；回归 `_r50` 23/23·23/23、`_r47` 24/24·24/24、`_r48` 22·23、`_r46` 11、`_r42` 13/14（「版本号 = 20261017a」是写死的历史断言，与本轮无关）、`balance` / `plan_ui` / `form_parity` / `mobile_parity` 全 PASS；真站双端 34/34 · 34/34。

**上线**：commit `77881b5`（`fcead43..77881b5`，直连成功）→ 线上 5 文件 md5 与仓库 blob 全等（`ledger.html` `3b284e05…` / `js/ledger.js` `846b9de6…` / `index.html` `014c6820…` / `mobile.html` `e3119061…` / `tools.json` `7dccf714…`），40s 生效。`?v=` → **`20261019g`**。WorkBuddy 镜像未发布（本轮未授权）→ 仍停 `2e94943`，落后 5 个 commit。

---

## 2026-10-19（第六轮）

**R51 · 收益账单：每日箱子明细 + 周期口径（30/60/90/180/365 天）**

用户：「箱子没有每天收获的明细，只能知道总个数」「统计一般需要按一个事件节点来，才能够看出来一个事件周期内的整体情况（例如 30 天、60 天、90 天、180 天、1 年等）」。

- **每日箱子明细**：明细表里有箱的日子默认在当天那行下面跟一行 `.bxrow`，把 `箱名 + 小时档 × 个数` 摊开成 chip（固定小时箱绿、自选箱金）。表头上方加「箱子明细：展开 / 收起」，状态记 `nikke_ledger_bxopen_v1`——默认展开是因为 63 天里只有 14 天有箱，多出的行不算负担，但用户就是抱怨「看不到每天收了什么」。
- **箱子明细汇总表**：按 `箱名 + 小时档` 聚合，给个数 / 占比 / 出现天数 / 首次→末次，按个数降序。解决「只有总数 614、不知道构成」。
- **周期口径**：`build(snap, { span: N })`，`span > 0` 时区间固定成「数据日期+1 起共 N 天」；`span = 0` 仍是「到开放日」。页面加「统计周期」chips（到开放日 / 30 / 60 / 90 / 180 / 365 天），选择记 `nikke_ledger_span_v1`。
- **各周期对比表**：「到开放日」当基准行，再列 5 个固定周期各自的三资源**合计**与箱数——「一个周期能攒多少」比日均直观；点一行即切换周期。
- **`spanStats(snap, spans)`**：批量算这些周期时共用一份 `events.schedule()`，5 个周期只求解一次。

**关键取舍（写在这里防以后重犯）**：
1. **周期口径不是另算一套**。费率仍按「进入开放日之后改用新基地收益」逐日切换，推图收益仍只在开放日当天计一次——差值只有「天数」。`test_ledger.js` 有一条断言专门做逐日逐值对拍，防止以后为了「周期模式」另写一条算路。
2. **只有 `span === 0` 才校验「开放日不晚于数据日期」**。周期口径下开放日可以落在区间外（用户就想看「未来 30 天」，跟开放日无关），这时仍报「没有可统计的等待期」是错的。
3. **`build()` 的第二参数必须是可选**。不传 = 原行为，27 条既有断言才能一行不改地继续跑。新增能力往「加可选参数」方向长，不要改签名语义。
4. **`span` 上界受 `MAX_DAYS` 夹住**。传 1000 天时 `span` 被夹到 400，`out.span` 反映夹后的值——页面若直接拿用户输入的 N 去比 `out.span` 会不一致，务必读返回值。

**踩坑**：
- 账单里出现 `.bxrow` 后，历史脚本按 `#tbody tr` 数行会把明细行算进天数（`_r47` / `_r49` / `_r50` 统一改成 `:not(.bxrow)`）。**结构一变，所有按行计数的探针都要复查**。
- 箱子汇总的占比进度条一开始用 `Math.max(4, ...)` 保底宽度，结果 1.6% 的行只剩一个 4px 黑点，看着像噪点 → **直接去掉进度条**，占比数字已经够了。
- 手机端 6 个周期 chip 原本「1 年」掉到第二行（第一行 5 个刚好占满）→ chip padding 10→9px、字号 12→11.5px、徽章 11→10px，一行放全。
- 测试里算日期绝不能用 `toISOString()`：`new Date("2026-10-20T00:00:00")` 是本地时间，转 UTC 后在 GMT+8 会落到前一天。统一用本地 `getFullYear/getMonth/getDate` 拼。

**数值影响：零**。`core` / `events` / `outpost` / `boxes` / `scenarios` / `app.js` / `css/*` 一行未动；`ledger.js` 只在 `build()` 上加了可选第二参数；箱子的资源依旧一分数都不进金额（R50 口径不变）。

**验收**：`test_ledger.js` **36/36**（新增 9 项）；新增 `_verify_r51.js` 桌面 22/22、手机 22/22；回归 `_r50` 23/23·23/23、`_r47` 24/24·24/24、`_r46` 11/11、`_r48` 22·23、`_r45` 25/26（B8 动画推进属无头环境已知项）、`_r42` 14/14、`balance` / `plan_ui` / `form_parity` / `mobile_parity` 全 PASS；真站双端 22/22 · 22/22。

**上线**：commit `fcead43`（`bfafd25..fcead43`），线上 5 文件 md5 与仓库 blob 全等；`?v=` → `20261019f`（`js/ledger.js` + `tools.json` 的 `ledger.html` entry）。WorkBuddy 镜像未发布（本轮未授权）→ 仍停 `2e94943`，落后 4 个 commit。

---

## 2026-10-19（第五轮）

> 本轮 = 用户 1 条需求（R50）：「收益账单要统计的：① 每天的基础自然收益（信用点、战斗数据辑、红球）；② 每天收入的箱子数量（仅统计箱子数量，不折算）」。
> commit **`bfafd25`**，`?v=` → **`20261019e`**（`js/ledger.js` 与 `tools.json` 里的 `ledger.html`；`app.js` / `css/*` 零改动）。
> 即：**推翻上一轮（R49）的整套箱子折算**，回到「金额只有基地+活动直接资源，箱子只数个数」。

### 改动

| 文件 | 内容 |
|---|---|
| `js/ledger.js` | 逐日行收敛为 `{date, wd, wdn, res, boxCount, boxItems, hasAct, isOpen}`；`dayBox(fixed, sel)` 只计数；删 `boxVal`/`pickOption`/`FIXED_RES`/`PREF_RES`/`SEL_PICKS` 与 `build` 的 `opts.boxPick`；汇总收敛为 `totals`/`avg` + `boxTotal`/`boxDays`/`boxAvg`（不再有 `boxTotals`/`allTotals`/`avgAll`）；CSV 8 列（日期,星期,三资源,箱数,箱子明细,来源）；`snapSlice` 升 **v3**，不再落 `box_defs`/`challenger_pref` |
| `ledger.html` | 删「自选箱折算」下拉与 `PICK_KEY`；汇总卡 3 → **4 张**（三资源日均 + 箱子卡：大字=日均箱数、副标题「合计 N 个 · M 天里 K 天有箱」）；明细主数字回归纯 `res`；周几对比表末列改「箱数/天」；桌面把这张小表收窄到 **880px 居中 + 数值居中**（原来 6 列摊满宽屏、数值离标签很远）；手机 4 卡走 **2×2** |
| `test_ledger.js` | 删折合 4 项，新增 6 项：`dayBox` 计数 / 明细和=箱数 / **逐日箱数与引擎 `byDate.fixed+selectable` 逐值对拍** / ⚠ 箱子的资源一分数都不进金额 / 旧快照的 `box_defs`·`challenger_pref` 不影响金额与箱数 / CSV 8 列与合计行箱数。**27/27 PASS** |

### 口径（定稿）

- **基础自然收益** = `income_per_hour × 24` + 当日活动「**直接给**」的资源（`byDate[d].res`）+ 开放日一次性推图收益。
- **箱子数量** = `byDate[d].fixed` 各小时档个数 + `byDate[d].selectable` 各箱个数，**不折算成任何资源**；明细（`8h 芯尘盒 ×3`）只用于悬浮提示与 CSV 备注。
- 理由：箱子里面的资源要自己开箱才到账、开哪个还看玩家选择，账单不替它估算；开了 `box_defs` 定价反而会制造「和计算器不一样」的第二套口径。

### 坑

1. **上一轮刚加的东西这一轮整体拆掉** —— 好在 R49 把折算全收在 `ledger.js` 里、页面只读 `all`/`box` 两个字段，所以这轮没有牵连 `app.js`、`css/*`、引擎任何一行。**口径留在单一文件里，改写成本才是可控的。**
2. 汇总卡从 3 张变 4 张会打断历史断言 → `_verify_r47.js` 的 C4（3 张卡）按新形态改成 4 张，其余断言未动。
3. `_verify_r49.js` 的折合断言已被本批推翻，脚本头部已标注「历史批次，跑必红」；当前口径回归看 `_verify_r50.js`。
4. 测「筛选后箱数合计」时踩了自己写的坑：探针里的 `led` 永远是用**整份快照** build 出来的全期结果，拿它当筛选后的合计会恒等；只能读 DOM 合计行，再与周几对比表的「日均 × 天数」对齐（表里日均保留 1 位小数，容差 1）。
5. 按周几对比表在宽屏上 6 列均分 → 数值右对齐后离标签很远；改成 `max-width:880px; margin:0 auto` + 数值居中，扫读距离才正常。

### 上线

- 直连推送失败（`Failed to connect to github.com:443 after 21052 ms`）→ 借 Clash `7897`（`env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY` + `-c http.proxy`）成功（`237ee98..bfafd25`）。
- 线上 5 文件与仓库 blob **md5 全等**：`index.html` `3689c6e4…` / `mobile.html` `dbf54ab2…` / `js/ledger.js` `c643e1b0…` / `ledger.html` `b2af3f33…` / `tools.json` `636970c4…`。
- 真站双端冒烟 **23/23 · 23/23**。
- **数值影响：零** —— `core`/`events`/`boxes`/`scenarios`/`app.js`/`css/*` 一行未动；七套 node 测试全绿。
- **WorkBuddy 镜像未发布**（本轮未授权）→ 仍停 `2e94943`，落后 3 个 commit（R48 / R49 / R50）。

---

## 2026-10-19（第四轮）

> 本轮 = 用户 1 条需求（R49）：「账单页面只统计了一些基础的资源，但是没有箱子相关的收入，还有最好是能按周几来进行筛选区分」。
> commit **`237ee98`**，`?v=` → **`20261019d`**（`js/ledger.js` 与 `tools.json` 里的 `ledger.html`；`app.js` / `style.css` 零改动）。

### 改动

- **账单纳入活动箱子**。逐日行从「一个数」拆成三个字段：`res`（基地 × 24 + 活动直接资源 + 开放日推图）/ `box`（当天活动箱子折合）/ `all`（= res + box）。
  页面显示 `all`，箱量单独一列 + 单元格下挂「箱 +…」小字；`totals` / `avg` 保持旧语义（不含箱），老断言不受影响。
- **固定小时箱**（箱名自描述，不需要额外定义）：
  信用点盒 / 战斗数据辑盒 = `rate × h × n`；芯尘盒 = `floor(rate × h) × n`（TRUNC）；成长套组 = 三资源各按上面两条。
  这套算法与 `boxes.js` 的 `fixedBoxResources` **逐值对拍一致**（`test_ledger.js` 新增 14 天全量对拍）。
- **自选箱**需要定义，走快照里的 `box_defs`（来源 = 计算器 `BOX_DEFS`，**没有在 `ledger.js` 里写死一份副本**）：
  `units` 模式（挑战者成长宝箱）= `units × n`，资源跟表单的 `challenger_pref`（auto ⇒ 芯尘，与 R31 同分取向一致）；
  `hours` 模式（方舟 / 30天箱）= `rate × h × n`，资源跟页面新增的「自选箱折算」下拉（芯尘 / 战斗数据辑 / 信用点，选择会被记住）。
  旧版快照缺 `box_defs` → 只记个数不折算，`boxUndef > 0` 时页面给黄条提示重算。
- **`snapSlice` 升 v2**：新增 `challenger_pref` / `box_defs`（仍只落账单需要的切片，不落整份表单、不落箱量与消耗）。
- **按周几筛选**：筛选条 = 全部 + 周一…周日（带天数角标，0 天的置灰）；筛选后明细、合计行、日均卡、区间文字（`已筛选 周三 · 9 天`）同步重算。
- **按周几对比表**：星期 / 天数 / 三资源日均 / 箱数，7 行；点一行即筛选、再点取消——「区分」和「筛选」共用一个组件。
- **CSV**：新增「其中箱子」三列 + 箱数，并按当前筛选导出；合计行补足最后一列空位（此前少一格会让 Excel 整行右移）。
- **窄屏**：明细表从 5 列扩到 6 列，390px 仍 `over=0`（星期从日期右侧改到日期下方 + 压内边距与字号）；周几对比表去掉 `min-width`；
  chips 改两行换行（横滑会把周五/周六/周日藏起来，用户以为没有）。

### 数值影响

引擎层**零改动**（`core` / `events` / `boxes` / `scenarios` 一行未动），计算器结果、开箱方案、配比求解全部不变。
只有账单页的展示口径变了 —— 有活动时逐日金额 = 原金额 + 箱子折合。

### 验收

`test_ledger.js` 27/27（新增 13 项）｜新建 `_verify_r49.js` 桌面 23/23 · 手机 23/23｜回归 `_r47` 24/24 · 24/24、`_r46` 11/11、`_r48` 22 · 23、`_r45` 25、`_r42` 14、`balance` / `plan_ui` / `form_parity` / `mobile_parity` 全 PASS。
线上 5 个文件 md5 与仓库 blob 全等，真站双端冒烟 23/23 · 23/23。

### 踩到的坑

1. **自选箱定义不能写死在账单里**：一开始想在 `ledger.js` 抄一份 `BOX_DEFS`（含 `88458` / `16` 这些魔数），
   但那样计算器改了数值，账单会静默按旧值算。改成「计算时把定义一起落进快照」——数据只有一个来源。
2. **`res` 与 `box` 必须分行存放**：如果直接把箱子折合加进 `res`，`totals`/`avg` 的旧语义（＝基地 + 活动直接 + 推图）就被破坏了，
   历史断言与「和引擎对拍」的测试会一起失效。拆成 `res` / `box` / `all` 后两边都能验。
3. **390px 六列会溢出 59px**：先想到压字号，实际最大头是「日期 + 星期」那一列——把星期挪到日期下方（`display:block`）立刻省 22px，
   再配合内边距 6→4、tag 字号 9px，实测 `over=0`。
4. **`flex-wrap:nowrap` + 横滑的 chips 会藏住信息**：周五/周六/周日滑出屏幕且没有任何提示，改成换行后一次看全。

---

## 2026-10-19（第三轮）

> 本轮 = 用户 1 条需求（R48）：「按钮做到计算器那行」—— 把上一轮刚做成图标的快捷同步开关，从「按钮上方单独一行」挪进「开始计算」按钮同一行。
> commit **`57ce699`**，`?v=` → **`20261019c`**（仅 `css/style.css` / `css/mobile.css`；`js/` 无改动，脚本版本号不动）。

### 改动

- 双端 HTML 新增 `.calc-row` 包裹层，「开始计算」与快捷同步图标并列其中；`#btnCalcFab`（移动端吸底按钮）
  从 `section` 外挪进这一行 —— 这是关键：原来按钮自己 `position:fixed`，图标没法跟它同行，只能另起一行，还老被它压住。
- 桌面：`.calc-row{display:flex;gap:10px}`，按钮 `flex:1`、`margin-top` 归零（否则 flex 交叉轴居中会被它顶偏 3px）；图标 42px 正圆贴右。
- 窄屏 / 移动端：`fixed` 从按钮挪到 `.calc-row` → 整行变成吸底 dock，按钮回归普通 flex 子项，图标自然并排（46px）；
  `body.has-result` 的 bottom 覆盖同步改名到 `.calc-row`。
- 气泡改**右对齐向左展开**：图标已经在屏幕右侧，原来 `left:50%` 居中会让 204px 宽的文案冲出右缘；
  箭头改 `right:16px`（46px 圆下 18px）对准圆心。
- 顺带修：移动端 `.layout` 底部留白 132 → 148px。实测 dock 顶边距视口底 174px，132px 会让表单最后一行提示
  正好贴住 dock 上沿（`clearance=0`），补 16px 余量。
- 移除 R47 给图标单留的 40px 底部 margin —— 图标已进 dock，被按钮压住的问题从结构上消失。

### 数值影响：零

引擎层 `core` / `outpost` / `boxes` / `scenarios` / `events` 与 `js/app.js` **零改动**；
七套 node 数值测试全 PASS（`golden` / `challenger` / `event_units` / `keep_one_box` / `monthly_card` / `stage_clear` / `ledger` 14/14）。

### 验收

新增 `_verify_r48.js`（22~23 项）：桌面 **22/22**、`mobile.html` **23/23**、`index.html` 窄屏 **23/23**；
回归 `_verify_r47` 双端 24/24、`_verify_r46` 双端 11/11、`_verify_r45` 25/25、`_verify_r42` 14/14（`EXPECT_V=20261019b`）、
`balance` / `plan_ui` / `form_parity` / `mobile_parity` 全 PASS。
（`_verify_r46` 的 A3「在按钮之前」、`_verify_mobile_parity` 的「按钮自身 fixed」两项按新结构改为「同一行且在按钮右侧」/「dock 容器 fixed」）

### 两个诊断坑

1. **CDP hover 必须先把目标滚进视口**：`Input.dispatchMouseEvent` 用视口坐标，图标在文档 y≈2900 处时
   鼠标事件根本命不中 → 会误判成「`:hover` 无效」。
2. **线上比本地慢**：滚动后 400ms 内布局还在动（图片/字体加载），取到的坐标会失效 →
   多等 1.2s，并先 `mouseTo(5,5)` 再移到目标，保证是真的「移动过来」。

---

## 2026-10-19（第二轮）

> 本轮 = 用户 3 条需求（R47）：①「计算后自动保存并同步」做成 UI、悬停才显示文本；②WorkBuddy 镜像同步更新；③账单单独拆一个 tab 出来（参考定制模组统计），数据来自收益数据计算器的表单。
> commit **`042a771`**，`?v=` → **`20261019b`**（`js/app.js` / `css/style.css` / `css/mobile.css` / 双端 HTML 引用）；
> 新增 `js/ledger.js`、`ledger.html`、`assets/nav_ledger.svg`、`test_ledger.js`；`tools.json` 加 `ledger` 条目。
> WorkBuddy 镜像同步发布到 `042a771`（与 `git archive HEAD` 解包目录 **1687 vs 1687 全树 IDENTICAL**）。

### ① 快捷同步开关改成图标 UI（悬停/聚焦才浮出文案）

- 原来是「勾选框 + 一行常驻长文案」（占一行、抢视线）→ 改成 **38px 圆形图标**（云朵 + 上箭头），
  文案只在 `:hover` / `:focus-within` 时以深色气泡浮出，且随状态切换：
  开 = 「已开启：计算后自动保存并同步到云端」；关 = 「已关闭：点一下开启自动保存并同步」。
- **原生 `#chkAutosync` 保留**（缩进成 `opacity:0` 铺满整个 label），值与 `change` 全走它 →
  偏好键 `nikke_calc_autosync` 不动，老用户无感迁移；移动端放大到 42px 便于点按。
- 状态由 `paintAutoSync()` 统一写 `[data-on]`，CSS 只看这个属性；顺带修掉「图标与文案各写一遍状态」的分裂。
- ⚠ 只给 `<label>` 写 `data-on`，**不要顺手加 `aria-pressed`**（label 上不是合法属性），语义交给内部 checkbox 的 `aria-label`。

### ② 收益账单从结果区 tab 拆成独立工具页

- `tools.json` 新增条目 `ledger`（`viewId: appLedger` / `frameId: ledgerFrame` / `order: 15`，紧跟计算器），
  图标 `assets/nav_ledger.svg`；导航由 shell 从 `tools.json` 生成 → **双端自动出现「收益账单」**，无需改导航代码。
- 新增 `ledger.html`（独立页，内联样式，参考 `mod_stats.html` 的形态）：读完快照渲染
  统计区间 + 3 张日均汇总卡 + 逐日明细（含 基地/活动/开放日 标签）+ 合计行 + 导出 CSV + 「去计算器 / 刷新」。
- 口径抽成 **`js/ledger.js`（`NikkeLedger`，唯一来源）**：`build` / `csv` / `snapSlice` / `formChanged`。
  `app.js` 里的 `buildLedger` / `ledgerCsv` / `renderLedger` 整块删除，结果区 `tabLedger` 按钮与面板一并移除
  （结果区回到 3 个 tab）。
- 数据链路：`runCalc()` 里 **`saveForm()` 之后**落一份「指标切片」到 `nikke_ledger_snap_v1`
  （数据日期 / 开放日 / 现状与未来费率 / 推图收益 / 活动），**不落整份表单**；账单页读它 + `data/event_templates.json`。
- 表单在上次计算后又改过（`saved_at` / `capture_time` 变了）→ 页面顶部黄条提示
  「仍按上次计算生成，回计算器重算即可更新」，**不擅自改口径**。

### ③ 顺手修：移动端账单页底部被固定 Tab 栏压住 + 明细表隐藏了「信用点」列

- 底部 Tab 是 `repeat(4,1fr)` 网格，6 个工具 = 两行（实测 **115px**）；`#appLedger` 底部留白 72 → **132px**。
- 移动端明细表原本用 `nth-child(2){display:none}` 藏掉「信用点」列 —— **藏的是最关键的一列**，
  等于账单失真。改为压缩内边距/字号后五列全露（390px 下 `tableOver=0`）。

### ③′ 补充修复（`2e94943`）：移动端图标被吸底按钮压住 15px

- 实测 `.layout` 底部留白 132px，而吸底 FAB（`bottom: 123px` + 高 51px）占 123~175px →
  图标作为表单最后一项时与 FAB 重叠 **15px**（`tog.bottom 685` vs `fab.top 670`）。
- `body.m-body .as-tog` 底部 margin 16 → **40px**，复测 `overlap = 0`（净空 9px）。
- 同步把 `2e94943` 镜像发布到 WorkBuddy（全树 `IDENTICAL`，`css/mobile.css` 归一化 md5 一致）。

### 数值影响：零

- 引擎层 `core/outpost/boxes/scenarios/events` **零改动**，六套 node 测试全 PASS。
- 账单算法与 R46 逐行一致（本轮只搬家 + 抽模块），不参与「等待期到账 / 开箱方案 / 配比求解」。
- 同步开关只控制云端上传，本地 `saveForm()` 不受影响。

### 验收

| 项目 | 结果 |
|---|---|
| `test_ledger.js`（新增） | **14/14** —— 区间推算 / 未填开放日降级 / 开放日一次性推图收益 / 未来费率回落 / 活动逐日增量与引擎 `byDate` 逐值对拍 / 合计=Σ明细 / CSV 形态 / 快照序列化往返一致 / `formChanged` |
| `_verify_r47.js`（新增） | 桌面 **24/24**、移动 **24/24**（悬停浮出、状态持久化、快照字段、导航新增、iframe 行数与合计、CSV 按钮、子页无横溢） |
| `_verify_r46.js`（重写为行为回归） | 双端 **11/11**（默认开 / 持久化 / 关闭不推 / 未登录静默跳过 / 已登录推一次 / 本地保存照做） |
| 历史回归 | `_verify_r45` 25/26、`_verify_r42` 14、`balance`、`plan_ui`、`form_parity`、`mobile_parity` **全 PASS** |
| 线上 | 三文件 + `ledger.html` + `tools.json` md5 与仓库 blob **全等**；真站双端冒烟 **24/24** |
| WorkBuddy 镜像 | 全树 `IDENTICAL`，`tools.json` 含 `ledger`、`ledger.html` 200 |

### 本轮新踩的坑

1. **`EV.schedule(snap).byDate[d]` 的形状是 `{ res:{三资源}, fixed:{箱}, selectable:{箱}, days }`** ——
   账单要用的是 `byDate[d].res`。搬迁时漏了这一层，**活动日的标签照常出现、金额却静默等于纯基地日**
   （因为 `Number(undefined)||0`）。已加「逐日增量 vs 引擎 `byDate` 逐值对拍」把它焊死。
2. **style.css 与他人的 `#appCombatReroll` 改动落在同一行**（都在那串选择器清单里）→
   `_stage_style_hunks.py` 按 hunk 丢弃已失效（hunk 已融合）。改用
   `_stage_style_r47.py`：从工作区内容里剔掉 `, #appCombatReroll` / `, #combatRerollFrame`，
   `git hash-object -w` + `git update-index --cacheinfo` 精确暂存「只有自己的版本」，
   工作区仍保留他人改动。提交前断言 `cached` 里 `combatReroll` 出现 **0** 次。
3. **移动端窄屏不要「隐藏次要列」解决问题** —— 我第一版把第 2 列藏了，藏掉的正好是信用点。
   正确做法是压内边距/字号，真放不下再让容器横向滚动。

---

## 2026-10-19

> 本轮 = 用户 2 条需求（R46）：①「开始计算」加快捷同步勾选（默认勾选）；②结果页新增「账单」功能统计每日收益。
> commit **`fa8293d`**，`?v=` → **`20261019a`**（`js/app.js` / `css/style.css` / `css/mobile.css`；
> 双端 HTML 各 2~3 行引用同步；`js/boxes.js`、`js/scenarios.js`、字体 woff2 **未动**）。

### 1. 「开始计算」上方加快捷同步勾选（默认勾选）

用户原话：「开始计算这里增加一个快捷同步项，勾选后计算即可保存当前表单，默认勾选」。

- 双端 `#btnCalc` 之前插入 `<label class="calc-autosync"><input id="chkAutosync" checked>`，文案「计算后自动保存并同步」，`title` 说明未登录时只存本机。
- **口径澄清**：本地保存本来就每次计算都做（`runCalc → saveForm()`），这个开关**只管「顺手推到云端」这一步**，不是重复的保存按钮。
- 已登录（`window.__nikkeSync.status().loggedIn`）→ 算完调 `quickUpload("planner")`；未登录 → **静默跳过**，绝不弹同步面板打断（`quickUpload` 自身在未登录时会 `open()` 面板，故必须先判 `loggedIn`）。
- 偏好存独立键 **`nikke_calc_autosync`**（`"1"/"0"`，未选过 = 勾选），**不写进表单 JSON**，因此不进云同步负载、不污染 `collectForm`。
- 移动端 `#btnCalc` 是隐藏的（用吸底 FAB），勾选项留在表单末尾流内，`mobile.css` 给了浅底卡片样式便于发现。

### 2. 结果页新增「收益账单」tab

用户原话：「我想要在结果页增加一个账单功能，请你帮我设计下，我希望能够统计每天的收益量」。

结果区 tabs 由 3 个变 4 个：计算结果 / 补充信息 / **收益账单** / 原始 JSON。

| 区块 | 内容 |
|---|---|
| 头部 | `统计区间 2026-10-20 → 2026-11-02 · 共 14 天`；未填开放日时追加黄色警示条 |
| 汇总卡 ×3 | 每资源一张：资源图标 + 名称 / **日均值**（大字）/ `日均 · 合计 X` |
| 明细表 | 日期（含周几）/ 信用点 / 战斗数据 / 红球 / 来源标签（`基地` / `活动` / `开放日`） |
| 合计行 | 三资源合计 + 天数 |
| 操作 | 「⬇ 导出 CSV 账单」（带 UTF-8 BOM，Excel 直接打开不乱码）+ 口径说明 |

- **区间口径**：`数据日期 + 1` → `新主线开放日`（含）。与活动收益「数据日期次日起算」一致。未填开放日 → 按 **未来 14 天**预览 + 警示条；开放日 ≤ 数据日期 → 空状态提示。
- **每日到账** = `income_per_hour[r] × 24` + 当日活动产出 + 开放日一次性推图收益。开放日及之后若填了「预计新基地收益」则按新收益算。
- **活动逐日产出直接读 `EV.schedule(snap).byDate`** —— 与引擎同源，**没有第二套聚合**（这是本项目最容易出事的地方）。
- **不计开箱收益**：箱子是存量转化，不是新增产出；账单只记「今天新到账多少」。也不扣升级消耗（账单是进项，不是余额表）。这两句写进了页面底部说明。
- 防御：`LEDGER_MAX_DAYS = 400`，开放日填成十年后也不会生成几万行。

### 3. 顺手修：移动端吸底「开始计算」被底部 Tab 栏压住

R45 已记录该重叠但未改（待用户决定），本轮因 `_verify_mobile_parity.js` 的「吸底按钮不重叠」项一直红着，一并修掉。

- 实测：底部 Tab 栏 `.app-nav` 高 **115px**（含 6px 上下内边距 + `env(safe-area-inset-bottom)`），而 FAB `bottom: 70px` → **被压住 45px**（`fab底部=774` vs `nav顶部=729`）。
- 改为 `bottom: calc(123px + env(safe-area-inset-bottom, 0px))` = Tab 栏高 + 8px 间隙；安全区随 Tab 栏同步增长，所以 env 只加一次。
- 账单页 `#tabLedger { padding-bottom: 190px; }`，让合计行 / 导出按钮能滚到按钮之上（FAB 占 123~174px）。

### 数值影响

**零。** 引擎层（`core` / `outpost` / `boxes` / `scenarios` / `events`）零改动；六套 node 测试全 PASS。账单是**纯展示**：只读快照，不回写，不参与「等待期到账 / 开箱方案 / 配比求解」。同步开关只触发上传，不改本地保存与计算流程。

### 验收

- 新增 `_verify_r46.js`：桌面 **22/22 PASS**、移动 **22/22 PASS**。覆盖：默认勾选 / DOM 顺序在按钮之前 / 取消勾选写 `"0"` / **刷新后仍保持未勾选**（需先 `Page.removeScriptToEvaluateOnNewDocument` 摘掉「每次新文档清 localStorage」）/ 关闭时不调用 `quickUpload` / 开启+已登录调用 `planner` / 未登录静默跳过 / 本地保存不受开关影响 / 账单行数=天数+1 / 首行=数据日期次日 / 末行=开放日 / 日期逐日连续 / 合计=Σ明细（容差 5%）/ 开放日标签唯一 / 活动日高于基地基准 / 未填开放日降级 14 天。
- 回归全绿：`_verify_r45`（桌面 25 / 移动 26）、`_verify_r42`（14，`EXPECT_V=20261019a`）、`_verify_balance`、`_verify_plan_ui`、`_verify_form_parity`、`_verify_mobile_parity`（原「吸底重叠」FAIL → 已 PASS）。
- 线上：三文件 **md5 与仓库 blob 全等**（`app.js 167,262 B d2725847…` / `style.css 48,903 B d0ecd9be…` / `mobile.css 19,665 B d8b96376…`）；真站双端 `_verify_r46` 冒烟 **22/22 PASS**。

### 本轮踩坑

1. **`python -m http.server` 用 `cmd &` 起不来**——Bash 工具调用结束即被回收，后续 curl 拿到的是代理返回的 `502`（环境里 `HTTP_PROXY` 指向本地代理，`curl` 默认走它）。正解：用 `run_in_background: true` 启动 + `curl --noproxy '*'`。
2. **改完表单没有重算就读账单**——账单是 `renderResult` 阶段按快照渲染的，改日期后不点「开始计算」拿到的还是上一次快照，测试会误判成「区间不对」。
3. **`fmtNum` 对表格数字做了 K/M 压缩**，所以「合计 = Σ明细」只能用容差（5%）断言，不能逐位比。
4. **活动日不能用「最大值比较」判定**：开放日行含一次性推图收益，会盖过活动日。基准要取「非活动、非开放日」行的最小值。

---

## 2026-10-17

> 本轮 = 用户 2 条反馈（R45）：移除「表单填写进度」统计 + 点击计算时补 loading 反馈。
> commit **`0a76f52`**，`?v=` → **`20261017a`**（`js/app.js` / `css/style.css` / `css/mobile.css` 三个文件；
> `index.html` / `mobile.html` 各 1~2 行引用同步；`js/boxes.js`、字体 woff2、`js/scenarios.js` **未动**）。

### 1. 移除「表单填写进度」统计（双端）

用户原话：「移除进度条统计，基本没啥用」。

- 删 `#progressFab`（桌面右下角悬浮进度球 / 移动端顶栏右侧那枚）+ `#progressPanel`（12 项填写清单面板）+ `updateProgress()` 及其 3 处调用、2 处事件绑定 + 两端全部相关 CSS（含媒体查询与 `mobile.css` 里的顶栏特化）。
- 导出图片（`exportResultImage`）的 `onclone` 隐藏列表同步去掉 `.progress-fab,.progress-panel`。
- 双端 DOM 与 **CSSOM** 均已清空（`_verify_r45.js` 扫 `document.styleSheets` 断言无残留规则）。

### 2. 新增「计算中」loading 反馈（进度条 + 按钮转圈）

用户原话：「点击计算时，可以给一个 loading 的动画，或者进度条动画，让用户感知正在计算中」。

| 部件 | 实现 |
|---|---|
| 顶部进度条 | `.calc-bar`：`fixed` 顶边、3px、`z-index 10000`、`pointer-events: none`；**不确定进度（indeterminate）**滑动条 |
| 按钮 loading | 两个「开始计算」入口（表单底部 `#btnCalc` / 移动端悬浮 `#btnCalcFab`）加 `.is-loading` → `::before` 转圈 + `aria-busy` + `disabled`（防连点） |
| 最短展示 | **240ms**（够不到就补足；计算只要几十毫秒，不补足会「闪一下」什么都看不见） |

三个必须写进注释的技术点：

1. **滑动动画必须用 `transform`（合成线程）** —— 计算期间主线程被 JS 占满，`left`/`width` 动画会跟着一起冻住，等于没有反馈。实测 `getAnimations()` 读到 `calcBarSlide` 全程 `running` 且 `currentTime` 递增。
2. **计算入口拆成 `calculate()` / `runCalc()`** —— 计算是同步阻塞的，`calculate()` 先亮 loading，再让出主线程两帧（双 `requestAnimationFrame`）确保 loading 已被绘制，然后才跑 `runCalc()`（原逻辑一行未改）。另加 `setTimeout(go, 260)` 兜底：**后台标签页 / 无头环境下 rAF 可能被节流甚至不触发**，绝不能让计算卡住。
3. **按钮文字不归 loading 管** —— 文字由 `markCalculated()` / `resetCalcButton()` 维护，loading 只加/撤 class。否则「重新计算」与「计算中…」会互相覆盖。

### 数值影响

**零。** 引擎层（`core` / `outpost` / `boxes` / `scenarios` / `events`）零改动；等级、资源、收益与全部口径（R38 / R40 / R41 / R42 / R44）逐值不变。实测 loading 持续 ~520–590ms（含真实计算与渲染耗时）。

### 验收

- `node` 六套数值测试（`test_golden` / `test_challenger` / `test_stage_clear` / `test_event_units` / `test_keep_one_box` / `test_monthly_card`）：**全 PASS**
- 新增 **`_verify_r45.js`**：桌面 1400×1200 **25 项** + 移动 390×844 **26 项** 全 PASS
  - A 区：进度球 DOM / 类名 / 子节点 / CSSOM 规则**全部查不到**；移动端顶栏按钮只剩「保存/同步」
  - B 区：点击后**同帧** `#calcBar.is-on` + 按钮 `is-loading` + `disabled`，且**结果区仍 `display:none`**（证明「先 loading 后计算」而非算完才亮）；80ms 时 loading 仍在；1.2s 后 loading 撤、结果照常渲染 3 个 block、按钮回到「重新计算」
  - C 区：表单变更后按钮还原「开始计算」；无横溢 / 无未捕获异常 / 无弹窗；两端 spinner 伪元素（13px 圆环 + `exportSpin`）均生效
- CDP 历史回归 `_verify_r41` / `_verify_r42` / `_verify_batch3` / `_verify_batch4` / `_verify_ui_batch2` / `_verify_wait_split_ui`：**双端全部 0 FAIL**
- **无需改任何回归脚本的等待逻辑** —— 既有脚本点击后均 `sleep(3000~4500)`，远长于本次新增的两帧 + 240ms
- 线上：`js/app.js` **157,424 B**（md5 `eb2e5b85…`）、`css/style.css` **46,777 B**（`0b2b171b…`）、`css/mobile.css` **18,901 B**（`baba6b9c…`）三者均与仓库 blob **md5 全等**；真站冒烟双端 **FAIL=0**（`EXPECT_V=20261017a EXPECT_V_CSS=20261017a`）
- 视觉：`临时文件/shots/r45_{desk,mob}_loading_state.png`

### 本轮新增踩坑

- **无头 Chrome 的 `--window-size` 不决定视口** —— 截图脚本传 `390×844`，实际视口是 ~500×693，导致「悬浮按钮明明在 DOM 里却截不到」（误判成 UI bug）。正解：CDP 里补 `Emulation.setDeviceMetricsOverride({width, height, scale, mobile})`，截图尺寸随即 = 目标尺寸。**判定移动端布局必须用 Emulation，不能只靠启动参数。**
- **断言别用「采样两次 transform 是否相等」判动画在跑** —— 采样点可能两次都落在周期同相位（实测移动端连读两次都是 `translateX(-100%)`）。改用 **Web Animations API**：`el.getAnimations({subtree:true})` 读 `animationName / playState / currentTime`，断言 `running` 且 `currentTime` 递增，稳且本质。
- **`getComputedStyle(el,'::before').content` 的序列化值是 `'""'` 而不是空** —— 断言时只需排除 `'none'`。

### 顺带发现（未改，待用户决定）

移动端悬浮「开始计算」按钮 `bottom: calc(70px + safe-area)`，而底部 Tab 栏 `.app-nav` 高约 86px（`z-index 9500` > 按钮的 9000）⇒ **按钮底边约 16px 被 Tab 栏盖住**（既有行为，非本轮引入；按钮文字仍在遮挡线之上，仍可见可点）。本轮**未改**。

---

## 2026-10-16

> 本轮 = `docs/计算器界面优化-实施提示词.md` v1.1（39 条需求）分三批落地 + 用户当轮追加的 6 项反馈。
> 批 1（基础设施）与批 2（R01–R37 纯界面）合并为 `df5cb16`；批 3（R31/R38/R36 数值口径 + 控件接线）为 `1a99bef`。
> 三个 commit 的 `?v=` 统一为 `20261016a`（批 1+2）→ `20261016b`（批 3）。
>
> **当天第二轮（批 4 / R40）= `5b47dec`**：批 3 上线后用户又提 6 项反馈（方案划分不明显 / 缺口压一行 /
> 「提前升」的亏口径错 / 标题章节格式两处 / 换作者头像），`?v=` → **`20261016c`**。详见本节末「批 4」。
>
> **当天第三轮（批 5 / R41）= `adcdb98`**：用户反馈「预计新主线推图收益」章节号错位（开放到键 40 时标题
> 出现已开放的「40章·选择」，且实际只按单章取数）+ 明确困难收益「进度没到就不计入并红字注明」，
> `?v=` → **`20261016d`**。详见本节末「批 5（R41）」。
>
> **当天第四轮（批 6 / R42）= `978ddd4`**：用户要求「整体结论修改为赚多少的口径」——面向用户的
> 「亏 N 级（屯箱子多升）」全部翻正为「等到开放日再开箱可多赚 N 级」，**数值不变**，
> `?v=` → **`20261016e`**。详见本节末「批 6（R42）」。
>
> **当天第五轮（批 7 / R44）= `f378eb3`**：用户要求「优化计算算法、保精度提速、优先成熟算法」→ 产出
> `docs/计算器性能优化-实施提示词.md`（实测定位 + 算法选型），用户定案「**只要保证方案是最优解即可**」
> → 把自选箱配比的**三重全枚举 O(q³) 换成有界 DP O(3·Jmax²)**，并**去掉 `three.quantity <= 100` 阈值**
> （旧行为在 q3 > 100 时退回启发式贪心、不是最优解），`?v=`（`boxes.js`）→ **`20261016f`**。
> 详见本节末「批 7（R44）」。

### 新增

- **挑战者成长宝箱「放开评估」：双跑择优 + 手动指定（R31 + R39 接线）**（`1a99bef`，`js/boxes.js` v=20261016a → **v=20261016b**、`js/app.js` 同、`index.html` / `mobile.html`，新增 `test_challenger.js`）
  - **背景**：此前挑战者成长宝箱写死取 `options[0]`（战斗数据辑 88,458 units），文案也只写「全开」——用户质疑「红球选项是不是被锁死了」。
  - **为什么不能定一条固定规则**（`临时文件/scripts/_analyze_challenger.js` → `临时文件/out/challenger_analysis.txt`）：两种「通用口径」结论**恒定相反** —— 按基地产出成本折算，芯尘项恒为战斗数据辑的 **×1.178**；按覆盖升级消耗折算，战斗数据辑项恒为芯尘的 **×1.04**（201 档）~**×2.64**（801 档）。根因：基地产出比 `battle : dust ≈ 6514`，而升级消耗比 **全档位都 < 箱比值 5529`**（2094 @201 档 → 5305 @801 档）。实测规律 = **「哪一项卡住选哪项」**，因此必须按当前目标与库存现算。
  - **定稿算法（三层，`js/boxes.js`）**：同一目标对两项各跑一次求解 → ① **可达步数高者胜** → ② 步数相同时取 `Σ (remaining_shortage[r] ÷ income[r])`（**必须折算成 1H 箱总缺口**；用原始资源量比较会得出相反结论）小者胜 → ③ 仍相等时取**芯尘**（红球每小时产出最少、长期最稀缺）。
  - **偏好传递**：`snapshot.challenger_pref`（`auto` / `battle` / `dust`），由「其他」段的 `f_challenger_pref` 下拉设置；`auto` 走择优，`battle` / `dust` 用「把 `selectable_boxes` 该项的 `options` **反转**」这一零签名改动技巧强制选另一项（引擎内部仍按 `options[0]` 取值）。
  - **性能**：单次求解 0.1ms、双跑 0.2ms → **无需预筛**，每次计算现跑。
  - **数值影响**：用户真实数据（1,122 箱 / 517 级）下 `auto` 由「战斗数据辑」变为「**芯尘**」，全箱梭哈 **+1 级**（523 vs 522）。验证表单（挑战者 1,122 / 固定箱 1H ×1000）下 `auto` 与 `dust` 展示一致（选芯尘）、`battle` 需求固定小时箱由 2,000 个降为 1,952 个。
  - **文案同步**：开箱顺序与自选箱卡片不再写死「全开」，改为「挑战者成长宝箱全开（选【芯尘】· 已按最优项自动选择）/（选【战斗数据辑】· 手动指定：战斗数据辑优先）」，三处统一（Block① 开箱顺序、Block② 开箱顺序、全箱梭哈卡 + 挑战者卡片注记）；`tip-card-3` 信息窗补一段说明该控件的作用。
  - **验收**：新增 `test_challenger.js`（7 组）**ALL PASSED**；`_verify_batch3.js` [C] 段 auto / battle / dust 三跑对比断言 PASS（文案与固定箱需求随偏好变化，不再锁死）。

- **信息窗（InfoTip）组件与资源图标体系（批 1）**（`df5cb16`）
  - 结果区与表单区共 **10 处** ⓘ 信息图标（本批由 9 处扩到 10 处，新增 `tip-block3`）；内联 SVG、单面板互斥、`aria-expanded` 同步、面板惰性插入锚点父节点；文案集中在 `INFO_TEXTS`。
  - ⚠ **`legend` 在移动端绑了「点击折叠整段」** → 放进 `legend` 的按钮**必须 `stopPropagation()`**，否则点图标会连带折叠分组。
  - 新增自选箱图标映射（`mbox_challenger` / `mbox_ark` / `mbox_30d`）；桌面 `assets/`、移动 `assets/m/` 两套素材目录，30 天箱桌面为 `.jpg`、移动为 `.webp`，按目录自动切扩展名。

### 修改

- **三资源配平诊断重构：不可达时只给「真实缺口」（R38）**（`1a99bef`，`js/boxes.js` + `js/app.js`，`test_stage_clear.js` 新增第 5 组、`test_keep_one_box.js` 第 8 组改写）
  - **背景**：旧版 3 列「资源 | 单项资源上限 | 达成目标 X 级」，其中「单项资源上限」= 把自选箱**全给该项**的乐观上界；用户判定思路不成立（「各自梭哈一项的极限说明不了整体，梭哈一项之后另外两项不达标」）。
  - **引擎侧新增 `bestEffortSolve.target_shortage`** = `max(0, costForLevels(目标步数) − 底盘 − planResources(该方案))`；同时新增 `planResources(snapshot, plan, incomePerHour)`（口径与全文件一致：红球 TRUNC、非 units 选项 × 该资源每小时收益）。
  - ⚠ **关键陷阱**：`bestEffortPlan().plan` 是在**缩小的步数**上**可行**的方案，其 `remaining_shortage` **恒为 {0,0,0}** —— 拿它当「距目标仍缺」会渲染成「三项 ✅ 足够」。必须用 `target_shortage`。
  - **渲染口径**：可达（①②③④）**不再展示任何上限 / 缺口表**，只给开箱方案 + 一句 caption；不可达（⑤）出 **2 列**表「资源 | 达成目标 N 级仍缺」，缺口**直接取求解器同源数据、渲染层不重算**（重算会与方案不自洽，这正是上一轮 `a20c94f` 首版被推翻的原因），每行给「还缺 X → 需 N 个 1H …盒」或「✅ 足够」，瓶颈标记**唯一**、挂在**折算 1H 箱数最大**那行（`foldNeed()` 抽出供 R36 共用）。
  - **数值影响**（`test_stage_clear.js` 实测）：旧贪心口径 `{credit:169,670,430 / battle_data:1,316,392,710 / core_dust:252,169}` → 新均衡口径 `{credit:153,907,020 / battle_data:1,378,224,970 / core_dust:265,184}`；折算 1H 箱 `[2,373 / 2,096 / 2,466]`，**瓶颈由「信用点」变为「红球」**。
  - **验收**：`_verify_balance.js`（1280×1100）**ALL PASSED**；`_verify_batch3.js` [F] 段「可达无表 / 不可达 2 列表 + 瓶颈唯一 + 瓶颈=折算最大」双端 PASS。

- **Block③ 整合结论改为 ①②③ 三行（R36）**（`1a99bef`，`js/app.js`）
  - 原「较现状多升 N 级」三分量长文案 + 结尾长「口径」段 → **三行结论**；长口径整段移入信息窗 `#tip-block3`（标题挂 ⓘ）。
  - ① **提前升**：赚 N 级（推图收益当**底盘增量单跑** `affordableLevels`）/ 亏 M 级（现在梭哈相对等开放日少升）→ 给择时建议。⚠ **禁止双重计算**：`stage_clear` 在 future 口径已计入一次（项目铁律 5）→ **绝不并入开放日快照**，也不回写 snapshot，只做「提前到账的时点收益」比较。
  - ② **推图节点**：该章推图收益 ≈ N 个 1H 箱（取三资源中最难补一项的折算）vs 全箱梭哈再多升 1 级需 ≈ M 个 1H 箱（以 `nowLv + 1` 为目标跑最优均衡求解取 `target_shortage` 折算）→ 给「不亏 / 偏亏」判断，并声明「暂无逐关红球节点数据，此处按章汇总近似」。
  - ③ **自然升级**：完全不开箱靠每日收益到目标需 N 天（**单位「天」不能丢** —— 首版漏写，被 `_verify_wait_split_ui.js` 断言抓出）。
  - **实测**（1280×1100 / 390×844）：① 赚 0 / 亏 16 → 建议等开放日；② 该章收益 585 个 1H 箱 ≥ 多升 1 级成本 152 个 → 推到该章不亏；③ 96.2 天。
  - **保留**：Block② 大字与全资源对比 caption 的「等待期到账资源 +x / 开箱 +y / 屯箱子多升 z」分层口径（`4c24495`）**不变**，`_verify_wait_split_ui.js` 两组断言均 PASS。

- **用户反馈 6 项（均在 `1a99bef`）**
  1. **活动「固定小时箱到账」表整体右移、超出一列** —— 根因：`renderEventTotals` 给 `simpleTable` 传了手写的 `<td class="on">…</td>`，而 `simpleTable` 会**为每个数组元素各自包一层 `<td>`** → 产生嵌套 `td`，浏览器把内层 `td` 提升到行外 → 整表右移一列并溢出。改回只传**单元格内容**（`<b>N</b>` / `—`）。断言：`tbody td td` 计数 === 0、每行列数 === 表头列数、零横滑。
  2. **挑战者成长宝箱 / 方舟官方补给物资Ⅰ 缺图标** —— `boxIconHtml` 只查固定箱表；新增 `SELECTABLE_BOX_ICON` 映射（含 30 天箱按目录切 `.jpg` / `.webp`），活动预览与结果区活动段的自选箱行都带图标。
  3. **「挑战者箱资源选择」改值后结果不变（像锁死）** —— 真因**不是**偏好没接线，而是 `chalChoiceText()` 收到**方案对象**（`immediateLevels().selectable` 是 `optimizeSelectableForTarget` 的返回值 `{selectable, fixed_used, …}`，不是数组）→ `.forEach is not a function` → 被 `calculate()` 的 `catch` 捕获后 **`alert()`** → 无头验证时主线程永久阻塞，**伪装成死循环**（排查耗时最久）。修复：`chalChoiceText` 同时兼容「数组」与「含 `.selectable` 的方案对象」。**连带加固**：`_verify_batch3.js` / `_verify_balance.js` 增加「监听 `Page.javascriptDialogOpening` 并自动 dismiss + 断言全程无弹窗 / 无未捕获异常」，把这类静默失败变成显式 FAIL。
  4. **「预计新主线进度」标题带章节信息** —— 标题改为短写法 `N章·章名`（N = 数据键号 = 游戏内关卡前缀）；官方章号保留在标题下方 note「本章 = 官方第 M 章，普通 X 关 / 困难 Y 关…」。
  5. **预计普通主线关卡下拉还原为 `Chapter N`** —— 撤销批 2 的「键 41 · 官方第 42 章『诞生』」美化 label（`fillStageChapterSelect()` 删除），`value` 语义不变。
  6. **数据日期「今天」按钮与输入框一体化** —— 由独立小方块改为**共享外框**：输入框只留左圆角、按钮 `margin-left:-1px` 压掉双线、仅右端收圆角、底色用极浅绿灰；`mobile.css` 需**显式覆盖**（`body.m-body input` 的 9px 优先级高于 `.input-row > input`），并在 `mobile.css` 加同等强度规则。双端实测 `gap = −1px`、高度差 0、半径互为镜像。

- **字体子集 1,512 → 1,552 字**（`1a99bef`，`assets/fonts/maiyuan-subset.woff2` / `.ttf`，`css/style.css` @font-face 与双端 `preload` 的 `?v=` 同步 → `20261016b`）
  - 补 40 字：**49 个章节名的用字**（`乡兽匙印叛坠拜救沟烙牢献盾矛笼蚀象逢钥…`）+ 静态正文（`哨币店既殊稀`）+ JS 渲染文案（`抬拆汇舍贡费述铸`）+ 活动模板（`券募招拾混狗笔`）。此前这些字回落系统字体，在「N章·章名」标题里字型明显不统一。
  - 体积 285KB → **286KB** woff2（全量 ttf 的 3.6%）；做法仍是「只往 `临时文件/out/_subset_chars.txt` 追加 → 跑 `font_subset.py`」，**未跑口径过宽的 `font_charset.js`**（其会把 xlsx / min.js / md / json 全收进去，2026-10-14 曾把 284KB 撑到 2,632KB）。
  - 全站复查零缺字：HTML 正文 / JS 字符串字面量 / 章名 / `box_definitions` / `event_templates` / `outpost_income` / `stage_map`。

### 修复

- **`calculate()` 弹 `alert` 导致无头验证「假死」**（`1a99bef`）—— 由上述第 3 项连带暴露：任何渲染层未捕获异常都会走 `catch → alert()`，在无头 / 自动化环境下永久阻塞主线程。已在验证脚本侧加对话框自动关闭与异常断言；产品侧 `alert` 行为保持不变（真实用户需要看到报错）。

### 版本号

| 文件 | 批 1+2（`df5cb16`） | 批 3（`1a99bef`） |
|---|---|---|
| `js/app.js` | 20261014e → 20261016a | **20261016b** |
| `js/boxes.js` | 20261014a → 20261016a | **20261016b** |
| `css/style.css` | 20261014b → 20261016a | **20261016b** |
| `css/mobile.css` | 20261014a → 20261016a | **20261016b** |
| `assets/fonts/maiyuan-subset.woff2` | 引出 `?v=20261016a` | **20261016b** |
| `js/scenarios.js` | 未改（20261014c） | 未改 |
| `index.html` / `mobile.html` | 文案与结构 | 版本引用 + 一体化控件 |

### 验收

- 数值测试 **6 套全绿**：`test_golden` / `test_event_units` / `test_monthly_card` / `test_challenger`（新增）/ `test_stage_clear` / `test_keep_one_box`。
- CDP 端到端 **5 套全绿**：`_verify_batch3`（1280×1100 桌面 + 390×844 移动，48 项）、`_verify_balance`、`_verify_ui_batch2`、`_verify_wait_split_ui`、`_cdp_vendor_check`（首屏外部请求 **0**、404 **0**、导出 PNG / 下载 XLSX / 导入 XLSX / 分享二维码全通）。
- 既有数值**零回归**：现状四档、`future_main_story`、`box_gain_vs_now`、月卡、保留 1 箱、活动收益均未受影响。

### 上线与镜像

- **GitHub Pages**：`1a99bef` 已推送并轮询生效 —— `index.html` / `mobile.html` 引用 `?v=20261016b`，`js/app.js` HTTP 200 / **143,345 字节**（`Array.isArray(arr)` 修复命中 2 处），字体 `maiyuan-subset.woff2?v=20261016b` **292,612 字节**。
- **WorkBuddy 发布为应用（含移动版）→ 更新至 `1a99bef`**（`verified: true`，sandboxId `1202cc0126f74f1da772352133d20b33`，分享链接 `https://nikke-level-planner.app.workbuddy.host/` **未变**）
  - 部署目录 `临时文件/deploy_clean_1007/` 按**原路径**由 `git archive HEAD` 覆盖解包重建（`localDir` 写死在 `.wbapp_*.genie`，路径不能变，否则会新建 app 换掉分享链接）；权威全树 md5 比对（`\r\n`→`\n`）**1683 vs 1683，仅基准有 0 / 仅镜像有 0 / 内容不一致 0**。
  - 发布后抓线上 8 个关键文件与 HEAD 基准比对 md5 **全等**（`index.html` / `mobile.html` / `app.js` / `boxes.js` / `scenarios.js` / `style.css` / `mobile.css` / 字体）。WorkBuddy 侧出 **CRLF**（`app.js` 145,847 = 143,345 + 2,502 行），比对前必须归一化行尾。
  - 真站冒烟 `_smoke_live_wb_1016.js` **桌面 1400×1200 + 移动 390×844 均 FAIL=0**：6 项用户反馈（活动箱表无嵌套 `<td>` 且矩阵 7 列零溢出 / 自选箱行带 `mbox_challenger`·`mbox_ark` 图标 / 挑战者箱 `auto`·`battle`·`dust` 三跑文案与固定箱需求随之变化 / 标题 `48章·重生` / 下拉还原 `Chapter N` / 日期框与「今天」按钮 `gap = −1px` 且半径互为镜像）；另有线上发布物断言（`app.js`·`style.css`·`mobile.css` 均为 `?v=20261016b`、字体 `encodedBodySize = 292,612`）+ 无 4xx/5xx、**无外部域名请求**、无 `console.error`、无弹窗、无未捕获异常。

---

### 批 4（`5b47dec`）· 用户当轮追加 6 项反馈（R40）

> 批 3 上线后用户实测 561 级场景（现状不可达 / 开放日可达），逐条指出 6 个问题。
> 其中 2 处口径经确认后实施：**「亏」= 只算屯箱子多升（`box_gain_vs_now`）**；**推图节点 = 收益增量 + 一次性推图**。

- **① 几套开箱方案之间划分不明显**（`css/style.css` / `css/mobile.css` / `js/app.js`）
  - 现象：同一目标块里「现状（全箱梭哈只到 557 级）」与「开放日可达」两套方案在视觉上糊成一片，只靠一条虚线分隔。
  - 改法：新增分段容器 `.sb-seg`（`segBox()`）—— 左侧 3px 色条（现状 `#a6b2bb` 灰 / 开放日 `#2f7dd1` 蓝）+ 分段标题「现状（今天）方案」/「开放日（YYYY-MM-DD）方案」+ 状态药丸（`.sb-seg-status.bad` ❌ 不可达 / `.ok` ✅ 可达）。导出模式同步放大（`.result-panel.export-mode .sb-seg*`）。
  - **实测**：561 场景渲染 **4 段**（2 个目标块 × 2 口径），色条 `rgb(166,178,187)` vs `rgb(47,125,209)`，药丸「❌ 不可达（全箱梭哈只到 556 级）」/「✅ 可达」；现状段始终排在开放日段之上；零横滑。

- **② 「距目标仍缺」压缩成一行**（`js/app.js` → `shortageLine()`）
  - 现象：R38 的 2 列诊断表在结果区占很大一块，用户要求「压成一行」；且达标时只显示还缺的那块资源。
  - 改法：**整表删除**，改一行 `.shortage-line`：「按上述方案开完全部箱子后，距目标 **同步器 N** 级仍缺：<只列仍缺的资源，每项带「（≈ N 个 1H …盒）」> ｜瓶颈：X（最难补）」；**已达标的资源不出现**，三项全达标时写「三项资源**均已足够**」。
  - 瓶颈口径**不变**（仍取 `foldNeed()` 折算 1H 箱数最大项，唯一标记）；CSS 需 `.sb-text.shortage-line .shortage-bottle b { color: inherit }` —— 否则 `.sb-text b { color: var(--primary-dark) }` 优先级更高，会把瓶颈资源名染成主色。
  - **实测**：561 场景「信用点 37.6M（≈ 592 个 1H 信用点盒）、战斗数据辑 391.5M（≈ 609 个 1H 战斗数据辑盒）、红球 7,686（≈ 73 个 1H 芯尘盒）｜瓶颈：战斗数据辑（最难补）」；balance 场景折算 `[1370]` → 红球，标记唯一。

- **③ 整合结论「亏 N 级」口径修正（R40 核心）**（`js/app.js`）
  - **用户的指正**：原文「亏 17 级（现在梭哈相对等开放日少升）」把「等到开放日自然多升的级数」也算进了代价 —— 真正构成「提前开箱代价」的只有 **屯箱子多升**（同一批箱子在更高基地收益下更值钱而多升的级数），即 `box_gain_vs_now`。
  - **新口径**：`lose = max(0, fut.box_gain_vs_now)`，文案「亏 N 级（屯箱子多升：同一批箱子等到开放日按更高基地收益折算可多升）」。
  - **数值影响**：561 场景 ① 由「赚 0 / 亏 **17** → 等开放日」变为「赚 0 / 亏 **1** → 等开放日」（结论方向不变，量级修正 **17×**）。
  - ⚠ `future_main_story.result.level − selectable.level`（=18）是**「总共多升多少级」**，含等待期到账资源 + 等待期攒箱 + 屯箱增值，**不等于**提前开箱的代价 —— 两者不可互换。

- **③b 「推图节点」按用户定义重写**（`js/app.js`）
  - **用户定义**：今天提前开一部分箱子把同步器升上去 → 推困难 → 推到「**基地红球收益 +2/h**」后，从那天到新主线开放日期间多累积的收益，跟「开放日那天再开箱」比，亏还是赚。
  - **实现**：`gainDust = RATE_ADD × 每日小时数 × 到开放日天数 + hardPushDust(推图关数)`，`costBoxes = lose × plus1`（`plus1` = 全箱梭哈再多升 1 级所需 1H 箱，以 `nowLv + 1` 跑 `bestEffortPlan` 取 `target_shortage` 折算）→ 输出「划算 / 偏亏 / 无代价」。
  - **红球收益反查**：`O.incomeForLevel(baseLevel, tacticsFull)` 读 `data/outpost_income.json` 的 `by_level`（1–800）。表格有 `_mul`（战术加成）与非 `_mul` 两套 → **先按当前收益判定用哪套**，再逐级向上找 `core_dust ≥ 当前 + 2` 的等级。推图关数 = `dBase × 5`（`computeBaseLevel` 每 5 关 +1）。
  - **新增 `hardPushDust(stagesLeft, startKey)`**：按**章汇总**近似一次性红球收益（仓库无逐关奖励数据）—— 从「当前困难章 + 1」起逐章抽取 `dust_hard`，凑满 `stagesLeft` 关；章数上限 200 作护栏。
  - **实测**：561 场景「基地 571 → **593** 级、约 **+110 关**；到开放日（33 天）多累积红球 ≈ **2,112** 个（收益增量 2,112 + 推图一次性 0）≈ **20** 个 1H 芯尘盒；代价 = 屯箱子多升 **1** 级 ≈ **122** 个 1H 箱 → 偏亏」。

- **④⑤ 标题章节格式**（`js/app.js` → 新增 `stageChapterTags()`）
  - 「**预计新主线进度**」→ 固定为**无章节后缀**（用户明确「（42章·独一）不需要添加」）。
  - 「**预计新主线推图收益**」→ 改为列出**计入范围内**的全部章节：「预计新主线推图收益**「41章·诞生」、「42章·独一」**」（`f_stage_mode` 决定列 1 章还是 2 章；解析后按键号**去重 + 升序**）。
  - `f_stage_mode` 的 `change` 监听里补一次「重刷标题 + 回灌推图收益 + 重算」（「计入范围」决定列哪几章）。
  - note 里的「本章 = 官方第 M 章…」保持不变。

- **⑥ 定制模组统计换作者头像**（`assets/author_sa_yuki.webp`、`mod_stats.html`）
  - 源 `adb2579fdc77a9cbdace3e64cfa64a8aefb7ceba.jpg`（512×512 RGB JPEG，256,925 B）→ **128×128 LANCZOS → WEBP quality 88** = **4,618 B**（旧 4,692 B）；`mod_stats.html` 引用补 `?v=20261016c`。备份 `临时文件/ref/author_sa_yuki.webp.bak_20261016`。

#### 版本号（批 4）

| 文件 | 批 3（`1a99bef`） | 批 4（`5b47dec`） |
|---|---|---|
| `js/app.js` | 20261016b | **20261016c** |
| `css/style.css` | 20261016b | **20261016c** |
| `css/mobile.css` | 20261016b | **20261016c** |
| `index.html` / `mobile.html` | 版本引用 | **20261016c** |
| `mod_stats.html` | 无 | 头像引用 **20261016c** |
| `js/boxes.js` / 字体 woff2 / `js/scenarios.js` | 20261016b / 20261016b / 20261014c | **未改** |

#### 验收（批 4）

- 数值测试 **6 套全绿**：`test_golden` / `test_event_units` / `test_monthly_card` / `test_challenger` / `test_stage_clear` / `test_keep_one_box`。**所有等级与资源数值零变化**（仅「亏」与「②」整句为口径/文案变更）。
- CDP 端到端 **6 套 0 FAIL**：`_verify_batch3`（桌面 1280×1100 + 移动 390×844）、`_verify_batch4`（同双端，新写的 R40 专项 25 项）、`_verify_balance`（1400×1200）、`_verify_ui_batch2`。四套旧脚本已同步改写断言（2 列诊断表 → 一行缺口；`futLv−nowLv` → `box_gain_vs_now`；标题新格式）。
- 新增验证脚本：`_verify_batch4.js`（R40 专项 A–E 五组）、`_shot_sel.js`（通用「滚动到选择器再截图」）、`_fill_b4.js`、`_probe561.js` / `_probe561b.js`（离线探测 561 场景：箱量 ×1 → 现状 534 / 开放日 544；×2.5 → 现状 557 / 开放日 567）。
- **踩坑（记下）**：`Page.captureScreenshot({ captureBeyondViewport: true })` 在 1280 宽 × deviceScaleFactor 2 的长页面上**永不返回**（脚本挂死 9 分钟无输出，表现极像 alert 阻塞）→ 一律改用「滚动到选择器 + 普通截图」；另：本站结果区是**左右两栏各自滚动**，`window.scrollTo` 无效，必须 `scrollIntoView()` + 手动调最近可滚动祖先的 `scrollTop`。

#### 上线（批 4）

- **GitHub Pages**：`5b47dec` 已推送（`1a99bef..5b47dec`；直连首推 Connection reset，**原样重试即成功**）→ 第 4 轮轮询到 `?v=20261016c`。线上 `js/app.js` HTTP 200 / **151,593 字节**，与 `git cat-file blob HEAD:js/app.js` **md5 全等**（`7f95eb481549ea3e3741ac903f63bec7`）；`css/style.css` 46,027 B、`css/mobile.css` 19,130 B；字体保持 `?v=20261016b`；`mod_stats.html` 头像 `?v=20261016c`。
- **WorkBuddy 镜像**：**已发布到 `5b47dec`**（用户当轮明确同意「更新一下 workbuddy 的版本」）。流程与结果：
  - ① 建 `git archive HEAD` 权威基准（**1683 文件**）→ 与 `临时文件/deploy_clean_1007/`（旧镜像 `1a99bef`）全树归一化 md5 比对：**仅基准有 0 / 仅镜像有 0 / 内容不一致 7**，7 项恰为 `1a99bef..5b47dec` 变更集（`assets/author_sa_yuki.webp` / `css/mobile.css` / `css/style.css` / `index.html` / `js/app.js` / `mobile.html` / `mod_stats.html`），**无新增、无删除**；
  - ② 旧文件先备份至 `临时文件/backup/mirror_1a99bef_7files/`，再逐文件覆盖 → 复跑全树比对 **1683 vs 1683 / 三项差异全 0（IDENTICAL）**；
  - ③ deploy 返回 `verified: true`、`sandboxId 1202cc0126f74f1da772352133d20b33`，分享链接未变；`localDir` 未动；
  - ④ 线上轮询**第 1 轮**即命中 `js/app.js?v=20261016c`；8 个关键文件全部 HTTP 200 且与 HEAD 基准**逐字节 md5 全等**（`index.html` 19,426 / `mobile.html` 26,856 / `mod_stats.html` 39,732 / `js/app.js` 154,215 / `css/style.css` 46,815 / `css/mobile.css` 19,600 / `author_sa_yuki.webp` 4,618 / `maiyuan-subset.woff2` 292,612）；
  - ⑤ 真站冒烟 `_smoke_live_wb_1016.js`（`EXPECT_V=20261016c`）桌面 1400×1200 + 移动 390×844 **FAIL=0**。
  - 📌 **行尾口径（易混，记下）**：仓库 blob 为 **LF**（`js/app.js` = 151,593 B，即 GitHub Pages 线上值）；`git archive` 在 `core.autocrlf=true` 下输出 **CRLF**（同文件 = 154,215 B，CR 数 2,622），**WorkBuddy 镜像即 CRLF 版本**，与部署目录逐字节一致。两个平台的字节数天然不同，比对时一律以「基准解包目录」为准，不要去对 GH Pages 的字节数。

---

### 批 5（R41）：推图收益章节口径修正 + 困难收益未到达不计入（`adcdb98`）

> **用户反馈**：「预计新主线有问题，比如现在开放到 40 章，实际上下次是开放 41、42 章。标题显示的章节信息不应该是 40、42」；
> 追加口径：「开放新主线时，由于困难难度通常较高，进度一般不需要同步 +2。收益那块计不计入主要看用户有没有选择计入困难，
> 如果选择都计入，但是预计困难通关没有到达，则不计入，且需要红字注明」。
> 两处经 AskUserQuestion 拍板：① 标题列 **41、42 两章且收益改为两章合计**；② 「预计困难主线关卡」**不 +2**（保持跟随当前）。

#### 修复

- **「预计新主线推图收益」标题混进已开放的旧章**（`js/app.js`）
  - **根因（两层）**：① 旧实现把「预计困难主线关卡」（= 用户当前困难进度，自动跟随）当成第二个新章 → 标题成了「40章·选择」、「42章·独一」，其中键 40 是**已经开放过**的章；② 更根本的是，`syncStageClearFromFuture()` 里「普通」与「困难」两组字段**都取自同一个 `usedKey`**（键 42）——**标题列了 2 章，实际只算了 1 章**。
  - **新口径**：新增 `NEW_CHAPTERS_PER_UPDATE = 2` + `newChapterKeys()` —— 新开放范围 = `[预计普通章 − 1, 预计普通章]`（例：41、42；取不到则自动收缩）。`sumChapterField()` 把范围内**每一章**的 `credit/battle/dust` 与 `task_*` 逐项求和。标题由 `stageChapterTags(m)` 按该范围列出。
  - **note 同步改写**：「本次新开放 2 章（键 41、42）：推图收益 = 各章关卡奖励 + 主线任务奖励 合计。其中**最高新章（键 42「独一」）** = 官方第 43 章：…」（原「本章 = 官方第 M 章」在两章语境下会指代不清）。

- **困难收益「进度没到就不计入」**（`js/app.js` + `css/style.css` + `css/mobile.css`）
  - **双条件**：① 「计入范围」须选「普通+困难」；② 「预计困难主线关卡」须**已到达新开放范围内的每一章**（逐章判定）。任一不满足 → 困难部分按 0 计入。
  - **同源判定**：新增 `stageClearModel()` 一次算准「新开放范围 + 困难是否计入」，表单自动带出（`syncStageClearFromFuture`）、界面红字（`updateStageClearNote`）、灰显（`updateStageClearUI`）、以及 `buildSnapshot()` 的并入开关**全部走它** —— 杜绝「界面说未计入、计算却算了」的不一致。
  - **红字 + 灰显**：note 追加 `.stage-warn`（`#b3283a`、加粗、`display:block`）：「⚠ 计入范围虽然选了「普通+困难」，但预计困难通关（键 40）尚未到达新开放章节（键 41、42），**困难收益未计入计算结果**。」；`#stageHardRow` 同时加 `.stage-row-off`（`opacity: .5`）。竖屏下 `body.m-body .stage-warn` 收紧字号。
  - `syncStageClearFromFuture()` 末尾补 `updateStageClearUI()` —— 章节/进度变更后灰显类需同步刷新（否则只在「计入范围」变更时才算一次）。

- **「预计困难主线关卡」保持跟随当前困难进度**（用户明确：困难难度高，进度一般不需要同步 +2）—— 未改代码，仅确认口径。

#### 数值影响（键 41/42 场景，当前开到键 40；单位 K / 个）

| 项 | 旧口径（仅键 42） | R41（困难未到达） | Δ |
|---|---|---|---|
| 推图信用点 | 17,064.3 | **28,332.75** | +11,268.45 |
| ├ 普通 | 14,101.6 | 27,870.4（键41+42） | +13,768.8 |
| ├ 困难 | 2,758.8 | **0**（未到达，不计入） | −2,758.8 |
| └ 主线任务 | 203.9 | 462.35（键41+42） | +258.45 |
| 推图战斗数据 | 87,492.1 | **95,240.7** | +7,748.6 |
| └ 普通 / 困难 / 任务 | 41,274.0 / 38,242.1 / 7,976.0 | 81,366.4 / **0** / 13,874.3 | — |
| 推图红球 | 1,800 | **1,890** | +90 |
| └ 普通 / 困难 / 任务 | 350 / 850 / 600 | 690 / **0** / 1,200 | — |

- **引擎层零改动**（`core.js` / `outpost.js` / `boxes.js` / `scenarios.js` 未动）→ 六套数值测试全绿，等级与资源数值零变化。
- 若「预计困难通关」到达新章（例：把预计困难改到 42），困难部分恢复计入：键 41+42 合计 `credit_hard = 5,491.8 K` / `battle_hard = 76,090.3 K` / `dust_hard = 1,690`。

#### 版本号（批 5）

| 文件 | 批 4（`5b47dec`） | 批 5（`adcdb98`） |
|---|---|---|
| `js/app.js` | 20261016c | **20261016d** |
| `css/style.css` | 20261016c | **20261016d** |
| `css/mobile.css` | 20261016c | **20261016d** |
| `index.html` / `mobile.html` | 版本引用 | **20261016d** |
| `mod_stats.html`（头像） / `js/boxes.js` / 字体 woff2 / `js/scenarios.js` | 20261016c / 20261016b / 20261016b / 20261014c | **均未改** |

#### 验收（批 5）

- 新增 **`_verify_r41.js`**（A–F 六段 / 31 项）：桌面 1400×1200 + 移动 390×844 **各 31 项全 PASS**。
  - A 段实测：预计普通 = `Chapter 42`（当前 +2）、预计困难 = `Chapter 40`（**不 +2**）、标题 = 「预计新主线推图收益**「41章·诞生」、「42章·独一」**」、普通字段 = 27,870.4、困难字段 = 0、`.stage-row-off` = true、红字文案与颜色 `rgb(179, 40, 58)` 均命中。
  - B 段（把预计困难改到 42）：红字消失、灰显移除、困难字段 = 5,491.8 / 1,690。
  - **E 段端到端口径断言**：「困难未到达」的结果区文本 **≡** 「只计普通」的结果区文本（证明确实没计入）；「困难到达」的结果区文本 **≠** 「只计普通」（证明计入生效）。
- 六套 CDP 历史回归 **0 FAIL**：`_verify_batch3`（双端）/ `_verify_batch4`（双端）/ `_verify_balance` / `_verify_ui_batch2`。
- 环境健康：无 JS 弹窗 / 无 `console.error` / 无未捕获异常 / 无表格横向溢出。

#### 上线（批 5）

- **GitHub Pages**：`adcdb98` 已推送（`5b47dec..adcdb98`；直连首推 `CONNECT tunnel failed, response 502`，**原样重试即成功**）→ **第 3 轮**轮询到 `?v=20261016d`。线上 `js/app.js` HTTP 200 / **155,427 字节**，与 `git cat-file blob HEAD:js/app.js` **md5 全等**（`3b188c9ecb7aea4149013aa0c9a31629`）；`css/style.css` 46,267 B、`css/mobile.css` 19,267 B（md5 亦全等）；字体仍 `?v=20261016b`。
- **WorkBuddy 镜像**：**未发布**（本轮结束时停在 `5b47dec`，落后 HEAD）—— 再发布须用户当轮明确同意。

#### 踩坑（批 5 新增）

- **CDP 脚本里 `SET()` 表达式用模板字面量拼接会静默失效**：`` `…getElementById('${id}')…` `` 写进文件后实际成了 `getElementById(id)`（引号与插值一起丢失），`Runtime.evaluate` 抛 `ReferenceError: id is not defined`，但 `ev()` 只把 `r.result.value` 当结果 → 返回 `undefined`，**表现成「赋值不生效」而不是报错**，白跑两轮。→ 改为 **`JSON.stringify()` 字符串拼接**；并且 `ev()` 应把 `exceptionDetails` 打出来。
- **页面就绪判定不能只靠固定 sleep**：`<select>` 选项还没被 `fillSelect()` 填上时，`e.value = 'Chapter 40'` 是**静默 no-op**；而 `restoreForm()` 会在其后把值覆盖回去。→ 先轮询「章节下拉有选项 + `stageClearNote` 已写 + 收益字段非空」，再赋值，并**回读校验 + 重试**。

---

### 批 6（R42）：整合结论 / 摘要卡口径翻正 ——「亏」→「多赚」（`978ddd4`）

> **用户要求**：整体结论修改为「赚多少」的口径（澄清两点：范围 = 摘要卡 Block①②；方式 = 把「亏」翻成正向说法，**数值不变**）。

**改动**（`js/app.js`；`?v=` **20261016d → 20261016e**，只动 `app.js` 引用 —— `index.html` / `mobile.html` 各 1 行）：

1. **摘要卡 Block② 大字**
   - 旧：`（共计 +Δ 级 = 等待期到账资源 +x 级、开箱 +y 级；屯箱子多升 z 级）`
   - 新：`（比现在多赚 +Δ 级 = 等待期到账资源 +x 级、开箱 +y 级；同一批箱子等到开放日再开箱可多赚 z 级）`
2. **③ 整合结论 ① 行**
   - 旧：`赚 X 级（提前推图收益）/ 亏 Y 级（屯箱子多升…）`，判断句 `（赚 X ≥ 亏 Y）`
   - 新：`赚 X 级（提前推图收益）/ 等到开放日再开箱可多赚 Y 级（同一批箱子按更高基地收益折算）`，判断句 `（赚 X 级 ≥ 多赚 Y 级）`
   - `!hasStage` 分支同步翻正：`赚 — / 等到开放日再开箱可多赚 Y 级`
3. **③ ② 推图节点**
   - `而提前开箱的代价 = 屯箱子多升 N 级 ≈ …` → `而提前开箱要放弃「等到开放日再开箱可多赚」的 N 级 ≈ …`
   - 结论分支：`提前推图的收益 ≥ 代价，提前开箱推图划算` → `… ≥ 放弃的多赚，提前开箱推图划算`；**`为提前推图开箱偏亏` → `不如等新主线开放日再开箱推图`**
4. **信息窗 `tip-block3`** 口径说明同步翻正（`亏 = 屯箱子多升的级数` → `「等到开放日再开箱可多赚」= 同一批箱子按更高基地收益折算能多升的级数（也就是提前开箱要放弃的部分）`；② 段「代价侧」→「放弃侧」）

**数值影响：零**。`lose`（= `fut.box_gain_vs_now`）与全部数字均未变，仅面向用户的措辞；引擎层（`core` / `outpost` / `boxes` / `scenarios` / `events`）**零改动**，等级与资源数值零变化。

#### 验收（批 6）

- 新增 **`_verify_r42.js`**（R0–R13 共 14 项）：桌面 1400×1200 + 移动 390×844 **各 14 项全 PASS**（合计 28 项）。含「Block② 大字含『比现在多赚』且不再含『共计』/『屯箱子多升』」「③① 行不含『亏』」「结果区全文不含『亏』/『屯箱子多升』」「`tip-block3` 已翻正」「无横向溢出 / 无弹窗 / 无未捕获异常」。实测样本：`Block② = 新主线开放日（2026-10-14），全箱梭哈可到 同步器 525（比现在多赚 +11 级 = 等待期到账资源 +7 级、开箱 +2 级；同一批箱子等到开放日再开箱可多赚 2 级）`（7+2+2=11 自洽）。
- **node 六套数值测试全 PASS**：`test_golden` / `test_challenger` / `test_stage_clear` / `test_event_units` / `test_keep_one_box` / `test_monthly_card`。
- **五套 CDP 历史回归 0 FAIL**：`_verify_batch3` / `_verify_batch4` / `_verify_ui_batch2` / `_verify_r41` / `_verify_wait_split_ui`（断言已同步 R42 口径）。

#### 上线（批 6）

- **GitHub Pages**：`978ddd4` 已推送（`adcdb98..978ddd4`）→ **第 6 轮**轮询到 `?v=20261016e`。线上 `js/app.js` HTTP 200 / **156,041 字节**，与 `git cat-file blob HEAD:js/app.js` **md5 全等**（`31d3aa8254e0af5e5dc68fc77600368a`）。
- **真站冒烟**（GH Pages 双端，`EXPECT_V=20261016e EXPECT_V_CSS=20261016d`）：桌面 1280×1100 / 移动 390×844 **FAIL=0**（含「`app.js` 版本 = 20261016e」「无 4xx」「无外部域名请求」「字体 292,612 字节」；css 仍 `20261016d` 符合预期）。
- **WorkBuddy 镜像**：**未发布**（停在 `5b47dec`，落后 HEAD 两个 commit）—— 再发布须用户当轮明确同意。

#### 踩坑（批 6 新增）

- **推送环境的代理变量还有小写版本**：`env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY` 不足以剥离 —— 本机同时设了 **`http_proxy` / `https_proxy`**（指向沙箱内部代理 `127.0.0.1:64285`），git 会读小写名，于是「直连」反而报 `CONNECT tunnel failed, response 502`。→ 必须连小写一起 `-u`；全剥离后直连仍因 DNS 污染不通（`Failed to connect to github.com:443`），最终**借用户正在运行的 Clash（`127.0.0.1:7897`）**推送成功。
- **断言里的 `<\/b>?` 陷阱**：`/<\/b>?/` 不是「可选的 `</b>`」，而是 `</b` + 可选 `>`。而 CDP 读 `textContent` 拿到的是**无标签纯文本** → 断言必挂。→ 纯文本断言不要带标签匹配（要写就写 `(?:<\/b>)?`）。
- **冒烟脚本的版本期望要按文件拆**：只改 `app.js` 的批次里 `css/*.css` 版本仍停在上一版（铁律「只升自己改的」），而 `_smoke_live_wb_1016.js` 原先对 `app.js` 与 css 共用同一个 `EXPECT_V` → 会误报 css 版本不符。→ 新增 **`EXPECT_V_CSS`**（默认跟随 `EXPECT_V`）。

---

### 批 7（R44）：自选箱配比改「有界 DP」+ 去掉 `≤100` 阈值 —— 任意箱量都取**精确最优解**（`f378eb3`）

> 用户口述：「现在计算一次需花费的时间很长，希望优化算法、保精度、尽量提速，优先成熟算法，并说明用了什么算法 / 提升多少 / 减少多少耗时」。
> 先产出 `docs/计算器性能优化-实施提示词.md`（实测定位 + 算法选型 + 可断言验收），用户随后定案
> 「**只要保证方案是最优解即可**」⇒ 决策点 D1 取 **D1-a**（去掉阈值、统一走精确解），批 A 落地。

#### 问题定位（Chrome 无头 + V8 CPU Profile + 箱量扫描，改前基线）

- 热点：`js/boxes.js` 的 `fastThreeTwoFlexiblePlan` 自耗 **75.2%**、`solveWithChallenger` **19.3%**、GC 2.9%；**其余全部代码合计 < 2%**。
- 一次 `evaluate()` 调它 **32 次** → 三重循环内层合计 **5,659,232** 次迭代（`C(q3+3,3)`，q3=100 → 176,851/次）。
- **悬崖**：方舟箱 **100 → 引擎 2,436 ms**、**101 → 11.5 ms（215×）**；端到端 **6,393 ms → 21 ms（304×）**。
  触发条件 = 三个自选箱数量都 > 0 **且**按 `BOX_DEFS` 顺序第一个三选一箱数量 ≤ 100（`js/boxes.js:345`）。
  该阈值**只为防枚举爆炸**，代价是 `q3 > 100` 时整个函数返回 `null` → 调用方退回**启发式贪心**（可能多开箱）。
- 第二块大头：**渲染阶段占端到端 61.7%（3,955 ms），且 100% 是重复求解**（`renderTargetPlans → planByLevels` 重跑 `bestEffortPlan` ×5 + `planForTarget` ×4）；DOM 本身 < 50 ms。

#### 改了什么（`js/boxes.js`；`index.html` / `mobile.html` 各 1 行引用；`css/*` 与 `app.js` 未动）

1. **箱数配比求解：三重全枚举 `O(q³)` → 有界动态规划 `O(3·Jmax²)`**（纯标量、无循环内对象分配）。
   模型不变：`min Σc_i + Σf_r s.t. c_i·V_i + f_r·F_r ≥ S_r、Σc_i ≤ q3、Σf_r ≤ qF`；因「给定 c 后 f 取最小 `ceil` 即为最优」，只需在 c 空间寻优。
   `Jmax` 裁剪 = `min(q3, Σceil(S_r/V_r), 「全用弹性箱且不超 qF」的总箱数)` —— 可证明不损失最优解。
   ⚠ **重建时必须复现旧枚举的 tie-break**（`total < best` 严格小于 + `(c0,c1,c2)` 升序枚举 ⇒ 同总箱数取**字典序最小**），否则会出现「总箱数相同但箱量明细变了」的静默回归（原型实测不固化则 440 例中 44 例明细会变）。
2. **去掉 `three.quantity <= 100` 阈值** ⇒ 任意箱量都返回精确最优解，同时消除「100→101 换算法」的 215× 悬崖。
3. **挑战者箱贡献的副作用**由「最内层循环」提前到求解之前（原写法只有首轮枚举生效，属 HEAD 既有缺陷；现实数据挑战者箱恒为 `units` 型、在开箱顺序①即被全消耗，故不触发）。
4. **保留全枚举作兜底** `enumerateFlexiblePlan`（仅当三选一箱的选项→资源不是一一对应时启用；实际数据恒为一一对应），确保任何映射下都是最优解而非退回贪心。

#### 数值影响

- 原阈值下本就走 fast 路径（`q3 ≤ 100`）的输入：`boxes_used` 与箱量明细**逐字不变**；
- `q3 > 100` 的输入由「贪心」改为「精确最优」⇒ 用箱数**只会更少或持平**，绝不增加（差异清单 41 例全部是「新版更省箱」）；
- 引擎层（`core` / `outpost` / `scenarios` / `events`）**零改动**；等级、资源、收益与全部口径不变。

#### 精度对拍（vs「去掉阈值的原版全枚举」精确基准）

| 对拍项 | 结果 |
|---|---|
| 用例数（`q3 ∈ [1,130]` 随机，600 例） | 600 |
| 可行性判定不同 / 最优值不同 / 同分方案归属不同 | **0 / 0 / 0** |
| 逐字全等（整份方案 `JSON.stringify`） | **600 / 600** |
| vs 原版（带阈值）：行为相同 / **新版更省箱** / 新版更费箱 / 原版有解新版无解 | 559 / **41** / **0** / **0** |

#### 性能（本机实测）

| 指标 | 改前 | 改后 | 提升 |
|---|---|---|---|
| 求解器单次（`q3 = 100`） | 76.95 ms | **0.015 ms** | **≈ 5,100×** |
| `evaluate()`（方舟箱 100） | 2,436.42 ms | **6.25 ms** | **390×** |
| `evaluate()`（方舟箱 90 / 50） | 1,851 / 331 ms | 5.5 / 3.1 ms | 335× / 108× |
| **端到端「点击 → 结果渲染完」** | **6,393 ms** | **27 ms**（中位） | **237×** |

> `evaluate()`（方舟箱 211，用户真实库存）22.64 → 29.22 ms：该档原先走贪心（快但不最优），现在走精确 DP（略慢但最优），绝对值仍在 30 ms 量级。

#### 验收（批 7）

- `node` 六套数值测试全 PASS；CDP 双端（1400×1200 / 390×844）`_verify_r41`(31) / `_verify_r42`(14) / `_verify_batch3` / `_verify_batch4` / `_verify_ui_batch2` / `_verify_wait_split_ui` **全部 FAIL=0**。
- 新增脚本 `临时文件/scripts/_ab_r44_dp.js`（三层对拍 + 性能）、`_dbg_r44_one.js`、`_patch_r44.py`；产物 `临时文件/out/ab_r44_dp.txt`、`perf_profile_after.txt`。

#### 上线（批 7）

- **GitHub Pages**：`f378eb3` 已推送（`978ddd4..f378eb3`）→ **第 4 轮**轮询到 `js/boxes.js?v=20261016f`，线上 **34,472 字节** 与 `git cat-file blob HEAD:js/boxes.js` **md5 全等**（`01b65a2e8fe136fcc15bf26ab029d8e0`）。
- **真站冒烟**（GH Pages 双端，`EXPECT_V=20261016e EXPECT_V_CSS=20261016d`）：桌面 1280×1100 / 移动 390×844 **FAIL=0**。
- **WorkBuddy 镜像**：**未发布**（停在 `5b47dec`，落后 HEAD 四个 commit）—— 再发布须用户当轮明确同意。

#### 踩坑（批 7 新增）

- **`Jmax` 裁剪必须校验「全用弹性箱」是否真的可行**：首版把「全用弹性箱所需箱数」无条件当上界，漏了 `≤ qF` 判定 ⇒ 600 例对拍里 **12 例「oracle 有解 / DP 无解」**。加上 `allFlex <= qF` 后归零。
- **对拍要分「现实/非现实场景」**：随机用例里人为构造出「非 `units` 型二选一箱」（现实不存在），会命中旧实现「挑战者贡献只在首轮枚举生效」的缺陷，产生 1 例差异。→ 主对拍固定现实条件（`two.left = 0`），副对拍单列不计 FAIL。
- **文档里的断言必须回读源码核对**：v1 提示词写的「`flex` 的 `choices` 零数量键不得写出」与实读不符（现状是**全标签写出、缺值记 0**），已更正——照错误描述实现会让箱量明细表漏行。


---

## 2026-10-14

### 新增
- **月卡（30 天成长补给箱）自动计入选项（默认关闭）**（commit `9b4955c`，`js/scenarios.js` v=20261009a → **v=20261014a**、`js/app.js` v=20261012c → **v=20261014a**、`index.html` / `mobile.html`，新增 `test_monthly_card.js`）
  - **背景**：用户从今天屯到新主线开放日，每天多到账 1 个「30 天成长补给箱」（月卡奖励），此前计算器完全没有这个来源，开放日箱量被系统性低估
  - **控件**：在「预计新主线进度」分组内新增「月卡（30 天成长补给箱）」下拉（是 / 否，**默认否**），旁边一段 hint 说明口径。`index.html`（桌面）与 `mobile.html`（移动）同步上线
  - **口径**：开启后按 **「数据日期 → 新主线开放日」的天数** 逐日 1 个，合计 `Math.round(days × perDay)`（箱数取整），并入**开放日快照的箱量**（`selectable_boxes` 里 `30天成长补给箱` 的 `quantity`；列表里已有则累加、没有则新建条目）
  - **为什么只进开放日**：月卡箱是「等待期内才到账」的资源，必须走 `futureSnapshot()`（现状四档 `no_box` / `bare` / `fixed` / `selectable` 与「较现状多升 N 级」口径**一律不含**）→ 因此**默认关闭时现状口径逐值不变**
  - **`30天成长补给箱` 是自选箱、不是固定小时箱**（`data/box_definitions.json` 为 `select_one`：芯尘 10h / 信用 30h / 战斗 10h；价值 ≈ 10 个方舟官方补给物资Ⅰ）→ 归入自选箱管线，由既有开箱三层顺序消费
  - **回传字段 `monthly_card_boxes`**：让 UI / 导出 JSON 能显示「本轮实际计入了几个箱」，0 表示未开启
  - **数值示例（用户导出快照 2026-10-14 → 开放日 2026-12-16 = 63 天）**：关闭 **583 级** / 开启 **586 级**（+3 级），`monthly_card_boxes = 63`，现状口径 **558 级不变**，箱量增量恰为 **63 个**
  - **踩坑**：`futureMainStoryScenario()` 需显式回传 `monthly_card_boxes`，否则 `monthlyCardBoxCount()` 的导出路径与页面链路不一致
  - 验收：`test_monthly_card.js`（6 组 20 项断言）**ALL PASSED**、`test_golden.js` ALL PASSED、`test_event_units.js` ALL PASSED
- **三资源配平诊断：服务于「目标同步器等级 / 后续追求目标等级」的缺口折算**（commit `a20c94f` 首版 → **`5a6a480` 重做为目标等级口径**，`js/scenarios.js` v=20261009a → **v=20261014b**、`js/app.js` v=20261012c → **v=20261014b → v=20261014c**、`index.html` / `mobile.html`，新增 `test_keep_one_box.js`）
  - **背景**：用户反馈「箱子全开升级，但钱箱 / 经验箱 / 红球箱不够」——比如红球够升到 500，但信用点或战斗数据只够到 480，界面只给一个「全箱梭哈能到 N 级」，看不出**是哪一项在拖后腿、还差多少**。参考口径：`pinkuro.top` 的 NIKKE 同步器配平计算器（其「缺少 1H箱×N」）
  - **首版走偏（已废弃）**：最初做成「以三资源中**最高**可到等级为目标」的自创口径，输出「全箱梭哈能到 / 是否瓶颈 / 想追平最高级还需」，挂在「补充信息」tab 独立成块 —— 与页面填写的目标等级脱节，不服务于任何开箱方案。用户指出后按参考站重做
  - **现行口径（1:1 对齐 pinkuro）**：以页面填写的**目标同步器等级 / 后续追求目标等级**为基准，逐资源给两列：
    - **单项资源上限** = 把自选箱**全部按该项资源**选择、单独看这一项能到的等级（`per_resource.selectable[r]`）
    - **达成目标 X 级** = 按开箱顺序（挑战者全开 → 固定小时箱按需 → 自选箱按需）**开完全部可用箱子后仍缺的资源量** ÷ 该资源 **1H 箱产量** → 「还缺 **N 个** 1H 信用点盒 / 战斗数据辑盒 / 芯尘盒」；够则「**✅ 足够**」
    - 缺口的权威来源是 `planForTarget(snap, tgt, mode).remaining_shortage`（既有的开箱优化器产物），**不再自造算式**
  - **落点**：从「补充信息」**迁入「达成目标方案」每个目标块内** —— 现状口径一份；现状不可达而开放日可达时再补一份**开放日口径**（新基地收益 + 等待期自然积累 + 推图收益）。原「⑤ 全箱梭哈也无法达成」由一行提示改为**展示完整缺口诊断**（并保留 fixed / selectable 方案明细）
  - **性能**：`planByLevels` 五个分支统一回传 `diag`（`shortage` + `perRes`），渲染层复用已有结果，**不重复调 `planForTarget`**（避免 `fastThreeTwoFlexiblePlan` 的三重枚举被多算）
  - **计数格式**：新增 `fmtInt` —— 箱「个数」用千分位，不再被 `fmtNum` 压成「25K 个」
  - **文案**：「达成目标方案」标题下补一段 caption 说明两个口径的含义，以及「三资源共享同一批自选箱、实际以『还缺』列为准」的前提
  - **实机示例**（PC 1280 / 移动 390 一致）：目标 540 级、全箱梭哈只到 531 时 → `信用点 单项上限 546 → ✅ 足够`、`战斗数据辑 单项上限 533 → 还缺 926 个 1H 战斗数据辑盒`、`红球 单项上限 532 → 还缺 1,190 个 1H 芯尘盒`
  - **不引入的诊断数据**：`per_resource._res`（三档三资源可用量）本轮为首版诊断所加，重做后**不再被页面使用**，保留为引擎侧的通用能力，仅 `test_keep_one_box.js` 第 5 组仍在用
  - **验收**：`_verify_balance.js` 无头 Chrome 端到端，PC 1280 与移动 390 两档 **全 PASS** —— 诊断位于 `.target-card` 内、两个目标块各一份、表 3 列 3 行、每行给出「✅ 足够」或「还缺 N 个 1H …盒」、第二列形如「同步器 N」、零横滑；并把目标拉高到 700（全箱梭哈不可达）后断言仍给出缺口诊断；`test_keep_one_box.js` **全 PASSED**
- **「每种箱保留 1 个」开关（默认否，收藏向）**（commit `a20c94f`，同上一行）
  - **背景**：部分玩家习惯**每种箱子各留一枚做收藏**，此前只能自己手动把每种箱的库存减 1，很麻烦
  - **控件**：桌面 `index.html` 与移动 `mobile.html` 的「自选箱数量」分组末尾新增「保留箱（每种留 1 个）」下拉（是 / 否，**默认否**），旁附 hint 说明口径
  - **口径**：`scenarios.js` 新增纯函数 `applyKeepOneBox(snapshot)` —— **固定小时箱按「箱型 × 档位」逐格 −1**（24h / 12h / 8h / 4h / 2h / 1h 各自独立留 1），**自选箱按名称 −1**（挑战者成长宝箱 / 30天成长补给箱 / 方舟官方补给物资Ⅰ 各留 1），**下限 0**（库存为 0 的不变负）
  - **只作用于计算副本**：`calculate()` 里 `state.lastSnapshot` 仍是**原始库存**（表单与页面显示不变），只把 `S.applyKeepOneBox(snap)` 的结果交给 `evaluate()` → 「全箱梭哈上限」「开箱方案」都按保留后的数量算，**原始填写值不被改写**
  - **浅拷贝保 `Date`**：实现用 `Object.assign` 而非 `JSON.parse(JSON.stringify())` —— 后者会把 `recorded_at` 等 `Date` 字段转成字符串，破坏下游
  - **默认关闭时零影响**：`keep_one_box` 非真时 `applyKeepOneBox` **原样返回入参快照**（连浅拷贝都不做）→ 既有口径逐值不变
  - **验收**：`test_keep_one_box.js` —— ① 未开启原样返回 ② 每格 / 每名称 −1 ③ 下限 0 ④ 不污染原快照 ⑤ 全箱梭哈等级不升高 ⑥ 与箱无关区块不变 ⑦ 目标等级口径缺口折算（`remaining_shortage` 三资源齐全 / `feasible` 布尔 / 目标越高缺口单调不减）⑧「红球 / 信用点够、经验箱不够」且目标不可达的瓶颈场景（报出正整数个 1H 箱）；**全 PASSED**
- **目标不可达时给出「最优均衡开箱方案」（不再退化成「全堆一项」）**（commit `a61e223`，`js/boxes.js` v=20261005a → **v=20261014a**、`js/app.js` v=20261014c → **v=20261014d**，新增 `test_stage_clear.js` 第 ④ 组）
  - **背景**：填写的目标等级**三资源联合优化不可达**时（即「全箱梭哈也到不了」），旧实现直接按目标等级求解，贪心会把**全部自选箱堆给最难补的那一项** —— 用户数据里 211 个方舟箱全给芯尘，结果只能到 520 级，而均衡分配实际能到 **522**
  - **改法**：`boxes.js` 新增导出 `bestEffortPlan(snapshot, baseResources, targetSteps, incomePerHour)` —— 对「联合优化器能达成的最大步数」做**二分**（`lo=1, hi=targetSteps−1`，每次 `optimizeSelectableForTarget(mid)`，取 `feasible` 的最大 `mid`），返回该步数下的**均衡**方案（含 `fixed_used` 与 `selectable` 分配明细）
  - **不变量（已断言）**：`bestEffortPlan().steps` **恒等于「全箱梭哈」可达步数**（用户数据：现状 522、开放日 530 逐值一致）→ 不会比梭哈矮一级，也不会虚高
  - **落点**：「达成目标方案」的 ⑤ 分支（现状不可达 / 开放日也不可达时均适用）展示「**最优均衡开箱方案（最多升到同步器 N 级；再往上需按上方诊断补 1H 箱）**」+ 固定箱明细矩阵 + 自选箱卡片；分配明细里方舟箱不再只用 1 个选项（用户数据为 140 芯尘 + 71 信用点）
  - **文案**：caption 同时补一句「表内报『还缺』的项**都要补足**（三项共用同一批自选箱，只补其中一项不够）」

### 修改
- **自选箱分配卡片改「一行三列」**（commit `a009b26`，`css/style.css` v=20261014a → **v=20261014b**、`index.html` / `mobile.html`）
  - **背景**：`挑战者成长宝箱` / `30天成长补给箱` / `方舟官方补给物资Ⅰ` 三张卡片原先竖排堆叠，合计约 309px 高，在结果栏里占掉一大段滚动
  - **改法**：`.box-cards` 由单列堆叠改 `grid-template-columns: repeat(3, minmax(0, 1fr))` —— 一行铺满三张。结果栏 400px（视口 1280 附近）每张 **128px**、1920 视口（结果栏 1040px）每张 **341px**、手机竖屏 314px 每张 **99px**
  - **关键点**：`.box-card` 必须补 **`min-width: 0`** —— grid item 默认 `min-width: auto` 会被内容 min-content 撑住，不归零则窄栏里卡片不肯收窄、直接溢出
  - **紧凑化**：字号与内边距整体收紧（标题 13.5→12.5px、明细 12.5→11.5px、备注 11.5→10.5px、内边距 9/10→8/9px），数值行由固定 `gap:16px` 改 `flex-wrap`；新增 `@media (max-width: 820px)` 再压一档（标题 11.5 / 明细 11 / 备注 10px）；标题加 `text-wrap: balance` 改善「方舟官方补给物资Ⅰ」在 99px 下的断行（8 字 + Ⅰ 必然折两行，balance 让它 5/4 而不是 8/1）
  - **高度收益**：1280 视口 309 → **128px**，手机 390 视口 309 → **156px**，1920 视口 → **99px**
  - **数值影响：无**（纯样式）。`test_golden.js` / `test_event_units.js` / `test_monthly_card.js` 全绿
  - **验收**：5 档视口（1280 / 1200 / 900 / 390 / 320 × 桌面与移动）端到端 **全 PASS** —— 卡片零溢出、矩阵仍 7 列零横滑、整页 `overX = 0`
  - 最窄一档为视口 1200（结果栏仅 320px → 每卡 101px），标题折两行但无溢出，仍可读
- **桌面页固定小时箱数量填写容器：同步移动端排版**（`css/style.css` v=20261009b → **v=20261014a**、`index.html`）
  - 上一轮移动版已改「一屏 7 列 `table-layout: fixed`」，桌面页仍是旧的可横滑宽表 → 本轮把同一套规则提到 `style.css` **两页共用**，桌面 / 移动表现一致
  - 关键：列宽写在 **`th:first-child`** 上（`table-layout: fixed` 的列宽取自**首行**，写 `td:first-child` 对表头无效）；≤700px 断点把原先「`.fixed-table, .cost-preview table` 一起改 `display:block`」拆开，只保留 `.cost-preview table` 走竖排，`.fixed-table` 改为 `display: table` + 固定列宽；新增 `@media (max-width: 340px)` 再降一档字号
- **开箱方案显示重构（与「固定小时箱数量」同表形）**（`js/app.js` v=20261014a、`css/style.css`、`css/mobile.css` v=20261012b → **v=20261014a**）
  - **① 固定箱明细**：原「30 行 × 3 列表（箱子 / 数量 / 小时）」→ **4 行（芯尘盒 / 战斗数据辑盒 / 信用点盒 / 成长套组）× 6 列（24 / 12 / 8 / 4 / 2 / 1h）矩阵**，与上方填写表**同表形**（`.fixed-table.plan`），格子带箱图标；用到的小时格加 `.on`（强调色 + 加粗）、未用到加 `.off`（淡灰）→ 一眼看出「开了哪几格」
  - **② 自选箱分配表**：原「桌面走表格 / 移动走卡片」双分支 → **统一卡片**（`selectableBoxCards()`：箱名 / 已用 / 保留 / 分配明细 / 备注），删除 `isMobileShell()` 分支 → 移动端零横滑、桌面端更易读，两页渲染路径合一
  - 图标目录跟随页面上输入表实际用的资源目录（桌面 `assets/`、移动 `assets/m/`），不写死
  - 空方案时仍输出说明句（`无需开箱（现有资源 + 固定小时箱已满足目标）`）
- **配平诊断「还缺」改乐观口径（与「单项资源上限」列自洽）**（commit `a61e223`，`js/app.js` v=20261014c → **v=20261014d**）
  - **背景**：诊断表两列原先不同源 —— 「单项资源上限」= 自选箱全给该项能到的等级；「还缺 N 个 1H 箱」= `planForTarget().remaining_shortage`（**具体分配策略**的产物）。同一行里「上限 546」却「还缺 926 个」，读起来自相矛盾；且策略一变（如本轮改分配器）数字就漂移
  - **改法**：`planByLevels` 内改算**乐观缺口** —— `optGap[r] = max(0, costForLevels(目标步数)[r] − 该资源可用量[r])`，可用量取 `per_resource._res.selectable`（现状）与新增的 `per_resource._res.future_selectable`（开放日）
  - **语义**：读作「即使把**全部**自选箱都给这一项，还差多少 1H 箱」→ 与「单项上限」严格互补，**不随分配策略漂移**
  - **`future_selectable` 新增回传**：`scenarios.js` 的 `perResource._res` 补 `future_selectable`（开放日口径折算 1H 箱用），`scenarios.js` v=20261014b → **v=20261014c**
  - **瓶颈标记**：`balanceDiagTable` 在「单项资源上限」列给最小值那行加 `← 全箱梭哈上限`（`<br>` 换行，移动端 390 视口不再横滑 17px）
  - **不可达分支的表结构**：现状与开放日各一份诊断表，`_verify_balance.js` 断言改为遍历**全部**诊断表，两档（PC 1280 / 移动 390）**全 PASS**

### 修复
- **桌面页 `index.html` 在手机上的宽度异常（根因与移动版同一处）**（`css/style.css` v=20261014a）
  - 现象：桌面页在手机上展开「升级消耗素材量 / 固定小时箱数量 / 自选箱数量」后，布局视口被从 390px 撑到 **628px**，`fieldset.grp-d` 撑破父容器 241px、结果表 3 张需横滑 226 / 226 / 157px
  - 根因：`<fieldset>` 的 UA 样式 `min-inline-size: min-content` 把内部宽表的 min-content 宽度一路上传到布局视口
  - 修法：把上一轮写在 `css/mobile.css` 的 `min-inline-size: 0; min-width: 0` 补到 `css/style.css` 的公共 `fieldset` 规则 → 桌面页在手机上同样不再被撑宽
- **【重要】推图收益（`stage_clear_resources`）被重复计入 ×2 —— 用户反馈「怎么差钱阿」的根因**（commit `a61e223`，`js/boxes.js` v=20261005a → **v=20261014a**、`js/scenarios.js` v=20261014b → **v=20261014c**、`js/app.js` v=20261014c → **v=20261014d**，新增 `test_stage_clear.js`）
  - **现象**：用户按页面给出的 521 方案开箱，**信用点不够** —— 页面说「芯尘盒 + 战斗盒开着就行、一个信用点盒都不开、自选箱 0 个」
  - **根因**：`stage_clear_resources` 被叠加了两次。`scenarios.js` 的调用方已按模式把推图收益并入底盘，而 `boxes.js` 的 `optimizeSelectableForTarget()` / `fixedBoxesNeeded()` 内部**又各有一行** `addRes(baseResources, snapshot.stage_clear_resources)` → 实际 **×2**。用户数据（517 → 521）因此凭空多出**信用点 28,611,000**，刚好盖过 **26,145,000** 的真实缺口 → 判定「信用点足够」，把箱量全让给了芯尘
  - **修法**：`boxes.js` 两个函数**只使用传入的 `baseResources`（完整底盘）**，不再自行叠加；口径统一写死为 **现状（now）= 裸资源（不含推图收益，见项目铁律 5）**、**开放日（future）= 裸资源 + 等待期自然积累 + 推图收益 ×1**
  - **调用侧对齐**：`planForTarget()` 按 `mode` 决定是否并入推图收益（now 一律不计）；`scenarioF()` 改为**显式透传原始推图收益**作为第 3 参 —— 立即行**不计**、开放日行**计一次**（此前 `evaluate()` 传入的 `snapNow` 已被置零，开放日行实际是 **×0**，恰好与 ×2 反向抵消了一部分，掩盖了问题）；`app.js` 的 `planByLevels` 改用「口径快照」`s2`（future 取 `projected_snapshot`）并把底盘**一次算准**，分支 ②③ 不再重复加
  - **数值影响**：现状（now）口径下的裸 / 固定箱 / 自选箱等级与**现状全箱梭哈等级不变**（推图收益在现状口径本就应为 0，×2 与 ×0 在此口径下等价）；**受影响**的是①「达成目标方案」的开箱方案与固定箱明细 ②开放日（future）全箱梭哈等级（用户数据 **531 → 530**）③`scenario_f` 的开放日行（此前漏计推图收益）
  - **实机复算用户数据**：521 方案 = **方舟 44 个**（信用点 31 + 芯尘 13）+ **固定箱 731 个**（信用点盒 195+30+4+2 **全开**）→ 信用点不再缺口；541 = 现状上限 **522** / 开放日上限 **530**，缺口 **1,803 / 1,731 / 2,345** 个 1H 箱（红球最狠，与用户直觉一致）
  - **A/B 验证**：`git archive 5a6a480` 导出旧引擎，用 `vm.createContext` 沙箱**并行加载新旧两套引擎**逐项对比 → 确认现状口径逐值相同、差异只落在上述三处
  - **验收**：新增 `test_stage_clear.js`（4 组断言）**ALL PASSED** —— ① 现状口径用箱数与分配明细与 `stage_clear=0` 时完全相同、四档与 `box_gain_vs_now` 不受影响 ② 开放日 `future_selectable[r] == projected_bare[r] + stage[r]` 逐资源精确相等，并**反证 ≠×2、≠×0** ③ `bestEffortPlan().steps == 全箱梭哈步数`（目标 530/541/560 逐值）④ 退化方案 vs 最优均衡对照；`test_golden` / `test_event_units` / `test_monthly_card`（开放日 583→**582** 期望同步修正）/ `test_keep_one_box` 全绿；`_verify_balance.js`（表单显式填入**非零**推图收益以覆盖 ×2 触发路径）PC + 移动 **ALL BALANCE UI CHECKS PASSED**；`_verify_plan_ui.js` **ALL PASSED**；`_cdp_vendor_check.js` 首屏外部请求 = **0**
- **修复「较现状多升 N 级」的表述歧义：改为分层拆解（等待期到账资源 / 开箱 / 箱子按新收益折算）**（commit `4c24495`，`js/app.js` v=20261014d → **v=20261014e**、`index.html` / `mobile.html`）
  - **背景**：用户看导出 JSON 里的「开放日（2026-11-18）全箱梭哈最高可到同步器 492（开箱收益对比：较现状多升 0 级；另有等待期自然积累 24 级）」，问那 **24 级**从哪来，并指出「这个说法怪怪的」。核实后确认**用户的读法才是对的**：24 级里只有 **7 级**是「不开箱也有的」（裸资源层被等待期到账资源抬高），另 **17 级**必须开箱才拿得到
  - **根因（纯表述问题）**：`app.js` 用 `waitGain = max(0, diff − boxGain)` 作残差，把它命名为「等待期自然积累」，与 `boxGain`（量的是「同一批箱子按新基地收益折算更值钱」）并列成互补项 —— 两个维度不同，读者自然理解成「那 24 级都不用开箱」
  - **改法**：新增 `levelGainSplit(result)`（三资源取 min = 瓶颈），把 `diff` 拆成三项且**保证相加 == diff**：
    - **等待期到账资源** = 裸资源层抬升（`per_resource.bare` → `future_bare`）
    - **开箱** = `diff − 等待期到账资源 − box_gain_vs_now`（残差，兜底）
    - **箱子按新收益折算** = `box_gain_vs_now`
  - **三处文案统一**：摘要卡 Block② 大字（`较现状多 24 级 = 等待期到账资源 +7 级 + 开箱 +17 级；箱子按新收益折算另 +0 级`）、Block③ 整合结论、全资源对比表 caption；Block② 另加一行**同口径明细**「不开箱可到 464 → 471 级；全箱梭哈 468 → 492 级。」
  - **口径纪律（关键）**：明细行**只用 bare 层**（逐资源取 min 与联合口径等价）。`per_resource` 的**自选箱层是「自选箱全给单项」的乐观上界**，实测比联合口径高 1 级（531 vs 530），**不能与 `futLv` 混用** —— 首版明细同时列出三档时，三档差值与大字分量算不拢（自洽断言直接抓出该问题）
  - **版本号**：`js/app.js` 20261014d → **20261014e**（`index.html` / `mobile.html`）
  - **数值影响**：**纯文案表达式改动，所有等级 / 资源数值逐值不变**（`test_golden.js` 全绿）
  - **验收**：新增 `临时文件/scripts/_verify_wait_split.js`（以用户导出 JSON 的 `per_resource` 断言 **7 / 6 / 11 / 17 / 0 / 24** 且三层之和 == diff，并对照旧口径确实夸大）**ALL PASSED**；新增 `临时文件/scripts/_verify_wait_split_ui.js` **PC 1280 + 移动 390 各 15 项全 PASS**（三分量之和 == 总级数、明细与大字自洽、旧表述已消失、整页零横滑）；五套数值测试 + `_verify_balance.js` + `_verify_plan_ui.js` 回归全 PASS
  - **字体未动**：文案刻意避开新增汉字（原拟用的「拆 / 献 / 贡」不在字体子集内，改写成「其中 / 开箱」等已有字），故 `maiyuan-subset.woff2` 与 `css/style.css` 版本号均未改
  - **踩坑（重要）**：`font_charset.js` 的扫描口径过宽（连 `assets/js/vendor/xlsx.full.min.js`、`*.md`、`*.json` 一起收）→ 字符集 34,449 字，子集化后 woff2 会从 **284 KB 膨胀到 2,632 KB**。本轮误跑后**已 `git checkout` 回滚**字体，并按现有 woff2 的 cmap 重建 `临时文件/out/_subset_chars.txt`（1,508 字）。**今后跑字体子集化前务必先核对字符集量级（≈1.5k，不是 3w+）**
  - **发布**：GitHub Pages 已生效（轮询第 4 次命中 `app.js?v=20261014e`，线上 `app.js` 含 `levelGainSplit` 与「等待期到账资源」）；WorkBuddy 镜像**待用户当轮确认后再刷**

### 其它
- **与远端 13 个他人提交（战力计算Beta v2.5–v2.9 / 关卡收益表 / sync.js）rebase 合并**：`css/style.css` 唯一冲突在 557 / 565 行的工具容器选择器（他人加 `#appCombatPowerBeta`、工作区另有未提交的 `#appCombatReroll`）→ **两者合并共存**，其余三处版本号（`js/sync.js?v=20261013b` / `?v=20261013a`、`stage_clear_resources.json?v=20261014a`）取远端。rebase 后三个测试全绿
- **WorkBuddy 部署目录已刷新到 `a61e223`，并已发布上线**：`git archive HEAD` 权威全树 md5 比对（归一化行尾）—— HEAD 1676 vs 部署 1675，唯一差异是按约定排除的 `.gitignore`；发布后线上 https://nikke-level-planner.app.workbuddy.host/ 与 `/mobile.html` 实测 `app.js?v=20261014d` / `boxes.js?v=20261014a` / `scenarios.js?v=20261014c` 三项全中，`bestEffortPlan`、`optGap` 均在线上文件中；真站冒烟（桌面 + 移动）**FAIL=0**（19 项/页），含 521 三项全「足够」、541 现状无法达成 + 最优均衡方案 + 缺口 1,803/1,731/2,345、零横滑、无 4xx/5xx、无外部域名、无 JS 异常

---

## 2026-10-12

### 修改
- **主线推图收益改用官方拆包逐章数据（含主线任务奖励）**（commit `9d5b907`，app.js v=20261012a → **v=20261012b**，index.html / data/stage_clear_resources.json）
  - **背景**：原 `data/stage_clear_resources.json` **只有第 38 章一条**「37-38 章实测估算」（来源：屯箱子计算器），界面 6 个输入框默认值写死、文案写着「暂无公开的章节通关收益统计表」
  - **① 数据覆盖 1 条 → 47 章**：来源 `任务与奖励明细` 的 `13_战役_每章奖励汇总`（每章 普通/困难 通关奖励）+ `10_主线任务明细`（每章主线任务奖励）。键口径 = **计算器章节号 = 官方 ChapterId − 1 = 游戏关卡前缀**（如键 `37` = 官方第 38 章「苦战」= 关卡 37-x）。只取**信用点 / 战斗数据辑 / 芯尘**三项（信用点与战斗数据单位 K），珠宝/铸模/企业装备/双模组高级增强器等不计
  - **② 新增「主线任务信用点/战斗数据/红球」三个输入**：计入范围 ≠ 不计算时并入（与普通/困难无关），不计算时与困难行一起隐藏
  - **③ 修正既有单位换算缺失（重要）**：推图数据 credit/battle 存的是 **K**，而内部口径是**绝对值**（`bare_credit` 默认写 `66605K`、升级消耗表也在 `costForLevel` 里 ×1000）→ 原代码**漏了 ×1000**，旧默认值 `25864` 实际只贡献 25,864（相对 66,605K 的现有量约等于没有）。现按 K ×1000 换算，dust 仍为个；输入框标签标注 `·K`
  - **④ 章节联动修复**：原逻辑「当前值 == 初始默认值才自动带出」→ 一旦带出过别的章，**第二次切章永久不再更新**。改为记录上次自动带出的值（`stageAutoFilled`），用户手改后即不再覆盖；原 `if (!n) return` 会让 `Chapter 0` 被跳过（已修）
  - **⑤ 旧口径存档迁移**：localStorage 命中旧默认值（`25864 / 74096 / 630 / 2615 / 73446 / 1630`）一律视为未自定义、换用新默认，避免老用户停在旧数据
  - **⑥ 图例与说明随章节联动**：「第 X 章「章名」· 官方拆包」+「官方第 N 章 / 普通 a 关 / 困难 b 关 / 主线任务 c 条」；超出官方收录范围的 `Chapter 47/48` **明示**并暂按最高已收录章（`46`「新生」）带出
  - **⑦ `stage_clear_resources.json` 的 fetch 补 `?v=`**（原来无版本参数，有 Pages/浏览器缓存旧数据的风险）
  - **数值示例**：Chapter 2 `18 / 21.6 / 75 · 11 / 683.1 / 295 · 任务 20 / 170.5 / 150`；Chapter 37 `12667.2 / 36152.3 / 310 · 2615 / 36104.4 / 810 · 任务 216.65 / 0 / 0`；Chapter 46 `15193.2 / 45113.6 / 370 · 2861.3 / 39761 / 880 · 任务 307.5 / 7464.45 / 1300`（默认章 = 进度下拉末章 Chapter 48 → 暂按 Chapter 46 带出）
  - **校验**：生成脚本对全 47 章断言「表13 == 表12 逐关重聚」「关数一致」「关卡名前缀 == 章节号−1」→ **0 问题**；无头 Chrome 本地端到端 **22 项 FAIL=0**、线上真站冒烟 **8 项 FAIL=0**、`test_golden.js` ALL PASSED（现有四档逐项未受影响）、`test_event_units.js` ALL PASSED、外部依赖检查 外部请求 0 / 404 0
- **活动模板按官方拆包数据全量校准**（commit `b8e9ade`，events.js / app.js v=20261011a → **v=20261012a**，重生成 data/event_templates.json）
  - 依据 7 份官方拆包表单（`企业塔与无限之塔奖励`、`任务与奖励明细`、`WISDOM SPRING` / `UNBREAKABLE SPHERE` / `ABSOLUTE` / `JUVENILE DAYS` / `COLORLESS` 活动奖励）**逐行脚本核对**。表单为国际服数据 → **只比对内容与数值，不搬日期**（时长一致）
  - **① 任务代币口径修正**：21 天 6050 → **6500**（一次性任务 5300 按 11+11+11 关结构 + 活动地图隐藏道具 1200；旧值把地图「已拾取 750」混算进任务项）；28 天 6050 → **5600**（逐行统计实为 12+12+12 结构，4700+900）；14 天 8300 不变
  - **② 签到补齐**：14 天补 3 笔（方舟 I×12 @offset1、**三资源盒 12h×1** @offset4、方舟 I×12 @offset5）；28 天补 4 笔（方舟 I×5 @offset2、成长套组8h @offset5、方舟 I×10 @offset8、成长套组12h @offset11）。同时证实**签到逐期不同、非固定结构**（方舟 I 数量与位置每期都变）
  - **③ 挑战关卡改引擎口径（#6，收益最大）**：**开放日 = 首通奖励 + 通关奖励**（首通那次同时也给通关奖励），其后 = 扫荡。引擎 `activity_income.py` 与 `js/events.js` 同步 1:1 改动 `aggregate`
  - **④ 新增 12h 三资源盒键** `credit_box_12h` / `battle_box_12h` / `dust_box_12h`（计算器固定箱表原生支持 24/12/8/4/2/1 小时，`boxes.js` 按小时键动态遍历 → 无需改箱管线）
  - **⑤ 顺带把 K 取整改为官方精确值**：挑战关 1-5/1-6/1-7 信用点与各关战斗数据辑由截断值换精确值；挑战 1-2 / 1-3 补「高品质铸模×5」（不涉三资源）
  - **数值影响（起始日无关，含每日任务 + 签到）**：`small14` 信用点 2,086,640 → **2,398,520**（+312K）、`large21` 3,969,120 → **4,580,500**（+612K）、`large28` 5,012,120 → **5,447,420**（+435K）；三档战斗数据辑统一 10,516,000 → **13,149,806**（+2,634K）、红球 192 → **240**、挑战者箱 159/360/535 → **205/450/625**；方舟自选箱Ⅰ 0/46/0 → **24/46/15**
  - **已撤销的误判**：此前核对报告 v1 曾把官方「分卷加成奖励 ×50」列为模板未计 —— 实为误判。模板每关 tokens 本就 = 官方清关奖励 base **+50**（官方该条备注 `BonusRewardCharacterGroup=75/76`，即活动加成角色的每关加成），用户实测扫荡 S2H1-11 一次 = 100 完全咬合。**若照 v1 建议再加会重复计算**
  - **未采纳项（用户裁定 / 无数值影响）**：14 天商店「五企业主机」限购保留 2 次（官方三表一致为 1，证据已留档）；14 天商店「手册」限购不改（属不购入名单）
- **引擎归档层（仓库外）6 份逐活动 JSON 同步到同一口径**：`ABSOLUTE_2026-09` / `COLORLESS_2026-09` / `JUVENILE_2026-08` / `LYCORIS_2026-10` / `NEWFLAVOR_2026-10` / `UNBREAKABLE_SPHERE_2026-09` —— 只改 `challenges`（官方精确值 + `quality_invite`）、`tasks.tokens`、新增 `checkin`、新增 `_calibration` 说明字段，其余键逐键断言未变
  - `tasks.tokens`：large28 6050 → **5600**、large21 6050 → **6500**；`checkin`：large28 4 笔 / large21 4 笔（原为绝对日期，统一 `offset_day`）/ COLORLESS 2 笔 / JUVENILE 3 笔 / NEWFLAVOR 2 笔（占位沿用 COLORLESS）
  - **引擎实跑已与模板层完全对齐**：`UNBREAKABLE_SPHERE` = **4,580,500**（= `large21`）、`ABSOLUTE`/`LYCORIS` = **5,447,420**（= `template_large`）、`COLORLESS`/`NEWFLAVOR` = **2,398,520**（= `template_small`）。ABSOLUTE/LYCORIS 的 credit 由 5,524,900 降到 5,447,420，是 tokens −450 经「商店余额兑信用」放大抵过挑战关精确值上调
  - **逐期真实签到**（取自官方 `4_签到印章`）：COLORLESS(10037) = ark×10@2 + 12h 三资源盒@3，**只 2 笔**（14 天里的例外；模板典型值 3 笔 = JUVENILE/WISDOM SPRING 的 ark×12@1 + 12h盒@4 + ark×12@5）；规律是「12h 三资源盒」固定落在**第 4 或 5 天**
  - **新登记缺口（未擅自修）**：`JUVENILE_2026-08.json` 结构不完整 —— 官方 24 关（2 组），归档只有 `S1N` 12 关且 `stage_blocks: []`，引擎实跑仅同级 14 天活动的 59%，不可直接用于预测

### 修复
- **移动端：展开分组后整页被撑宽（根因 `fieldset` 的 `min-inline-size`）＋ 固定箱填写容器 / 结果展示过宽**（`css/mobile.css` v=20261012a → **v=20261012b**、`mobile.html`、`js/app.js` v=20261012b → **v=20261012c** 并同步 `index.html`）
  - **现象**：展开「升级消耗素材量 / 固定小时箱数量 / 自选箱数量」后 **整页布局视口从 390px 被撑到 628px（+61%）** → 6 个时长只剩 4 个可见（2h / 1h 被切）、底部第 4 个 Tab 被切、整页像被缩小
  - **根因**：`<fieldset>` 的 UA 样式带 `min-inline-size: min-content`，而 `style.css` @≤700px 给表格单元格加了 `white-space: nowrap` → 固定箱表最小宽度 **431px**、分档预览表 **605px**；该「最小宽度」被 fieldset 继承、再经 block 祖先一路上传，Chrome 移动端据此扩大布局视口。**折叠态之所以正常，是因为 `display:none` 的内容不参与 intrinsic sizing**
  - **① 根因加固**：`#formSection fieldset { min-inline-size: 0; min-width: 0 }` → 实测视口 628 → **390**，一次性覆盖所有宽表（含将来新增）
  - **② 固定小时箱表改「一屏 7 列」**：`table-layout: fixed` 在容器宽度内平分。**列宽必须写在 `th:first-child` 上** —— fixed 布局取**首行**定列宽，写 `td` 上无效（实验已证）。表宽 431 → **324 = 容器宽（零横滑）**、24 格一屏铺满、单格 36×40px、标签列 87px（「战斗数据辑盒」不换行）；≤340px 再降一档字号（320 下单格 28 → 30px，保证 4 位数字不被截）
  - **③ 分配表在移动版改为卡片**（`js/app.js` 新增 `isMobileShell()`，以 `body.m-body` 为门闸）：原 5 列表 `箱子/使用/保留/分配明细/备注` 在 314px 容器里表宽 459px、需横滑 **214px** 且「分配明细」被截断；改卡片后零横滑、明细与备注完整换行显示。**桌面站 `index.html` 的 `<body>` 无该类 → 渲染路径、样式与改造前逐字未变**
  - **④ 升级消耗分档预览在移动版改为「每档一段」竖排**（同一 app.js 分支）：6 列密集数字（含 11 位）在 324px 里需横滑 152px、末列被切，且它正是把整页撑到 605px 的元凶；改竖排后零横滑
  - **⑤ 结果表瘦身 + 长表头折行**：表内字号 13 → 12px、`.wrap` 列 `min-width 140 → 104` / `max-width 56vw → 46vw`、首列 `84 → 72`、`th` 允许折行（`max-width: 24vw`）→ 剩余表格横滑 **214 → 145px（−32%）**；本轮移动版实际渲染出的结果表已**全部无需横滑**
  - **⑥ 固定箱输入便利（5 项，仅存在于 `mobile.html` 的内联脚本，不进 app.js）**：聚焦即全选 / `Enter` 跳下一格（配合 `enterkeyhint="next"`，数字键盘右下角显示「下一项」）/ 聚焦滚到屏幕中部避开软键盘 / 有值高亮·0 值淡灰 / 分组标题旁「清空」一键归零 24 格（`stopPropagation` 防止误触 legend 折叠）。提示复用 app.js 的 `#toast`，位置由 `mobile.css` 抬到 `bottom:150px`（否则被底部 Tab 与吸底按钮压住）
  - **两个实测坑**：① `<input type="number">` **不支持** `select()`（`selectionStart/End` 恒为 `null`）→ 24 格改用 `text` + `inputmode=numeric`（安卓数字键盘不变）并加纯数字过滤；② `select()` 在 `focusin` 里同步调用会被浏览器随后的「光标落到值末尾」默认行为覆盖（选区塌成 `len–len`）→ 必须放到下一帧执行
  - **数值影响：无**。同一表单在 `index.html`(1440×900) 与 `mobile.html`(390×844) 的结果对象仍 **25,375 字符逐字节一致**

### 新增
- **安卓竖屏移动版页面**（`mobile.html` + `css/mobile.css` + `assets/m/`，**桌面站零改动**）
  - **背景**：原页面在 390×844 下首屏被 **383px 高的 hero banner** 占满（文档高 3005px），导航挤在 hero 下方、拇指难及
  - **做法**：不复刻计算逻辑 —— 现有 `js/app.js` 与 DOM 之间是 **id 契约**耦合（`f_*` 表单字段、`#resultSection` / `#tabRaw` / `#btnSave` 等，且 `bindEvents()` 不做 null 检查），故移动版复刻同一套 id 后**原样复用 app.js / core.js / events.js / scenarios.js / boxes.js / outpost.js**，并沿用 `js/shell.js` 作工具切换外壳。新增文件只有页面 + 样式，**无任何新增 JS 逻辑**
  - **美术风格完全继承**：复用同一份 `css/style.css`（`:root` 变量、MaiYuan 子集字体、卡片/省流卡/结果表/分组配色）+ 同一张 NIKKE hero 背景，`mobile.css` 只重排布局
  - **布局改动三处**：① 383px hero → **56px 顶部固定栏**（hero 图作背景条延续视觉，含保存 / 跨设备同步 / 填写进度球）；② 顶部横向导航 → **底部 Tab 栏**（`shell.js` 渲染的 `.app-nav` 由 CSS 搬到屏幕底部，四工具拇指可达）；③ 吸底「开始计算」+ 进度球重新定位，互不遮挡
  - **安卓适配**：`viewport-fit=cover` + `env(safe-area-inset-*)`（刘海 / 手势条）；触控目标 ≥44px；输入框 16px 字号防聚焦缩放；数值输入补 `inputmode` 调数字键盘；竖屏字段保持两列（用 `minmax(0,1fr)` 防 date 控件撑破卡片），≤340px 才降单列
  - **功能取舍（按需求确认）**：保留表单 / 结果 / 活动收益 / 分享链接；移出「导出图片」与「XLSX 模板下载 · 导入」—— 节点仍保留在 DOM 中（`bindEvents` 不做 null 检查），仅界面隐藏，因此 `html2canvas` / `xlsx`（按需库，gzip ≈360KB）在移动端**永不加载**
  - **首屏优化（国内弱网）**：① 云同步（Supabase SDK 218KB + sync.js，gzip ≈62KB）改为 `load` 之后注入，不占关键路径；② 新增 `assets/m/` 轻量图片替身 —— hero 1920×1109/355KB → 960×554/**87KB**、7 个表单小图标 256×256/173KB → 64×64/**19KB**、favicon 60KB → **2.7KB**（原图一律保留未动）
  - **首屏字节：1,446,035 → 970,458（−475KB，−33%）**；外部域名请求 0、4xx 0、JS 异常 0
  - **上线（2026-10-12）**：commit `b51aff1`（11 文件 / +585 行，只含移动版三项，`git add` 逐一列名未用 `-A`）→ GitHub Pages 推送一次成功，第 6 次轮询（约 50s）生效，`mobile.html` 19,809 B 与 `css/mobile.css` 与本机**逐字节一致**（LF 归一 md5 相同）；同一提交发布到 WorkBuddy 镜像（`_sync_deploy_dir.py` 与 `git archive HEAD` 权威比对：覆盖写入 11 / 清理 0 / **缺失 0 / 内容不一致 0**）→ 两站真站冒烟（390×844）均 **FAIL=0**（JS 异常 0 / 4xx 0 / 四个工具无横向溢出）
  - **本轮踩坑**：线上轮询的生效断言串凭记忆写成 `m-top-bar`（实际类名 `m-top`），文件早已生效却空转 19 轮 —— **轮询断言串必须先 `grep` 本地文件确认，勿凭记忆**
- `docs/主线推图收益-官方拆包数据说明.md` —— 主线推图收益的数据来源 / 键口径 / 单位规则 / 前端接入点 / 校验记录，**含全 47 章逐章数据表**（表格由数据文件现算，与线上必然一致）
- `docs/活动模板-官方拆包数据核对报告.md`（v3）——本次核对的完整证据链：逐行任务代币统计、挑战关逐项 diff、商店/签到对照、已撤销判断的记录、执行结果清单
- 引擎侧（仓库外）：`README.md` 新增「校准记录」（含 2026-10-12 第二轮归档层对照表）「已知缺口」章节、`模板抽象方案.md` 更新代币/签到/箱键口径与归档层同步状态

### 验证
- `test_event_units.js` → **ALL EVENT TESTS PASSED**（BASE 三档换新值 + 新增 4 组守卫断言：①挑战关开放日 = 首通 + 通关 ②12h 三资源盒键被引擎识别 ③14/28 天模板必须带 `checkin` ④任务代币口径）
- `test_golden.js` → **ALL GOLDEN TESTS PASSED**（无活动时「现状」四档口径逐项未受影响）
- 无头 Chrome 活动端到端 → **45 项 PASS / FAIL=0**（0 个 4xx、0 个 JS 异常、0 个外部请求；`event_templates.json` 与 `events.js` 均 200 命中）
- 无头 Chrome 外部依赖检查 → 首屏外部请求 **0**、404 **0**
- **线上校验**：GH Pages `index.html` 已引用 `?v=20261012a`；线上 `event_templates.json` 与 `js/events.js` 与本机**逐字节一致**（归一化行尾后）
- **归档层校验**：6 份 JSON 全部 `json.load` 通过；除目标三键外**逐键 JSON 等价断言**通过；用真实 `activity_income.py` 跑全窗口，新值与模板层逐项一致
- **镜像校验（WorkBuddy 部署目录）**：以 `git archive HEAD` 解包做**权威全树 md5 比对**（归一化行尾）—— HEAD 1652 文件 vs 部署目录 1651，唯一差异为按约定排除的 `.gitignore`，**内容不一致 0 项**
- **移动版一致性校验（本轮新增）**：同一份表单（含现状四档 / 未来口径 / 推图普通+困难+任务 / 活动收益 / 全部箱子类型 / 手动覆盖升级消耗）分别在 `index.html`（1440×900）与 `mobile.html`（390×844）点「开始计算」→「原始 JSON」Tab 的完整结果对象 **25,375 字符逐字节一致**，结果区摘要文本一致
- **移动版布局断言**：顶部栏 56px（替代 383px hero）、无 hero banner、底部导航 `position:fixed` 且贴底（390×844 / 360×800 / 414×896 三种机型均无横向溢出）、XLSX 与导出图片按钮 `display:none`、吸底「开始计算」位于底部 Tab 之上不重叠
- **移动版资源体检**：外部域名请求 **0**、HTTP 4xx/5xx **0**、JS 异常 **0**；云同步脚本确认在 `load` 事件之后才注入
- **移动端宽度回归（本轮新增）**：`_diag_width.js` 在 **320 / 360 / 390 / 414** 四档断言「展开全部分组后 `innerWidth == 视口宽`、固定小时箱表零横滑、无元素撑破父容器、无元素越出视口」→ **全部 0 FAIL**。改造前对照（390）：`innerWidth` **628**、固定箱表需横滑 107px、分档预览需 152px
- **固定箱输入交互（本轮新增）**：`_verify_fixed_ui.js` → **7 项 0 FAIL**（聚焦选区 0–4 全选 / 回车焦点落到第 2 格 / 24 格均带 `enterkeyhint` / `has-val` 标记正确 / 清空 24 格归零且重算正常 / 提示浮层底部 y=694 未被底部 Tab（顶 781）压住）
- **桌面站未受影响（本轮复验）**：`index.html` @390 仍是 5 列表格、无 `.box-cards`（`isMobileShell()` 门闸生效）；`test_golden.js` ALL GOLDEN TESTS PASSED、`test_event_units.js` ALL EVENT TESTS PASSED
- **桌面站未受影响**：`test_golden.js` ALL GOLDEN TESTS PASSED、`test_event_units.js` ALL EVENT TESTS PASSED（per_resource 逐项与移动版改造前一致）；`git status` 中本次新增仅 `mobile.html` / `css/mobile.css` / `assets/m/`
- **上线确认（本轮新增）**：commit `ea50d9b` 已推送；GH Pages 首次轮询即生效 —— `mobile.html` / `css/mobile.css` / `js/app.js` / `js/core.js` / `index.html` 五个文件与本地 `HEAD` **逐字节一致**（归一化行尾后 md5 全等，5/5），版本号 `?v=20261012b`（mobile.css）/ `?v=20261012c`（app.js，index.html 与 mobile.html 同步）均已带上
- **镜像校验（WorkBuddy 部署目录）**：`deploy_clean_1007` 已刷新到 `ea50d9b`；用 `git archive HEAD` 解包做**权威全树 md5 比对** —— HEAD 1663 文件 vs 部署目录 1663 文件，**缺失 0 / 内容不一致 0**

### 备注
- **桌面页 `index.html` 在手机上打开仍有同样问题（本轮已复现定位）**：390×844 下折叠态 `innerWidth=390`，展开 6 个分组后 → **628**（`docScrollW` / `body.scrollWidth` 同为 628，「整页无横向溢出」的假象正是布局视口被撑大的结果）；元凶是 `fieldset.grp-d` **撑破父容器 241px**（另一个同类 fieldset 超 124px），其 `overflow-x: visible` 无法吸收内部宽表的 min-content 宽度，再被 UA 的 `min-inline-size: min-content` 一路上传。结果区仍有 3 张 5 列表需横滑（226 / 226 / 157px），且走的是表格分支（无 `.box-cards`——`isMobileShell()` 门闸按预期未生效）。本轮按约定**只改移动版**，`css/style.css` 未动（该文件当前有他人未提交改动，避免混提交），移动版效果确认后再决定是否把 `fieldset { min-inline-size: 0 }` + `table-layout: fixed` 同步进 `style.css` 的 ≤700px 断点
- 本次推送期间本机 DNS 将 `github.com` 解析到被墙 IP（`api.github.com` / `codeload.github.com` 正常），且 Clash 代理未运行 → 用临时本地 CONNECT 中继把 `github.com` 固定到可达边缘 IP 完成推送，用完即销毁，**未改 hosts、未改系统代理**
- WorkBuddy 镜像部署目录已刷新到 `ea50d9b`（全树比对缺失 0 / 内容不一致 0）；**发布动作待用户明确同意**（会覆盖线上分享链接 `nikke-level-planner.app.workbuddy.host`）

---

## 2026-10-11

### 修改
- **21 天大活动模板同步源 txt**（commit `0cf0ad3`，events.js / app.js v=20261011a，重生成 data/event_templates.json）
  - 源材料 `21天大活动模板 .txt` 更新：与 10-09 版逐行 diff 仅两处，均在「任务奖励（每日）」—— 加「芯尘盒（1h）×1」、加「120 代币」
  - **每日任务代币由引擎消费**：`aggregate` 里逐日入 token 池，位置必须在商店结算之前；否则 Hard 开放日清固定物资、结束前余额兑信用都会低估
  - 数值影响（起始日无关）：`large21` credit **3,465,120 → 3,969,120**（+504,000 = 2520 代币 ÷ 10 × 2000）、芯尘盒1h **472 → 493**（+21）；battle / core_dust / 挑战者 360 / 成长套组 / 方舟箱 46 全部不变
  - `small14`、`large28` 逐项不变（14/28 天无地图，每日任务仍只有成长套组 1h×1）

### 验证
- `test_event_units.js` → ALL EVENT TESTS PASSED；`test_golden.js` → ALL GOLDEN TESTS PASSED
- 无头 Chrome 定点验证（新增 `_cdp_large21_probe.js`）：模板字段、events.js 实算与引擎基线逐项一致、UI 累计产出表与 events.js 同口径一致 → **FAIL=0**
- 无头 Chrome 活动端到端回归 → **45 项 PASS / FAIL=0**（0 个 4xx、0 个 JS 异常、0 个外部请求）
- 引擎侧复跑（`verify_event_bases_v3.py`）：`small14` / `large28` 逐项不变，`large21` 与上表一致

---

## 2026-10-10

### 新增
- **工作区结构整理**（按工程铁律归档；**不改任何站点代码**，无 `?v=` 变更）
  - 工作区根由 32 项收敛到 **8 项**：`.workbuddy/`、`.wbapp_*.genie`、`nikke_src/`、`docs/`、`临时文件/`、`archive/`、`agent.md`、`CHANGELOG.md`
  - 新增 `docs/`：3 个方案/分析文档 + 2 个实施提示词 + `PUSH_GUIDE.md`（原全部游离在根目录）
  - 新增 `archive/2026-Q3/`：根目录 16 张旧截图 + `_online_v2.html`（08-20 旧快照，且含 cdnjs/jsdelivr 外链，本身违反铁律 10）；`临时-09-17调研/` 28 项；`临时-旧版/` 13 项（旧轮询/镜像脚本、`线上快照/`、`_invariance.py` 等）
  - `临时文件/` 内部细分 5 个子目录：`scripts/`（调试与验证脚本 25）、`out/`（运行输出 43）、`shots/`（验证截图 44）、`patch/`（补丁与 index 备份 3）、`ref/`（参照数据与第三方库原件 2）
  - **`nikke_src/.gitignore`**（commit `18711e9`）：仓库此前**没有**任何忽略文件，`__pycache__/` 一直躺在 `git status` 里；本次补上 `__pycache__/`、`*.py[cod]`、`_cdp_*.js`、`*_out.txt`、`*.log` 等
  - `临时文件/scripts/` 下 18 个验证脚本的输出目录由 `临时文件/` 根改为 `临时文件/out/`（`font_charset.js` 的字符集输出同步），避免下次跑脚本又把产物堆回根目录

### 移除
- 41 个无头 Chrome 用户数据目录（`_cdp_profile_*`，≈555M 纯缓存）、1 个空目录、8 组共 12 个同内容重复文件
- 未跟踪的 `nikke_src/__pycache__/`
- 工作区 `临时文件/` 体积 **723M → 160M**（本机 C 盘此前占用已达 98%、仅剩 2.4G）

### 验证
- `test_golden.js` → **ALL GOLDEN TESTS PASSED**（`per_resource` 与整理前逐项一致：bare 477/478/474、fixed 495/487/496、selectable 521/497/504、future_* 483/484/480、501/494/502、528/504/510）
- `test_event_units.js` → ALL EVENT TESTS PASSED
- 无头 Chrome 回归 **41 项断言 FAIL=0**（导航 4 项、头像预览 395×395 / 540 卡、窄屏 390×844 正常、0 个 4xx/5xx、0 个 JS 异常）
- 仓库 `git status` 除「新增 `.gitignore`」与「`__pycache__/` 消失」两处外，与整理前**逐行一致**——他人的 `README.md`、`css/style.css` 未提交改动与全部未跟踪文件**零触碰**

---

## 2026-10-09

### 新增
- **活动收益置入**（commit `48cb4f6`，events.js / scenarios.js / app.js v=20261009a，新增 data/event_templates.json）
  - 表单新增「活动收益（可选 · 按具体日期计入）」分组：可添加多个活动，各自选「模板 + 开始日期」，实时预览已计入天数与累计产出
  - 支持 `14天小活动` / `21天大活动` / `28天大活动` 三套模板（含商店兑换、每日任务、签到规则），模板数据由引擎 `activity_income.py` 的 JSON 自动生成（禁止手写）
  - **计入区间 = [max(活动开始日, 数据日期+1), 活动结束日]**：用户填的箱量/资源是「截至数据日期的当前持仓」，已含数据日期当天及以前领到的奖励，故活动收益一律从**数据日期次日**起算，避免重复计入；已结束的活动贡献恒为 0
  - 活动箱并入箱子管线（参与开箱顺序与全箱梭哈上限）但**不写回表单输入框**（活动箱是分日到账的）；挑战者成长宝箱按固定数值 units 计入，不走引擎折算
  - 结果区新增「活动收益」区块：活动清单（窗口 / 实际计入区间 / 计入天数 / 状态）、累计产出（本表单 + 活动 = 合计）、折合等级增量、与「预计新主线开放日」的前后到账天数

### 修改
- **「现状」四档口径不变**：①不开箱、②仅固定小时箱、③全箱梭哈、④自然升级一律按「无活动」计算，活动只影响「等待期 / 开放日」口径（省流②「考虑新主线」与「达成目标方案 → 开放日可达」）
  - 无活动时全站结果**零变化**（test_golden ALL PASSED，per_resource 与改动前逐项一致：bare 477/478/474、fixed 495/487/496、selectable 521/497/504、future_bare 483/484/480、future_fixed 501/494/502、future_selectable 528/504/510）
  - 数值示例（数据日期 2026-10-09、28 天大活动起于当日、开放日 2026-10-20）：计入 27 天（2026-10-10 ~ 2026-11-05）= 信用点 5.0M + 战斗数据辑 10.1M + 红球 176 + 固定箱（芯尘盒 627 / 信用点盒 13 / 战斗数据辑盒 28 / 成长套组 27）+ 挑战者成长宝箱 535；全箱梭哈 496 → 498（+2 级）；开放日全箱梭哈 499 → 500；与开放日关系为「开放日前到账 10 天、开放日后到账 17 天」

### 修复
- **头像预览「展示容器」显示异常**（commit `0e6da75`，只改 tools.json，不加/不改 CSS 与 JS，故无 `?v=` 变更）
  - 症状：切到「头像预览」Tab 后整个工具被压扁——预览画布不可见（容器被压成 **高 0px**）、右侧头像列表只剩几十像素、iframe 只有 150px 高
  - 根因：工具外壳化（commit `8ed1555`）后视图容器改由 `js/shell.js` 按 `viewId || "app_<id>"` 动态生成（`app_avatar` / `app_mod_stats` / `app_reroll`），而 `css/style.css` 的容器选择器仍是外壳化前的旧 id（`#appAvatarFrame` / `#appModStats` / `#appRerollStats`）→ 三组选择器全部失效：`body.avatar-full` 的 `flex:1 1 auto` 拿不到宿主，iframe 退回浏览器默认高 150px，子页 `.preview-wrap`（`aspect-ratio:1/1`）又被 flex 压成 0
  - 修复：在 tools.json 为三个非内联工具显式声明 `viewId` 与 CSS 对齐（`appModStats` / `appAvatarFrame` / `appRerollStats`）。内联的计算器本就写了 `viewId: "appPlanner"`，属同一做法，本次补齐其余三个；并加 `_note` 记录该约束，防止后续被当作冗余字段删掉
  - 附带修复：定制模组统计 / 洗词条计算器同样拿不到容器样式（缺 `padding` 与 `max-width` 居中），一并恢复
  - 实测（1440×749 视口）：iframe 由 150px → **671px**（占满导航以下全高）；`.preview-wrap` 由 `1338×517`（未应用样式）→ **395×395** 正方形；列表可视区 38px → 460px，540 张卡全部可见；窄屏 390×844 下预览 146×146、列表可视 391px
- **头像预览在手机竖屏被挤窄**（commit `4f981b0`，css/style.css + js/shell.js v=20261009b）
  - 症状：手机竖屏切到「头像预览」后，整个工具区右侧被扣掉一大块——390 视口下 iframe 只有 **253px 宽**：顶栏「导出 PNG / GIF」溢出被裁、角色信息列只剩 73px（「拉普拉斯」竖成单字一列）、三个 Tab 折成两行、列表可视高在 375×667 上只剩 **96px**（约一行卡片）
  - 根因：`body.avatar-full { padding-right: var(--sbw, 15px) }` 的 `--sbw` 由 `window.innerWidth - document.documentElement.clientWidth` 量得。移动端页面缩放 / 地址栏收放 / 输入框聚焦时两者并不可比（实测 390 视口上 innerWidth=511、clientWidth=390 → 量出 **121px**），且写入条件只有 `sbw > 0`、**只增不减、从不重算、切全屏工具也不清除** → 一次异常量测即永久生效（390 扣 121、375 扣 136、360 扣 151）。PC 上该差值确实是滚动条宽度（15px），故只在移动端暴露
  - 修复：① CSS 把 `padding-right` 移入 `@media (min-width: 821px)` 并用 `min(var(--sbw, 15px), 24px)` 钳上限（移动端是 overlay 滚动条本就不占宽，一律不补偿）；② shell.js 只接受 `(0, 40]` 的合理值，超出即 `removeProperty("--sbw")` 退回默认
  - 实测修复后：390×844 iframe **253 → 374**、角色信息列 73 → 194（不再竖排）、Tab 单行、列表可视高 273 → **391**；375×667 列表 96 → **214**；360×800 193 → **344**；414×896 → 398；桌面 1440 完全不变（iframe 仍 1369×671，15px 补偿保留）

### 移除
- **「洗练战力」Tab**（commit `0e6da75`）
  - 删除导航区硬编码按钮 `<button data-app="appCombatReroll">洗练战力</button>` 与对应空视图容器 `<section id="appCombatReroll">`：该按钮是工具外壳化之前的遗留物，未纳入 tools.json 注册表，点击只会切到一个空视图
  - 导航现完全由 tools.json 驱动：资源规划计算器 / 定制模组统计 / 头像预览 / 洗词条计算器
  - 站内不再有入口；`combat_reroll.html`/`.js`/`.css` 等文件为未跟踪状态（非本人改动），未删除

### 顺带修正（活动收益引擎侧，不属本站）
- `small14` 模板时长口径由 15 修正为 **14**：`duration` = 活动窗口内「凌晨 04:00 服务器重置」次数 = 可领奖天数，结束日那次 04:00 只是下线时刻不产生新的一天；同批改齐 `large28`/`large21` 数据文件与 README / 模板抽象方案，small14 挑战者产出 184 → 159

---

## 2026-10-07

### 修改
- **页面中心调整为「以手填前哨基地等级为准」**（commit `02cb2c5`，app.js v=20261007a；参照 pinkuro syncLevelCal 的「基地等级手填、收益自动展示」模式）
  - 背景：关卡进度推算不保真——数据源为国际服，国服统计进度约多 3 关；困难关卡漏怪无法保证（用户实例：普通 40-36/困难 40-35 → 国服实际基地 571）
  - 「前哨基地防御等级 + 战术学院」升级为独立分组「当前基地」，置于关卡进度之前；关卡进度降级为可选推算参考，hint 写明国际服口径与国服误差
  - 联动规则：仅关卡进度变更且基地为空时自动填推算值；基地已有值一律不覆盖，推算值不同时出现「采用推算值 lv.X」按钮；清空基地不再被立即回填；收益始终按手填基地等级查表（含战术学院口径）
  - 修同步时序 bug：困难章节强制跟降（enforceHardCap）原先跑在基地推算之后，导致推算用了旧困难状态（40 章双选显示 284 而非 571）
  - 推算口径复核：普通 40-36/困难 40-35 → 571、48 章全通 → 712，与用户实例及历史记载完全一致（公式与数据无误，仅行为修正）

---

## 2026-10-06

### 修改
- **手填「基地防御等级」时收益自动刷新**（commit `02cca58`，app.js v=20261006a）
  - 此前收益只由关卡进度联动触发，手填/手改基地等级后收益字段不更新（用户反馈）
  - 新增 `syncIncomeFromBase()`：按基地等级查 outpost_income 表（含战术学院满级/非满级口径）刷新三个收益字段；`f_base` 变更与战术学院切换都会触发
  - 明确口径：游戏内基地防御等级只由主线进度决定（每 5 关 +1），与同步器等级无联动，故同步器等级不驱动收益；手填同步器时关卡进度保持不动（联动行为不变）

---

## 2026-10-05

### 新增 / 修改
- **开箱顺序调整为：① 挑战者成长宝箱全开 → ② 固定小时箱按需 → ③ 方舟/30天自选箱按需**（commit `7c73044`，boxes.js/app.js v=20261005a）
  - 旧口径「达成目标方案」把固定小时箱**全部**折算使用、只对自选箱开够即停；新口径三层逐级消耗，够目标即停
  - 数值示例（golden 快照目标 481）：挑战者 340 全开 + 固定箱按需 227 个，方舟/30天 0 开（旧口径会显示固定箱全部使用）
  - **全箱梭哈上限不变**（496 / future 503，test_golden ALL PASSED）；「仅使用固定小时箱」口径不受影响
  - 展示：方案表按开箱顺序排列（挑战者行置顶）；省流卡与达成目标方案补「固定小时箱按需开启明细」表；移除「固定小时箱全部使用」旧文案；层级判断改为 ①裸资源 ②+挑战者 ③+固定箱按需 ④+自选箱 ⑤不够

---

## 2026-09-23

### 新增
- **全站自研字体子集化**：MaiYuan 全量 7.86MB → `assets/fonts/maiyuan-subset.woff2` **277KB（−96.6%）** + 566KB ttf 回退；全量原件保留但已无任何引用（可一键回滚）
  - 字符集按全站 `.html/.js/.css/.json` 实际文案扫描得到 **1549 字符**（CJK 1281）
  - **顺带修掉隐藏问题**：字体引用原本有 **4 处**（不止 `css/style.css`），`avatar/style.css`、`mod_stats.html`、`reroll_calculator.html` 也在各自拉 7.86MB 全量；其中 `mod_stats.html` 由主页面 tab 以 iframe 加载 —— 打开「定制模组统计」就会再下一遍 7.86MB。现 4 处统一走子集
  - `index.html` 增加字体 preload；零回归（子集未覆盖的 42 字符与原字体完全一致，均为 emoji，本就由系统字体兜底）
- **本地库目录 `assets/js/vendor/`**：xlsx 0.18.5 / html2canvas 1.4.1 / lz-string 1.5.0 / qrcode-generator 1.4.4
- **顶部导航图标本地化**：3 张 `static.dotgg.gg` 道具图 → `assets/nav_{planner,modstats,reroll}.webp`（64px），46.4KB → **9.4KB（−80%）**
- `js/app.js` 新增 `ensureVendor()`：按需注入本地库，同一库并发只注入一次，加载失败可重试

### 修改
- **首屏跨境依赖清零（改动前：4 个 cdnjs 库 + 3 张 dotgg 图标）**
  - html2canvas（原在 `<head>` 内**阻塞**渲染）与 xlsx（原在底部同步加载，gzip 合计 **362KB**）改为**点击「导出图片 / 下载模板 / 导入 XLSX」时才加载**
  - 代价明确：首次导出多等约 **0.3–0.5 秒**（走同源，不再受 cdnjs 跨境抖动影响，反而更稳），之后走浏览器缓存；失败提示由「需联网」改为「组件加载失败，请检查网络后重试」
  - lz-string、qrcode-generator（gzip 合计 8.7KB）本地化，仍随页面加载 —— 分享链接在首屏就要解码 `#data=`
- 实测：首屏 34 个请求**全部同源、外部请求 0、404 为 0**；导出 PNG 1620×3528（非白像素 53.7%）、XLSX 模板落盘 22KB 且回灌导入成功、分享链接 992 字符用同链接重开可完整还原表单

---

## 2026-09-17

### 修改
- **「较现状多升 N 级」口径修正（省流卡② / 整合结论 / 补充信息全资源梭哈）**：N 不再计入等待期自然积累，只反映「同一资源底盘下，箱子按新基地收益折算多出的等级」（开箱收益对比）；等待期积累单独列出。示例：此前显示「多升 9 级」，现显示「开箱收益对比多升 1 级；另有等待期自然积累 8 级」——等待期收益与是否开箱无关，不应记在新主线头上，也不再随开放日期填写的远近漂移
- **现状口径一律不计入「预计新主线推图收益」**：该字段是表单中标注的新主线开放后一次性资源，此前被计入现状的不开箱 / 仅固定箱 / 全箱梭哈 / 各类资源最大等级 / 目标方案（现状侧）中。修正后现状数字只含现有资源；新主线（future）口径保留计入。现状等级一般不变（推图收益量级小），开箱分配会更保守（多用约 18 个自选箱对冲）
- **修复自选箱量极大时梭哈等级被截断的问题**：`immediateLevels` 二分搜索上界原为固定 `步数+60`，方舟箱约 2 万个以上时结果被钉死；现改为按「全部自选箱取最优单资源价值」的松弛估计动态定界（松弛值 ≥ 真实最优）
- 省流卡①标题「现状（当前基地 · 直接全箱梭哈）」→「现状（当前基地等级 · 直接全箱梭哈）」，补充信息口径说明同步标注「不含新主线推图收益」
- **修正「考虑新主线」区块不展示开箱方案的问题**：该区块标题为「开放日全箱梭哈最高可到 同步器 X」，但下表取的是「为达成目标等级」优化的方案 —— 当目标已被裸资源 + 固定小时箱覆盖时该方案是空表，于是整块只剩一句兜底文案，看起来像"没按新主线收益算"。现改为与「现状」区块对称，统一取「开放日全箱梭哈到最高等级」的真实逐箱分配
- **修正「达成目标方案 · 后续追求目标等级」区块不显示方案的问题**：该区块一直误用「目标同步器等级」的方案（预计算只针对目标等级，不覆盖后续追求等级），导致方案与标题等级不符、或直接空白。现按当前渲染的目标等级现算，开够即停
- 上述两处若确实一个自选箱都不用开，改为明确说明原因（已由裸资源 + 固定箱覆盖 / 等待期自然积累覆盖），不再留空白或显示"暂无分配"
- 同步器升级消耗阶梯表由 **9 档补齐至 13 档**，覆盖范围从 301–750 扩至 **201–1001**
  - 新增 `201–250` 档：此前回落至 301 档，信用点/战斗数据**高估 17.7%–55.5%**（等级越低偏差越大）
  - 新增 `251–300` 档：此前高估 17.7%
  - 新增 `751–800` 档：此前沿用 701 档，**低估 5.0%**
  - 新增 `800+` 档：此前沿用 701 档，**低估 10.3%**
  - 档位数值取自 Prydwen level-requirements 权威分档表，与既有 9 档口径一致
- 阶梯表数据文件（`data/level_cost_table.json`）加载增加缓存版本参数，避免浏览器缓存旧档位表导致补齐不生效

---

## 2026-08-31

### 新增
- 结果区重构为三个 Tab：**计算结果 / 补充信息 / 原始 JSON**
- 「补充信息」Tab：收纳各类资源最大等级（全箱梭哈）、固定小时箱收益折算、全资源梭哈收益折算、自然升级到 X
- **达成目标方案**（计算结果页）：按「目标同步器等级」「后续追求目标等级」分块，样式参考省流卡（独立蓝色卡片），只展示可行方案，不可行仅一行提示「无法达成」
- 省流卡标题改为「**即刻飞升（不做规划，直接梭哈）**」，现状优先展示全箱梭哈最高等级 + 配套开箱方案
- 输入页「当前升 1 级所需 xxx」按「当前同步器等级」所在档位**自动写入**输入框
- 「预计困难主线关卡」默认跟随「关卡进度 - 困难主线关卡」当前选择（含 Chapter 0 低位章节）

### 修改
- 计算结果页顺序：整体等级概览 → 省流卡 → 达成目标方案
- 各类资源最大等级表只保留「全箱梭哈」口径（移除场景列与另两个场景）
- 开箱达成目标统计与开箱方案联动：无法达成的目标直接告知、不再展示表格
- 预计新主线推图收益标题固定为「按 37-38 章估算」
- 修复开放日等日期显示 UTC 偏移一天的问题（改为本地日期）
- 资源引用增加缓存版本参数，解决浏览器缓存旧版导致样式/字体丢失

### 移除
- 「箱子方案」Tab（三种方案表 / 自选箱分配 / 两类收益折算均迁出或并入）
- 此前短暂上线的「省流版」Tab 页签（内容并入计算结果页顶部结论卡）
- 输入页「其他固定日常资源」「区间起始等级」「区间目标等级」「区间资源总需求」等字段
- 开箱达成目标统计表

---

## 2026-08-25

### 新增
- 主线进度同步国际服 47/48 章：新增 88 关，基地收益表扩至 800 级（46 章全通 lv.677 → 48 章全通 lv.712）
- 移动端表单分组可折叠、底部悬浮「开始计算」按钮
- 移动端结果表支持**表格内横向滑动 + 首列固定**，可滑动区右缘渐隐提示

### 修改
- PC 端修复：悬浮按钮不再占位，计算结果恢复右侧双列布局
- hero 工具栏移动端改为独立工具卡片（保存 / 下载模板 / 导入按钮竖排全宽）

### 移除
- 移动端表单底部原「开始计算」按钮（仅保留底部悬浮按钮）

---

## 2026-08-19

### 新增
- 开箱方案按资源储备层级判断：裸资源够 / 固定箱按需 / 固定箱 + 挑战者宝箱平替 / 全梭哈也不够 → 明确告知差额
- 已达目标时显示「无需开箱」；全箱梭哈无法达成时明确提示
- 各类资源最大等级分「新主线开启前 / 后」两列展示
- 固定小时箱、全资源梭哈收益折算（含差值 ≈ 可升等级）
- 自选箱分配按目标等级优化（当前收益 + 新主线后两套方案）
- 结果导出一图流 PNG（隐藏 tabs、注入标题、主题背景）
- hero banner 主题背景图（body 模糊氛围，CSS 变量一键换图）
- 全站统一「卖圆体」自定义字体（MaiYuan）
- 操作提示升级为 Toast 弹窗

### 修改
- hero banner 固定尺寸居中、工具栏整合进 banner、计算按钮动态文案
- 三选一自选箱允许部分 / 不分配（修复开箱方案总是全用导致两种方案相同）
- 未来最大等级用 projected_bare、缺口为 0 时不开自选箱

---

## 2026-08-18

### 新增
- NIKKE 主题背景图（hero banner + body 模糊氛围）
- 手机浏览器体验优化：触控目标放大、表格横向滚动、超小屏单列、select 箭头
- 升级消耗分档预览表格化

### 修改
- 表单结构与结果展示大优化：分组配色、现有资源前移、推图 / 升级联动、三方案整合、差值换算、自然日按 4 点锚计算

---

## 2026-08-10

### 新增
- 纯前端 NIKKE 资源规划计算器首个版本（GitHub Pages 静态版）：表单输入、资源规划计算、结果展示

### 修改
- 移除导出入口、修复 XLSX 模板为空、保存回填、升级消耗 label 与部分覆盖回退
