#!/usr/bin/env python3
"""Extract only reviewed PDF illustration objects, including their original alpha masks."""
import argparse
import hashlib
import json
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    plan = json.loads(args.plan.read_text())
    manifest = json.loads((ROOT / 'tools/import-manifests' / (plan['editionId'] + '.json')).read_text())
    sources = {s['id']: s for s in manifest['sources']}
    expected = {s['id']: s for s in json.loads((ROOT / 'data/editions' / plan['editionId'] / 'sources.json').read_text())}
    documents = {}
    pdf_assets = [a for a in plan['assets'] if a.get('kind', 'pdf') == 'pdf']
    for sid in {a['source'] for a in pdf_assets}:
        source = ROOT / sources[sid]['path']
        if hashlib.sha256(source.read_bytes()).hexdigest() != expected[sid]['sha256']:
            raise ValueError(f'{sid}: PDF hash differs from the reviewed source')
        documents[sid] = fitz.open(source)
    args.out.mkdir(parents=True, exist_ok=True)
    extracted = []
    for asset in pdf_assets:
        aid = asset['id']
        if not aid.replace('-', '').isalnum():
            raise ValueError(f'Unsafe asset ID: {aid}')
        doc = documents[asset['source']]
        image = next((i for i in doc[asset['page'] - 1].get_images() if i[0] == asset['xref']), None)
        if not image:
            raise ValueError(f'{aid}: image object not found on the reviewed page')
        pix = fitz.Pixmap(doc, image[0])
        if image[1]:
            if pix.alpha:
                pix = fitz.Pixmap(pix, 0)
            pix = fitz.Pixmap(pix, fitz.Pixmap(doc, image[1]))
        if pix.colorspace.n != 3:
            pix = fitz.Pixmap(fitz.csRGB, pix)
        png = pix.tobytes('png')
        (args.out / (aid + '.png')).write_bytes(png)
        extracted.append({**asset, 'originalSha256': hashlib.sha256(png).hexdigest()})
    (args.out / 'extracted.json').write_text(json.dumps(extracted, ensure_ascii=False, indent=2) + '\n')
    print(f'Extracted {len(extracted)} reviewed illustrations with original PDF masks')


if __name__ == '__main__':
    main()
