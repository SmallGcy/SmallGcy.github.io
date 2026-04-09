#!/usr/bin/env python3

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote


IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}


@dataclass(frozen=True)
class ExampleImage:
    name: str
    file_name: str
    image_url: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a manifest for the style_font_lora gallery."
    )
    parser.add_argument(
        "--data-root",
        type=Path,
        required=True,
        help="Path to the public data repository containing font_lora_t2i_batch.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/style_font_lora_manifest.json"),
        help="Where to write the manifest JSON.",
    )
    parser.add_argument(
        "--root-folder",
        default="font_lora_t2i_batch",
        help="Folder inside the public data repo that contains the LoRA batches.",
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
        help="Optional cache-busting version appended to CDN asset URLs.",
    )
    return parser.parse_args()


def build_cdn_url(base_url: str, parts: list[str], asset_version: str = "") -> str:
    encoded = "/".join(quote(part, safe="") for part in parts)
    url = f"{base_url}/{encoded}"
    if asset_version:
        return f"{url}?v={quote(asset_version, safe='')}"
    return url


def list_image_paths(folder: Path) -> list[Path]:
    return sorted(
        (
            path
            for path in folder.iterdir()
            if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
        ),
        key=lambda path: path.name,
    )


def list_image_names(folder: Path) -> set[str]:
    return {path.name for path in list_image_paths(folder)}


def build_alpha_file_name(image_name: str) -> str:
    image_path = Path(image_name)
    return f"{image_path.stem}-1{image_path.suffix}"


def parse_item(
    image_path: Path,
    category_name: str,
    base_url: str,
    root_folder: str,
    alpha_names: set[str],
    asset_version: str,
) -> dict:
    stem = image_path.stem
    suffix = f"-{category_name}"
    if not stem.endswith(suffix):
        raise ValueError(
            f"Unable to match category '{category_name}' from image name {image_path.name}"
        )

    prefix = stem[: -len(suffix)]
    if "-" not in prefix:
        raise ValueError(f"Unable to split id/text for {image_path.name}")

    item_id, text = prefix.split("-", 1)
    if not item_id or not text:
        raise ValueError(f"Invalid id/text content for {image_path.name}")

    alpha_image_name = build_alpha_file_name(image_path.name)

    return {
        "id": item_id,
        "numeric_id": int(item_id),
        "text": text,
        "category": category_name,
        "image_name": image_path.name,
        "image_url": build_cdn_url(
            base_url,
            [root_folder, category_name, image_path.name],
            asset_version,
        ),
        "alpha_image_name": alpha_image_name if alpha_image_name in alpha_names else None,
        "alpha_image_url": (
            build_cdn_url(
                base_url,
                [root_folder, category_name, "pred", alpha_image_name],
                asset_version,
            )
            if alpha_image_name in alpha_names
            else None
        ),
    }


def load_example_images(example_dir: Path, base_url: str, root_folder: str, asset_version: str) -> dict[str, ExampleImage]:
    examples: dict[str, ExampleImage] = {}
    for path in list_image_paths(example_dir):
        examples[path.stem] = ExampleImage(
            name=path.stem,
            file_name=path.name,
            image_url=build_cdn_url(
                base_url,
                [root_folder, example_dir.name, path.name],
                asset_version,
            ),
        )
    return examples


def main() -> None:
    args = parse_args()
    data_root = args.data_root.resolve()
    output_path = args.output.resolve()
    root_dir = (data_root / args.root_folder).resolve()
    example_dir = root_dir / "example_images"

    if not root_dir.is_dir():
        raise FileNotFoundError(f"Missing root directory: {root_dir}")
    if not example_dir.is_dir():
        raise FileNotFoundError(f"Missing example image directory: {example_dir}")

    base_url = (
        f"https://cdn.jsdelivr.net/gh/{args.github_owner}/{args.github_repo}@{args.github_ref}"
    )
    example_images = load_example_images(example_dir, base_url, args.root_folder, args.asset_version)

    category_dirs = sorted(
        path
        for path in root_dir.iterdir()
        if path.is_dir() and path.name != "example_images"
    )

    categories: list[dict] = []
    items: list[dict] = []
    alpha_items = 0
    reference_items = 0

    for category_dir in category_dirs:
        image_paths = list_image_paths(category_dir)
        alpha_dir = category_dir / "pred"
        alpha_names = list_image_names(alpha_dir) if alpha_dir.is_dir() else set()
        example = example_images.get(category_dir.name)

        category_items: list[dict] = []
        category_alpha_count = 0
        for image_path in image_paths:
            item = parse_item(
                image_path=image_path,
                category_name=category_dir.name,
                base_url=base_url,
                root_folder=args.root_folder,
                alpha_names=alpha_names,
                asset_version=args.asset_version,
            )
            category_items.append(item)
            if item["alpha_image_url"]:
                category_alpha_count += 1

        category_items.sort(key=lambda item: item["numeric_id"])
        items.extend(category_items)
        alpha_items += category_alpha_count
        if example:
            reference_items += 1

        categories.append(
            {
                "name": category_dir.name,
                "file_name": example.file_name if example else None,
                "image_url": example.image_url if example else None,
                "item_count": len(category_items),
                "alpha_item_count": category_alpha_count,
            }
        )

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": {
            "github_owner": args.github_owner,
            "github_repo": args.github_repo,
            "github_ref": args.github_ref,
            "cdn_base_url": base_url,
            "root_folder": args.root_folder,
            "asset_version": args.asset_version or None,
        },
        "counts": {
            "items": len(items),
            "categories": len(categories),
            "alpha_items": alpha_items,
            "reference_items": reference_items,
        },
        "categories": categories,
        "items": items,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
