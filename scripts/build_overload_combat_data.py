import argparse
import hashlib
import json
from pathlib import Path


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def main():
    parser = argparse.ArgumentParser(description="Build versioned NIKKE overload combat data")
    parser.add_argument("--static-analysis", required=True, type=Path)
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--characters", required=True, type=Path)
    parser.add_argument("--formula-source", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    mapping = load_json(args.static_analysis / "词条类型映射.json")
    config_rows = load_json(args.config)
    config = {row["Id"]: row["Value"] for row in config_rows}
    characters = load_json(args.characters)
    catalog = [
        {
            "name": item.get("name", ""),
            "cnName": item.get("cnName", item.get("name", "")),
            "aliases": item.get("aliases", ""),
            "url": item.get("url", ""),
            "manufacturer": item.get("manufacturer", ""),
            "class": item.get("class", ""),
            "burst": item.get("burst", ""),
            "rarity": item.get("rarity", ""),
        }
        for item in characters
        if item.get("name")
    ]

    source_files = {
        "optionMapping": args.static_analysis / "词条类型映射.json",
        "config": args.config,
        "characterCatalog": args.characters,
    }
    if args.formula_source:
        source_files["formulaSource"] = args.formula_source
    payload = {
        "schemaVersion": 1,
        "generatedAt": "2026-09-26",
        "sourceLevels": {
            "optionMapping": "A",
            "config": "A",
            "characterCatalog": "D",
        },
        "sources": {
            key: {"path": str(path), "sha256": sha256(path)}
            for key, path in source_files.items()
        },
        "config": config,
        "optionGroups": mapping["groups"],
        "characters": catalog,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {len(mapping['groups'])} option groups and {len(catalog)} characters to {args.output}")


if __name__ == "__main__":
    main()
