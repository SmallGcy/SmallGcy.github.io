# SmallGcy.github.io

Static gallery site for the public FontVerse dataset.

## Data flow

- Site repo: `SmallGcy.github.io`
- Public asset repo: `fontverse-gallery-data`
- Manifest path: `data/manifest.json`

The page reads `data/manifest.json` and uses jsDelivr CDN URLs that point to the
public images in `fontverse-gallery-data`.

## Regenerate the manifest

Run this from the site repository root:

```bash
python3 scripts/generate_gallery_manifest.py \
  --data-root /data1/ye_project/changyi_font/Git/fontverse-gallery-data \
  --output data/manifest.json
```

## Deploy

Inside the `SmallGcy.github.io` clone:

```bash
git add index.html app.js styles.css data/manifest.json scripts/generate_gallery_manifest.py README.md
git commit -m "Build FontVerse gallery site"
git push origin main
```
