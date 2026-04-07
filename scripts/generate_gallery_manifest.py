#!/usr/bin/env python3

import argparse
import json
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote


@dataclass(frozen=True)
class ReferenceImage:
    name: str
    file_name: str
    image_url: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a manifest for the FontVerse public gallery."
    )
    parser.add_argument(
        "--data-root",
        type=Path,
        required=True,
        help="Path to the public data repository containing images/style_images/shape_images.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/manifest.json"),
        help="Where to write the manifest JSON.",
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
    return parser.parse_args()


def build_cdn_url(base_url: str, folder: str, file_name: str) -> str:
    return f"{base_url}/{folder}/{quote(file_name, safe='')}"


def build_alpha_file_name(image_name: str) -> str:
    image_path = Path(image_name)
    return f"{image_path.stem}-1{image_path.suffix}"


def load_reference_images(folder: Path, base_url: str) -> list[ReferenceImage]:
    references: list[ReferenceImage] = []
    for path in sorted(folder.iterdir()):
        if not path.is_file():
            continue
        if path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
            continue
        references.append(
            ReferenceImage(
                name=path.stem,
                file_name=path.name,
                image_url=build_cdn_url(base_url, folder.name, path.name),
            )
        )
    return references


def parse_target_image(
    image_path: Path,
    style_names: list[str],
    shape_names: list[str],
    base_url: str,
    alpha_names: set[str],
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
        "image_url": build_cdn_url(base_url, "images", image_path.name),
        "alpha_image_name": alpha_image_name if alpha_image_name in alpha_names else None,
        "alpha_image_url": (
            build_cdn_url(base_url, "alpha_images", alpha_image_name)
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
    output_path = args.output.resolve()

    images_dir = data_root / "images"
    style_dir = data_root / "style_images"
    shape_dir = data_root / "shape_images"
    alpha_dir = data_root / "alpha_images"

    for required_dir in (images_dir, style_dir, shape_dir, alpha_dir):
        if not required_dir.is_dir():
            raise FileNotFoundError(f"Missing required directory: {required_dir}")

    base_url = (
        f"https://cdn.jsdelivr.net/gh/{args.github_owner}/{args.github_repo}@{args.github_ref}"
    )

    style_refs = load_reference_images(style_dir, base_url)
    shape_refs = load_reference_images(shape_dir, base_url)
    alpha_names = {
        path.name
        for path in alpha_dir.iterdir()
        if path.is_file() and path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}
    }

    style_names = sorted((ref.name for ref in style_refs), key=len, reverse=True)
    shape_names = sorted((ref.name for ref in shape_refs), key=len, reverse=True)

    items: list[dict] = []
    style_counts: defaultdict[str, int] = defaultdict(int)
    shape_counts: defaultdict[str, int] = defaultdict(int)

    image_paths = sorted(
        (
            path
            for path in images_dir.iterdir()
            if path.is_file() and path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}
        ),
        key=lambda path: path.name,
    )

    for image_path in image_paths:
        item = parse_target_image(image_path, style_names, shape_names, base_url, alpha_names)
        style_counts[item["style_class"]] += 1
        shape_counts[item["shape_class"]] += 1
        items.append(item)

    items.sort(key=lambda item: int(item["id"]))

    styles = [
        {
            "name": ref.name,
            "file_name": ref.file_name,
            "image_url": ref.image_url,
            "item_count": style_counts.get(ref.name, 0),
        }
        for ref in sorted(style_refs, key=lambda ref: ref.name.lower())
    ]
    shapes = [
        {
            "name": ref.name,
            "file_name": ref.file_name,
            "image_url": ref.image_url,
            "item_count": shape_counts.get(ref.name, 0),
        }
        for ref in sorted(shape_refs, key=lambda ref: natural_shape_key(ref.name))
    ]

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": {
            "github_owner": args.github_owner,
            "github_repo": args.github_repo,
            "github_ref": args.github_ref,
            "cdn_base_url": base_url,
        },
        "counts": {
            "items": len(items),
            "styles": len(styles),
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
