#!/usr/bin/env python3

import argparse
import json
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote


IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}


@dataclass(frozen=True)
class ReferenceImage:
    name: str
    file_name: str
    image_url: str | None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a dedicated manifest for the FontVerse complex-style gallery."
    )
    parser.add_argument(
        "--data-root",
        type=Path,
        required=True,
        help="Path to the public data repository containing style_images and shape_images.",
    )
    parser.add_argument(
        "--images-dir",
        type=Path,
        required=True,
        help="Local directory containing complex-style rendered images.",
    )
    parser.add_argument(
        "--alpha-dir",
        type=Path,
        required=True,
        help="Local directory containing transparent complex-style PNGs.",
    )
    parser.add_argument(
        "--prompt-json",
        type=Path,
        required=True,
        help="Prompt JSON used to determine style classes and ordering.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/complex-style-manifest.json"),
        help="Where to write the manifest JSON.",
    )
    parser.add_argument(
        "--cdn-images-folder",
        default="complex_style_images",
        help="Folder name used in CDN URLs for rendered images.",
    )
    parser.add_argument(
        "--cdn-alpha-folder",
        default="complex_style_alpha_images",
        help="Folder name used in CDN URLs for transparent PNGs.",
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
        help="Optional cache-busting version appended to CDN asset URLs, e.g. 20260409-smoke-refresh.",
    )
    return parser.parse_args()


def load_json(path: Path):
    with open(path, "r", encoding="utf-8") as file:
        return json.load(file)


def build_cdn_url(base_url: str, folder: str, file_name: str, asset_version: str = "") -> str:
    url = f"{base_url}/{folder}/{quote(file_name, safe='')}"
    if asset_version:
        return f"{url}?v={quote(asset_version, safe='')}"
    return url


def build_alpha_file_name(image_name: str) -> str:
    image_path = Path(image_name)
    return f"{image_path.stem}-1{image_path.suffix}"


def load_style_classes(path: Path) -> list[str]:
    payload = load_json(path)
    if not isinstance(payload, list):
        raise TypeError(f"Prompt JSON must be a list, got {type(payload).__name__}")

    style_classes: list[str] = []
    for index, item in enumerate(payload, start=1):
        if not isinstance(item, dict):
            raise TypeError(f"Prompt record #{index} must be an object")
        style_class = str(item.get("style_class", "")).strip()
        if not style_class:
            raise ValueError(f"Prompt record #{index} has empty style_class")
        style_classes.append(style_class)
    return style_classes


def load_reference_images(
    folder: Path, base_url: str, asset_version: str = ""
) -> dict[str, ReferenceImage]:
    references: dict[str, ReferenceImage] = {}
    for path in sorted(folder.iterdir()):
        if not path.is_file():
            continue
        if path.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        references[path.stem] = ReferenceImage(
            name=path.stem,
            file_name=path.name,
            image_url=build_cdn_url(base_url, folder.name, path.name, asset_version),
        )
    return references


def parse_target_image(
    image_path: Path,
    style_names: list[str],
    shape_names: list[str],
    base_url: str,
    images_folder: str,
    alpha_folder: str,
    alpha_names: set[str],
    asset_version: str,
) -> dict:
    stem = image_path.stem

    matched_shape = None
    for shape_name in shape_names:
        suffix = f"-{shape_name}"
        if stem.endswith(suffix):
            matched_shape = shape_name
            stem = stem[: -len(suffix)]
            break

    if matched_shape is None:
        raise ValueError(f"Unable to match shape class for {image_path.name}")

    matched_style = None
    for style_name in style_names:
        suffix = f"-{style_name}"
        if stem.endswith(suffix):
            matched_style = style_name
            stem = stem[: -len(suffix)]
            break

    if matched_style is None:
        raise ValueError(f"Unable to match style class for {image_path.name}")

    if "-" not in stem:
        raise ValueError(f"Unable to split id/text for {image_path.name}")

    item_id, text = stem.split("-", 1)
    if not item_id or not text:
        raise ValueError(f"Invalid id/text content for {image_path.name}")

    alpha_image_name = build_alpha_file_name(image_path.name)

    return {
        "id": item_id,
        "text": text,
        "style_class": matched_style,
        "shape_class": matched_shape,
        "image_name": image_path.name,
        "image_url": build_cdn_url(base_url, images_folder, image_path.name, asset_version),
        "alpha_image_name": alpha_image_name if alpha_image_name in alpha_names else None,
        "alpha_image_url": (
            build_cdn_url(base_url, alpha_folder, alpha_image_name, asset_version)
            if alpha_image_name in alpha_names
            else None
        ),
    }


def natural_shape_key(name: str) -> tuple[int, str]:
    prefix, _, suffix = name.partition("-")
    if prefix.isdigit():
        return int(prefix), suffix.lower()
    return 10**9, name.lower()


def main() -> None:
    args = parse_args()
    data_root = args.data_root.resolve()
    images_dir = args.images_dir.resolve()
    alpha_dir = args.alpha_dir.resolve()
    prompt_json = args.prompt_json.resolve()
    output_path = args.output.resolve()

    style_dir = data_root / "style_images"
    shape_dir = data_root / "shape_images"
    for required_dir in (style_dir, shape_dir, images_dir, alpha_dir):
        if not required_dir.is_dir():
            raise FileNotFoundError(f"Missing required directory: {required_dir}")

    base_url = (
        f"https://cdn.jsdelivr.net/gh/{args.github_owner}/{args.github_repo}@{args.github_ref}"
    )

    prompt_style_names = load_style_classes(prompt_json)
    style_name_order = {name: index for index, name in enumerate(prompt_style_names)}
    style_names = sorted(prompt_style_names, key=len, reverse=True)

    style_refs = load_reference_images(style_dir, base_url, args.asset_version)
    shape_refs = load_reference_images(shape_dir, base_url, args.asset_version)
    alpha_names = {
        path.name
        for path in alpha_dir.iterdir()
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
    }

    shape_names = sorted(shape_refs.keys(), key=len, reverse=True)

    items: list[dict] = []
    style_counts: defaultdict[str, int] = defaultdict(int)
    shape_counts: defaultdict[str, int] = defaultdict(int)

    image_paths = sorted(
        (
            path
            for path in images_dir.iterdir()
            if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
        ),
        key=lambda path: path.name,
    )

    for image_path in image_paths:
        item = parse_target_image(
            image_path=image_path,
            style_names=style_names,
            shape_names=shape_names,
            base_url=base_url,
            images_folder=args.cdn_images_folder,
            alpha_folder=args.cdn_alpha_folder,
            alpha_names=alpha_names,
            asset_version=args.asset_version,
        )
        style_counts[item["style_class"]] += 1
        shape_counts[item["shape_class"]] += 1
        items.append(item)

    items.sort(key=lambda item: int(item["id"]))

    styles = []
    for style_name in prompt_style_names:
        ref = style_refs.get(style_name)
        styles.append(
            {
                "name": style_name,
                "file_name": ref.file_name if ref else None,
                "image_url": ref.image_url if ref else None,
                "item_count": style_counts.get(style_name, 0),
            }
        )

    shapes = [
        {
            "name": ref.name,
            "file_name": ref.file_name,
            "image_url": ref.image_url,
            "item_count": shape_counts.get(ref.name, 0),
        }
        for ref in sorted(shape_refs.values(), key=lambda ref: natural_shape_key(ref.name))
        if shape_counts.get(ref.name, 0) > 0
    ]

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": {
            "github_owner": args.github_owner,
            "github_repo": args.github_repo,
            "github_ref": args.github_ref,
            "cdn_base_url": base_url,
            "images_folder": args.cdn_images_folder,
            "alpha_folder": args.cdn_alpha_folder,
            "asset_version": args.asset_version or None,
        },
        "counts": {
            "items": len(items),
            "styles": sum(1 for item in styles if item["item_count"] > 0),
            "shapes": len(shapes),
            "alpha_items": sum(1 for item in items if item["alpha_image_url"]),
        },
        "styles": styles,
        "shapes": shapes,
        "items": items,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
