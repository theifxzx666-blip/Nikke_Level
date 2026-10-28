#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 data/roster_extra.json 的补录角色合并进 data/data.bundle.js。

背景
----
roster 由 149 版静态包（qa-260723-07c）生成，晚于该版本的新角色（首次是 Persona 联动
三骑：QUEEN（真）870 / 雪子 871 / 埃癸斯 872）不在里面。站点按 rid 做主键（收藏、
已记录、逐角色装备存档全挂在 rid 上），所以缺条目不只是搜不到，还会让「从阿卡导入」
按名字匹配失败 → 被计入「站点角色表缺 xxx」。

这个脚本做三件事：
  1. 读 bundle 里的 NIKKE_POWER_DATA；
  2. 校验 extra 每条的字段能落进现有表（enh 有曲线、gcid 在 gradeCore、coll 与
     weapon→favorites 映射一致），任何一条不通过就整批不写；
  3. 按 rid 幂等合并（已存在且完全一致 → 跳过；已存在但内容不同 → 报错不覆盖）。

bundle 重新生成后重跑一次即可补回，不会重复插入。

用法
----
    python scripts/apply_roster_extra.py            # 应用
    python scripts/apply_roster_extra.py --check    # 只校验，不写文件
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_BUNDLE = ROOT / "combat_power_beta" / "data" / "data.bundle.js"
DEFAULT_EXTRA = ROOT / "combat_power_beta" / "data" / "roster_extra.json"
PREFIX = "window.NIKKE_POWER_DATA = "


def load_bundle(path):
    text = path.read_text(encoding="utf-8")
    stripped = text.strip()
    if not stripped.startswith(PREFIX):
        raise SystemExit("bundle 格式不符：开头不是 " + PREFIX)
    body = stripped[len(PREFIX):]
    if body.endswith(";"):
        body = body[:-1]
    return json.loads(body)


def dump_bundle(path, data):
    path.write_text(PREFIX + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n",
                    encoding="utf-8")


def validate(data, items):
    """把每条补录项与现有表对齐；返回问题清单（空 = 通过）。"""
    problems = []
    roster_rids = {r["rid"]: r for r in data.get("roster", [])}
    curves = data.get("curves", {})
    enhance = data.get("enhance", {})
    grade_core = data.get("gradeCore", {})
    fav = data.get("favorites", {})

    for it in items:
        rid = it.get("rid")
        tag = "rid=%s(%s)" % (rid, it.get("name"))
        for key in ("rid", "name", "rarity", "corp", "cls", "enh", "weapon",
                    "critR", "critD", "gc", "coll"):
            if key not in it:
                problems.append("%s 缺字段 %s" % (tag, key))

        if not isinstance(rid, int) or rid <= 0:
            problems.append("%s rid 非法" % tag)
            continue

        enh_key = str(it.get("enh"))
        if enh_key not in curves:
            problems.append("%s enh=%s 没有属性曲线" % (tag, enh_key))
        if enh_key not in enhance:
            problems.append("%s enh=%s 没有强化系数" % (tag, enh_key))

        for gcid in it.get("gc") or []:
            if str(gcid) not in grade_core:
                problems.append("%s gc 里的 %s 不在 gradeCore" % (tag, gcid))

        # 突破档数量与稀有度对应：SSR 11 项 / SR 3 项 / R 1 项
        expect = {3: 11, 2: 3, 1: 1}.get(it.get("rarity"))
        if expect is not None and len(it.get("gc") or []) != expect:
            problems.append("%s rarity=%s 期望 %d 个突破档，实际 %d"
                            % (tag, it.get("rarity"), expect, len(it.get("gc") or [])))

        # 收藏品 R/SR 必须与 weapon 对应的通用收藏品一致（panel.js 就是按 weapon 取表）
        weapon = str(it.get("weapon"))
        coll = it.get("coll") or {}
        for rarity, bucket in (("R", fav.get("R", {})), ("SR", fav.get("SR", {}))):
            want = (bucket.get(weapon) or {}).get("id")
            got = coll.get(rarity)
            if want is None:
                problems.append("%s favorites.%s 里没有 weapon=%s" % (tag, rarity, weapon))
            elif want != got:
                problems.append("%s coll.%s=%s 与 weapon=%s 应收到的 %s 不一致"
                                % (tag, rarity, got, weapon, want))

        old = roster_rids.get(rid)
        if old is not None:
            diff = {k: (old.get(k), it.get(k)) for k in it if old.get(k) != it.get(k)}
            if diff:
                problems.append("%s 已存在但内容不同：%s（拒绝覆盖，请人工核对）" % (tag, diff))

    return problems


def main():
    ap = argparse.ArgumentParser(description="合并 roster 补录到 data.bundle.js")
    ap.add_argument("--bundle", type=Path, default=DEFAULT_BUNDLE)
    ap.add_argument("--extra", type=Path, default=DEFAULT_EXTRA)
    ap.add_argument("--check", action="store_true", help="只校验不写文件")
    args = ap.parse_args()

    data = load_bundle(args.bundle)
    extra = json.loads(args.extra.read_text(encoding="utf-8"))
    items = extra.get("items") or []

    problems = validate(data, items)
    if problems:
        print("校验未通过，未写入：", file=sys.stderr)
        for p in problems:
            print("  - " + p, file=sys.stderr)
        return 1

    before = len(data["roster"])
    existing = {r["rid"] for r in data["roster"]}
    added = []
    for it in items:
        if it["rid"] in existing:
            continue
        data["roster"].append(it)
        existing.add(it["rid"])
        added.append("%s(%s)" % (it["name"], it["rid"]))

    print("roster：%d → %d 条" % (before, len(data["roster"])))
    if added:
        print("新增：" + "、".join(added))
    else:
        print("新增：无（已全部存在）")

    if args.check:
        print("--check 模式，未写文件")
        return 0

    data["rosterExtra"] = {
        "source": str(args.extra.name),
        "updatedAt": extra.get("updatedAt"),
        "rids": sorted(r["rid"] for r in items),
    }
    dump_bundle(args.bundle, data)
    print("已写入 " + str(args.bundle))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
