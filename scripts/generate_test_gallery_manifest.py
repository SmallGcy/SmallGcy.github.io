#!/usr/bin/env python3

import argparse
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote


IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a manifest for the FontVerse test-data gallery."
    )
    parser.add_argument(
        "--data-root",
        type=Path,
        required=True,
        help="Path to the public data repository containing test_data and reference assets.",
    )
    parser.add_argument(
        "--input-manifest",
        type=Path,
        default=None,
        help="Optional path to the raw test-data manifest or record list JSON. Defaults to <data-root>/test_data/results/manifest.json.",
    )
    parser.add_argument(
        "--results-dir-relative",
        default=None,
        help="Optional result-image directory relative to the repo root. When set, result files are resolved as <dir>/{id:05d}.png.",
    )
    parser.add_argument(
        "--result-extension",
        default=".png",
        help="File extension used with --results-dir-relative. Default: .png",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/test-manifest.json"),
        help="Where to write the generated manifest JSON.",
    )
    parser.add_argument(
        "--github-owner",
        default="SmallGcy",
        help="GitHub owner used to build CDN URLs.",
    )
    parser.add_argument(
        "--github-repo",
        default="fontverse-gallery-data",
        help="GitHub repository used to build CDN URLs.",
    )
    parser.add_argument(
        "--github-ref",
        default="main",
        help="Git reference used to build CDN URLs.",
    )
    parser.add_argument(
        "--asset-version",
        default="",
        help="Optional cache-busting version appended to CDN URLs.",
    )
    return parser.parse_args()


def build_cdn_url(base_url: str, relative_path: str, asset_version: str = "") -> str:
    url = f"{base_url}/{quote(relative_path, safe='/')}"
    if asset_version:
        return f"{url}?v={quote(asset_version, safe='')}"
    return url


def normalize_relative_path(raw_path: str | None) -> str | None:
    if not raw_path:
        return None
    return Path(raw_path).as_posix()


def resolve_repo_relative_path(data_root: Path, raw_path: str | None) -> str | None:
    relative_path = normalize_relative_path(raw_path)
    if not relative_path:
        return None

    candidates = [relative_path]
    for prefix in ("true_dataset/", "synthetic_datset/", "synthetic_dataset/"):
        if relative_path.startswith(prefix):
            candidates.append(relative_path[len(prefix) :])
            candidates.append(f"test_data/{relative_path[len(prefix):]}")

    seen: set[str] = set()
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        candidate_path = data_root / candidate
        if candidate_path.is_file() and candidate_path.suffix.lower() in IMAGE_SUFFIXES:
            return Path(candidate).as_posix()
    return None


def numeric_stem(path_value: str | None, fallback: int) -> tuple[str, int]:
    if path_value:
        stem = Path(path_value).stem
        if stem.isdigit():
            return stem, int(stem)
    return str(fallback).zfill(5), fallback


def natural_shape_key(name: str) -> tuple[int, str]:
    prefix, _, suffix = name.partition("-")
    if prefix.isdigit():
        return int(prefix), suffix.lower()
    return 10**9, name.lower()


def natural_font_key(name: str) -> tuple[int, str]:
    digits = "".join(character for character in name if character.isdigit())
    if digits:
        return int(digits), name.lower()
    return 10**9, name.lower()


def build_category_payload(
    names_to_counts: dict[str, int],
    names_to_path: dict[str, str | None],
    base_url: str,
    asset_version: str,
) -> list[dict]:
    payload: list[dict] = []
    for name, count in names_to_counts.items():
        relative_path = names_to_path.get(name)
        payload.append(
            {
                "name": name,
                "image_url": (
                    build_cdn_url(base_url, relative_path, asset_version)
                    if relative_path
                    else None
                ),
                "relative_path": relative_path,
                "item_count": count,
            }
        )
    return payload


def main() -> None:
    args = parse_args()
    data_root = args.data_root.resolve()
    input_manifest_path = (
        args.input_manifest.resolve()
        if args.input_manifest is not None
        else (data_root / "test_data" / "results" / "manifest.json").resolve()
    )
    output_path = args.output.resolve()

    if not input_manifest_path.is_file():
        raise FileNotFoundError(f"Missing test-data manifest: {input_manifest_path}")

    base_url = (
        f"https://cdn.jsdelivr.net/gh/{args.github_owner}/{args.github_repo}@{args.github_ref}"
    )

    raw_payload = json.loads(input_manifest_path.read_text(encoding="utf-8"))
    if isinstance(raw_payload, dict):
        records = raw_payload.get("records", [])
    elif isinstance(raw_payload, list):
        records = raw_payload
    else:
        raise TypeError(
            f"Unsupported input JSON type: {type(raw_payload).__name__}. Expected object or list."
        )

    items: list[dict] = []
    style_counts: defaultdict[str, int] = defaultdict(int)
    shape_counts: defaultdict[str, int] = defaultdict(int)
    font_counts: defaultdict[str, int] = defaultdict(int)
    style_paths: dict[str, str | None] = {}
    shape_paths: dict[str, str | None] = {}
    font_paths: dict[str, str | None] = {}

    for index, record in enumerate(records, start=1):
        record_id = record.get("id", index)
        if isinstance(record_id, str) and record_id.isdigit():
            record_id = int(record_id)
        if not isinstance(record_id, int):
            record_id = index

        if args.results_dir_relative:
            image_id = str(record_id).zfill(5)
            numeric_id = int(record_id)
            result_path = Path(args.results_dir_relative, f"{image_id}{args.result_extension}").as_posix()
            if not (data_root / result_path).is_file():
                raise FileNotFoundError(
                    f"Result image is missing from the public data repository: {result_path}"
                )
        else:
            image_id, numeric_id = numeric_stem(record.get("result_image_path"), index)
            result_path = resolve_repo_relative_path(data_root, record.get("result_image_path"))
            if not result_path:
                raise FileNotFoundError(
                    f"Result image is missing from the public data repository: {record.get('result_image_path')}"
                )

        mask_path = resolve_repo_relative_path(data_root, record.get("mask_image_path"))
        shape_path = resolve_repo_relative_path(data_root, record.get("shape_image_path"))
        style_path = resolve_repo_relative_path(data_root, record.get("style_image_path"))
        font_path = resolve_repo_relative_path(data_root, record.get("font_image_path"))
        reference_path = resolve_repo_relative_path(data_root, record.get("reference_image_path"))

        style_class = record.get("style_class")
        shape_class = record.get("shape_class")
        font_class = record.get("font_class")

        if style_class:
            style_counts[style_class] += 1
            if style_class not in style_paths or style_paths[style_class] is None:
                style_paths[style_class] = style_path or reference_path
        if shape_class:
            shape_counts[shape_class] += 1
            if shape_class not in shape_paths or shape_paths[shape_class] is None:
                shape_paths[shape_class] = shape_path or reference_path
        if font_class:
            font_counts[font_class] += 1
            if font_class not in font_paths or font_paths[font_class] is None:
                font_paths[font_class] = font_path or reference_path

        items.append(
            {
                "id": image_id,
                "numeric_id": numeric_id,
                "task_type": record.get("task_type"),
                "text": record.get("text"),
                "style_class": style_class,
                "shape_class": shape_class,
                "font_class": font_class,
                "image_url": build_cdn_url(base_url, result_path, args.asset_version),
                "image_relative_path": result_path,
                "mask_image_url": (
                    build_cdn_url(base_url, mask_path, args.asset_version) if mask_path else None
                ),
                "mask_image_relative_path": mask_path,
                "shape_image_url": (
                    build_cdn_url(base_url, shape_path, args.asset_version) if shape_path else None
                ),
                "shape_image_relative_path": shape_path,
                "style_image_url": (
                    build_cdn_url(base_url, style_path, args.asset_version) if style_path else None
                ),
                "style_image_relative_path": style_path,
                "font_image_url": (
                    build_cdn_url(base_url, font_path, args.asset_version) if font_path else None
                ),
                "font_image_relative_path": font_path,
                "reference_image_url": (
                    build_cdn_url(base_url, reference_path, args.asset_version)
                    if reference_path
                    else None
                ),
                "reference_image_relative_path": reference_path,
            }
        )

    items.sort(key=lambda item: item["numeric_id"])

    styles = sorted(
        build_category_payload(dict(style_counts), style_paths, base_url, args.asset_version),
        key=lambda item: natural_font_key(item["name"]),
    )
    shapes = sorted(
        build_category_payload(dict(shape_counts), shape_paths, base_url, args.asset_version),
        key=lambda item: natural_shape_key(item["name"]),
    )
    fonts = sorted(
        build_category_payload(dict(font_counts), font_paths, base_url, args.asset_version),
        key=lambda item: natural_font_key(item["name"]),
    )

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": {
            "raw_manifest": str(input_manifest_path),
            "github_owner": args.github_owner,
            "github_repo": args.github_repo,
            "github_ref": args.github_ref,
            "cdn_base_url": base_url,
            "results_dir_relative": args.results_dir_relative,
            "asset_version": args.asset_version or None,
        },
        "counts": {
            "items": len(items),
            "styles": len(styles),
            "shapes": len(shapes),
            "fonts": len(fonts),
            "style_items": sum(1 for item in items if item["style_class"]),
            "font_items": sum(1 for item in items if item["font_class"]),
            "style_reference_images": sum(1 for item in styles if item["image_url"]),
            "shape_reference_images": sum(1 for item in shapes if item["image_url"]),
            "font_reference_images": sum(1 for item in fonts if item["image_url"]),
        },
        "styles": styles,
        "shapes": shapes,
        "fonts": fonts,
        "items": items,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
