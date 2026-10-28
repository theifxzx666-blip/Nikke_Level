# Pinkuro 中转（给 NIKKE 战力计算器用）

浏览器不能直连 `pinkuro.top:9984`，原因不是网络，而是**服务端不返回任何 `Access-Control-Allow-*` 头**，
而请求又必须带自定义头 `X-API-KEY`（必然触发预检）。这个中转就是补上这一层：放行指定来源、
替你带上 Key、把响应原样送回。

```
浏览器（github.io / 手机 / 任何设备）
        │  GET + X-API-KEY
        ▼
   本中转（Vercel Function）
        │  GET + X-API-KEY
        ▼
pinkuro.top:9984/api/nikke/public/combat/import
```

## 为什么是这个平台

| 平台 | 结论 | 原因 |
| :--- | :--- | :--- |
| **Vercel（本目录）** | ✅ 可用 | Node 运行时用标准 `fetch`，出站不限端口 |
| Cloudflare Workers | ❌ 不可用 | 部署后**忽略自定义端口**，`:9984` 被改写成 `443`（该端口不通，实测 502） |
| Deno Deploy | ❌ 不推荐 | 2026-10-09 已被 Cloudflare 收购，官方公告 2027-04 关停，且明确不建议新项目 |
| 公共 CORS 代理 | ❌ 禁用 | Key 会明文经过第三方，且随时失效 |

## 部署（一次性，约 3 分钟）

### 方式 A：命令行（推荐）

```bash
cd relay
npx vercel login      # 首次需要，选 GitHub / 邮箱登录
npx vercel --prod     # 一路回车用默认值
```

部署完成后会打印形如：

```
https://nikke-relay-xxxx.vercel.app
```

中转地址就是它后面加上 `/api/relay`：

```
https://nikke-relay-xxxx.vercel.app/api/relay
```

### 方式 B：网页控制台

1. 打开 <https://vercel.com/new>，把这个 `relay` 目录推到一个 GitHub 仓库后导入；
2. 框架预设选 **Other**，无需构建命令；
3. Deploy 完成后同样得到 `https://<项目名>.vercel.app/api/relay`。

### 配到计算器里

打开计算器左侧栏「Pinkuro 练度同步」，在**中转地址**那一行粘贴上面的 URL → 点 💾 保存。
之后点「⟳ 从 Pinkuro 拉取」就是走公网中转。清空该行则回到本机 `127.0.0.1:8785` 通道。

## 安全与行为约定

- Key 只从请求头读取，**不打印、不落库、不写日志**；异常响应只回固定文案。
- 只放行白名单 Origin（见 `api/relay.js` 的 `ALLOW`）：你的计算器站点与本机调试地址。
  别的网站拿不到响应体。要用自定义域名，改这个数组即可。
- 只允许 `GET`；上游超时 20 秒（函数上限 30 秒）；响应一律 `no-store`。
- 函数固定在**香港节点**（`vercel.json` 的 `regions: ["hkg1"]`），国内访问延迟最低。

## 本地自检

```bash
node test_relay.js
```

用内置 mock 上游覆盖 17 个断言（预检、白名单外来源、缺 Key、正常透传、非 GET、上游故障），
**不会向真实上游发请求**。

## 免费额度够不够

计算器的用法是「点一次拉一次」，一次几十 KB。Vercel Hobby 计划的免费额度远超这个量级，
不存在被刷爆的问题；真的异常频繁也会先被平台限流，不会产生费用。
