# NIKKE 练度中转（Netlify 版 · 已上线）

给 `NIKKE 战力计算器` 用的转发服务。**已经部署好了，普通用户只需要填自己的 Pinkuro Key。**

| 项 | 值 |
| :--- | :--- |
| 站点 | `https://nikke-lv-relay.netlify.app` |
| 接口 | `https://nikke-lv-relay.netlify.app/api/relay`（GET + `X-API-KEY`） |
| 账号 | `theifxzx666-blip`（Free） |
| Site ID | `59b86aaf-f753-4bb4-9079-517bd62ac4ba` |
| 函数 | `relay`（nodejs22.x · us-east-2） |
| 已写入前端 | `combat_power_beta/js/app.js` 的 `PRELAY_DEFAULT` |

线上实测（2026-10-28）：缺 Key → `400 missing X-API-KEY`；预检 → `204` 且 ACAO 回显；
带真实 Key → **HTTP 200 / 20,392 字节 / 27 角色 / 3.15 秒**。

## 为什么必须有这一层

`pinkuro.top:9984` 的响应里没有任何 `Access-Control-Allow-*` 头（2026-10-28 实测：`OPTIONS` 返 204 且零个 ACAO），
而请求必须带自定义头 `X-API-KEY` → 必触发浏览器预检 → 页面一定读不到响应体。
CORS 由浏览器执行，前端没有任何写法能绕过。所以必须有一台公网机器替浏览器去请求。

## 为什么选 Netlify

| 平台 | 结论 | 依据 |
|---|---|---|
| **Netlify** | ✅ 采用 | 函数跑在 AWS Lambda，出站端口不受限；`*.netlify.app` 本机直连可达 |
| Vercel | ⚠️ 备用 | 函数本身可用（`relay/` 目录里那份），但 `*.vercel.app` 实测直连超时，国内大概率打不开 |
| Cloudflare Workers | ❌ | 部署后忽略自定义端口，`:9984` 被改写成 443，而 443 实测不通 |
| Deno Deploy | ❌ | 2026-10 被收购，公告 2027-04 关停 |

## 重新部署（改完函数代码后）

需要 Netlify Personal Access Token（`app.netlify.com/user/applications`）：

```bash
cd nikke_src/relay-netlify
export NETLIFY_AUTH_TOKEN=nfp_xxx
npx netlify-cli deploy --prod --dir=public --functions=netlify/functions --message "relay vN"
```

站点已在 `.netlify/state.json` 绑定，不用再 `netlify link`。
（偶发 `Failed retrieving extensions ... fetch failed` 是网络抖动，直接重试即可。）

## 踩过的两个坑

1. **别直接 POST zip 到 `/deploys`**：Netlify 会把 zip 当纯静态目录，`netlify.toml`、函数全部被忽略，
   结果是首页 404、`/api/relay` 404。必须用 CLI 的 `--dir` + `--functions`。
2. **别用 Functions v2 的 `export default` + `config.path`**：手动部署下自定义 path 注册不上
   （部署记录里有路由，实际请求仍 404）。改成 `exports.handler` + `public/_redirects` 才稳定。
3. 顺带：API 建站默认 `sso_login=true`，会让整站 401。需 `PATCH /api/v1/sites/{id}` 传 `{"sso_login":false}`。

## 安全约定

- Key 只从请求头读出后原样转发，不打印、不落库、不写日志。
- 仅放行白名单 Origin（`theifxzx666-blip.github.io` 与本机调试端口），其它站点拿到 `Access-Control-Allow-Origin: null`。
- 仅允许 GET，上游超时 20 秒，响应一律 `Cache-Control: no-store`。
- 错误只回固定文案（`upstream timeout` / `upstream unreachable`），不泄露上游细节，也不含 Key。

## 自检

```bash
node test_relay.mjs      # 21/21，全程 mock 上游，不打扰真实服务
```
