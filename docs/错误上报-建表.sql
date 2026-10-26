-- ============================================================
-- NIKKE 资源规划计算器 · 前端错误上报表（R55）
-- 在 Supabase 控制台 → 左侧 SQL Editor → New query，整段粘贴执行
-- 幂等：重复执行不会报错，也不会清掉已有数据
-- ============================================================
--
-- 权限模型（重要）：
--   前端用的是 publishable/anon key，所以这张表**允许匿名写入**（否则报不上来）。
--   读取权限一概不给 —— 只有控制台（service_role）能看，玩家之间互相看不到。
--   代价：知道 key 的人理论上能往表里写垃圾。数据量小、且有长度上限约束，
--   真被刷就 truncate 一下即可。
-- ============================================================

create table if not exists public.client_errors (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),   -- 入库时间（服务端时钟）
  client_at   timestamptz,                          -- 玩家设备上发生的时间
  cid         text,                                 -- 匿名设备 id（随机 uuid，不含个人信息）
  kind        text not null,                        -- auth / net / selftest / js / other
  code        text not null,                        -- E1001 / E2002 …
  context     text,                                 -- login / register / resend / selftest …
  message     text,                                 -- 已脱敏（邮箱、JWT 被抹掉）
  page        text,                                 -- index.html / mobile.html / ledger.html
  app_ver     text,                                 -- 前端 ?v=，用来看是哪个版本出的问题
  online      boolean,                              -- 上报那一刻浏览器是否认为在线
  ua          text,                                 -- 浏览器 UA（截断 300）
  detail      jsonb                                 -- 附加信息（耗时、HTTP 状态等）
);

comment on table  public.client_errors is '前端错误上报（R55）。匿名只能 INSERT，读取只在控制台。';
comment on column public.client_errors.code is '错误编号，字典见 nikke_src/js/errlog.js 的 CODES';

-- ---------- RLS：只开 INSERT ----------
alter table public.client_errors enable row level security;

drop policy if exists "client_errors_anon_insert" on public.client_errors;
create policy "client_errors_anon_insert"
  on public.client_errors
  for insert
  to anon, authenticated
  with check (
    length(coalesce(kind, ''))    <= 20
    and length(coalesce(code, ''))    <= 16
    and length(coalesce(context, '')) <= 80
    and length(coalesce(message, '')) <= 600
    and length(coalesce(page, ''))    <= 40
    and length(coalesce(app_ver, '')) <= 24
    and length(coalesce(cid, ''))     <= 64
    and length(coalesce(ua, ''))      <= 320
  );

grant insert on public.client_errors to anon, authenticated;
-- 显式收回读权限（默认就不会给，写出来是为了以后加表时别忘了这条原则）
revoke select, update, delete on public.client_errors from anon, authenticated;

-- ---------- 索引：按时间看趋势、按编号看聚类 ----------
create index if not exists idx_ce_created on public.client_errors (created_at desc);
create index if not exists idx_ce_code    on public.client_errors (code, created_at desc);
create index if not exists idx_ce_cid     on public.client_errors (cid);

-- ============================================================
-- 查阅（在 SQL Editor 里跑，或到 Table Editor 直接翻表）
-- ============================================================

-- ① 最近 50 条原始记录
-- select created_at, code, kind, context, page, app_ver, online, message, ua
-- from public.client_errors order by created_at desc limit 50;

-- ② 按错误编号聚合最近 7 天：谁最多、影响多少设备
-- select code, kind, count(*) as 次数, count(distinct cid) as 设备数,
--        min(created_at) as 首次, max(created_at) as 最近
-- from public.client_errors
-- where created_at > now() - interval '7 days'
-- group by code, kind order by 次数 desc;

-- ③ 只看网络类问题（E1xxx）—— 判断是不是大范围线路问题
-- select date_trunc('hour', created_at) as 小时, code, count(*) as n,
--        count(distinct cid) as 设备数
-- from public.client_errors
-- where code like 'E1%' and created_at > now() - interval '2 days'
-- group by 1, 2 order by 1 desc;

-- ④ 某个玩家报来编号后，定位他这台设备
-- select created_at, code, context, page, app_ver, online, message, detail
-- from public.client_errors
-- where cid = '把玩家提供的 id 填这里' order by created_at desc;

-- ⑤ 全清（确认没用了再说）
-- truncate table public.client_errors;
