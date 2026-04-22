#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from collections import OrderedDict, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote


IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate the refreshed manifest for the FontVerse complex-style gallery."
    )
    parser.add_argument(
        "--metadata-json",
        type=Path,
        required=True,
        help="Path to test_image_complex_style_data.json or a manifest.json containing records.",
    )
    parser.add_argument(
        "--style-images-dir",
        type=Path,
        required=True,
        help="Local directory containing the complex-style reference images.",
    )
    parser.add_argument(
        "--style-images-cdn-folder",
        required=True,
        help="Repo-relative CDN folder used for style reference images.",
    )
    parser.add_argument(
        "--rgba-dir",
        type=Path,
        required=True,
        help="Local directory containing the RGBA result PNGs.",
    )
    parser.add_argument(
        "--rgba-cdn-folder",
        required=True,
        help="Repo-relative CDN folder used for RGBA result PNGs.",
    )
    parser.add_argument(
        "--background-dir",
        type=Path,
        default=None,
        help="Optional local directory containing background render PNGs.",
    )
    parser.add_argument(
        "--background-cdn-folder",
        default=None,
        help="Optional repo-relative CDN folder used for background render PNGs.",
    )
    parser.add_argument(
        "--shape-images-dir",
        type=Path,
        default=None,
        help="Optional local directory containing shape reference images.",
    )
    parser.add_argument(
        "--shape-images-cdn-folder",
        default=None,
        help="Optional repo-relative CDN folder used for shape reference images.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="Output manifest path.",
    )
    parser.add_argument("--github-owner", default="SmallGcy")
    parser.add_argument("--github-repo", default="fontverse-gallery-data")
    parser.add_argument("--github-ref", default="main")
    parser.add_argument("--asset-version", default="")
    return parser.parse_args()


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def load_records(path: Path) -> list[dict]:
    payload = load_json(path)
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        records = payload.get("records")
        if isinstance(records, list):
            return records
    raise TypeError(
        f"Unsupported metadata payload at {path}. Expected a list or an object with 'records'."
    )


def build_cdn_url(base_url: str, relative_path: str, asset_version: str = "") -> str:
    url = f"{base_url}/{quote(relative_path, safe='/')}"
    if asset_version:
        return f"{url}?v={quote(asset_version, safe='')}"
    return url


def list_image_files(folder: Path) -> dict[str, Path]:
    return {
        path.name: path
        for path in sorted(folder.iterdir())
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
    }


def build_lower_name_index(files_by_name: dict[str, Path]) -> dict[str, str]:
    return {name.lower(): name for name in files_by_name}


def normalize_key(value: str | None) -> str:
    return (value or "").strip().lower()


def resolve_style_file_name(
    record: dict,
    style_files: dict[str, Path],
    style_lower_index: dict[str, str],
) -> str | None:
    candidates: list[str] = []
    raw_style_path = record.get("style_image_path")
    if raw_style_path:
        candidates.append(Path(str(raw_style_path)).name)

    style_class = str(record.get("style_class", "")).strip()
    if style_class:
        for suffix in IMAGE_SUFFIXES:
            candidates.append(f"{style_class}{suffix}")

    for candidate in candidates:
        if candidate in style_files:
            return candidate
        lowered = candidate.lower()
        if lowered in style_lower_index:
            return style_lower_index[lowered]

    if style_class and normalize_key(style_class) in style_lower_index:
        return style_lower_index[normalize_key(style_class)]
    return None


def resolve_shape_file_name(
    record: dict,
    shape_files: dict[str, Path],
    shape_lower_index: dict[str, str],
) -> str | None:
    raw_shape_path = record.get("shape_image_path")
    if raw_shape_path:
        file_name = Path(str(raw_shape_path)).name
        if file_name in shape_files:
            return file_name
        lowered = file_name.lower()
        if lowered in shape_lower_index:
            return shape_lower_index[lowered]
    return None


def main() -> None:
    args = parse_args()
    metadata_json = args.metadata_json.resolve()
    style_images_dir = args.style_images_dir.resolve()
    rgba_dir = args.rgba_dir.resolve()
    background_dir = args.background_dir.resolve() if args.background_dir is not None else None
    shape_images_dir = args.shape_images_dir.resolve() if args.shape_images_dir is not None else None
    output_path = args.output.resolve()

    if not style_images_dir.is_dir():
        raise FileNotFoundError(f"Missing style-images-dir: {style_images_dir}")
    if not rgba_dir.is_dir():
        raise FileNotFoundError(f"Missing rgba-dir: {rgba_dir}")
    if background_dir is not None and not background_dir.is_dir():
        raise FileNotFoundError(f"Missing background-dir: {background_dir}")
    if shape_images_dir is not None and not shape_images_dir.is_dir():
        raise FileNotFoundError(f"Missing shape-images-dir: {shape_images_dir}")

    base_url = (
        f"https://cdn.jsdelivr.net/gh/{args.github_owner}/{args.github_repo}@{args.github_ref}"
    )

    records = load_records(metadata_json)
    style_files = list_image_files(style_images_dir)
    style_lower_index = build_lower_name_index(style_files)
    rgba_files = list_image_files(rgba_dir)
    background_files = list_image_files(background_dir) if background_dir is not None else {}
    shape_files = list_image_files(shape_images_dir) if shape_images_dir is not None else {}
    shape_lower_index = build_lower_name_index(shape_files)

    items: list[dict] = []
    style_counts: defaultdict[str, int] = defaultdict(int)
    shape_counts: defaultdict[str, int] = defaultdict(int)
    style_reference_info: OrderedDict[str, dict] = OrderedDict()
    shape_reference_info: OrderedDict[str, dict] = OrderedDict()

    for index, record in enumerate(records, start=1):
        if not isinstance(record, dict):
            raise TypeError(f"Record #{index} must be an object")

        record_id = record.get("id", index)
        if isinstance(record_id, str) and record_id.isdigit():
            record_id = int(record_id)
        if not isinstance(record_id, int):
            raise TypeError(f"Record #{index} has invalid id: {record_id!r}")

        item_id = str(record_id).zfill(5)
        rgba_name = Path(str(record.get("result_image_path", f"{item_id}.png"))).name
        if rgba_name not in rgba_files:
            fallback_name = f"{item_id}.png"
            if fallback_name not in rgba_files:
                raise FileNotFoundError(
                    f"Missing RGBA image for id={record_id}. Checked {rgba_name} and {fallback_name} in {rgba_dir}"
                )
            rgba_name = fallback_name

        background_name = None
        if background_files:
            candidate_name = rgba_name
            if candidate_name in background_files:
                background_name = candidate_name

        style_class = str(record.get("style_class", "")).strip()
        shape_class = str(record.get("shape_class", "")).strip()
        text = str(record.get("text", "")).strip()

        style_file_name = resolve_style_file_name(record, style_files, style_lower_index)
        shape_file_name = resolve_shape_file_name(record, shape_files, shape_lower_index)

        style_counts[style_class] += 1
        shape_counts[shape_class] += 1

        if style_class and style_class not in style_reference_info:
            style_relative_path = (
                f"{args.style_images_cdn_folder.rstrip('/')}/{style_file_name}"
                if style_file_name is not None
                else None
            )
            style_reference_info[style_class] = {
                "name": style_class,
                "file_name": style_file_name,
                "image_url": (
                    build_cdn_url(base_url, style_relative_path, args.asset_version)
                    if style_relative_path
                    else None
                ),
                "item_count": 0,
            }

        if shape_class and shape_class not in shape_reference_info:
            shape_relative_path = (
                f"{args.shape_images_cdn_folder.rstrip('/')}/{shape_file_name}"
                if shape_file_name is not None and args.shape_images_cdn_folder
                else None
            )
            shape_reference_info[shape_class] = {
                "name": shape_class,
                "file_name": shape_file_name,
                "image_url": (
                    build_cdn_url(base_url, shape_relative_path, args.asset_version)
                    if shape_relative_path
                    else None
                ),
                "item_count": 0,
            }

        alpha_relative_path = f"{args.rgba_cdn_folder.rstrip('/')}/{rgba_name}"
        background_relative_path = (
            f"{args.background_cdn_folder.rstrip('/')}/{background_name}"
            if background_name is not None and args.background_cdn_folder
            else None
        )

        items.append(
            {
                "id": item_id,
                "numeric_id": record_id,
                "task_type": record.get("task_type"),
                "text": text,
                "style_class": style_class,
                "shape_class": shape_class,
                "image_name": background_name,
                "image_url": (
                    build_cdn_url(base_url, background_relative_path, args.asset_version)
                    if background_relative_path
                    else None
                ),
                "alpha_image_name": rgba_name,
                "alpha_image_url": build_cdn_url(base_url, alpha_relative_path, args.asset_version),
                "style_image_url": style_reference_info.get(style_class, {}).get("image_url"),
                "shape_image_url": shape_reference_info.get(shape_class, {}).get("image_url"),
            }
        )

    items.sort(key=lambda item: item["numeric_id"])

    for style_name, payload in style_reference_info.items():
        payload["item_count"] = style_counts.get(style_name, 0)
    for shape_name, payload in shape_reference_info.items():
        payload["item_count"] = shape_counts.get(shape_name, 0)

    styles = [payload for payload in style_reference_info.values() if payload["item_count"] > 0]
    shapes = [payload for payload in shape_reference_info.values() if payload["item_count"] > 0]

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": {
            "metadata_json": str(metadata_json),
            "github_owner": args.github_owner,
            "github_repo": args.github_repo,
            "github_ref": args.github_ref,
            "cdn_base_url": base_url,
            "style_images_folder": args.style_images_cdn_folder,
            "rgba_folder": args.rgba_cdn_folder,
            "background_folder": args.background_cdn_folder,
            "asset_version": args.asset_version or None,
        },
        "counts": {
            "items": len(items),
            "styles": len(styles),
            "shapes": len(shapes),
            "alpha_items": sum(1 for item in items if item["alpha_image_url"]),
            "background_items": sum(1 for item in items if item["image_url"]),
        },
        "styles": styles,
        "shapes": shapes,
        "items": items,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
