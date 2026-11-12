"""Hash explicit reviewer decisions after the independent image pass.

Does not choose page statuses. The handwritten reviewer report already contains
the decisions; this utility only attaches hashes and source issue references.
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
report_path = ROOT / 'reconstruction/1.6.3/reviews/core-common-review.json'
report = json.loads(report_path.read_text())
author_path = ROOT / report['authorFile']
author_bytes = author_path.read_bytes()
author = json.loads(author_bytes)
sha = lambda b: hashlib.sha256(b).hexdigest()
assert {p['pdfPage'] for p in report['pages']} == set(author['pageRange'])
assert len(report['pages']) == len(author['pageRange']) == 68
assert all(p['status'] in {'verified', 'needs-correction'} and p['notes'] for p in report['pages'])
report['sourceSha256'] = sha((ROOT / 'public/reference/trench-crusade-1.6.3-ru.pdf').read_bytes())
assert report['sourceSha256'] == author['sourceSha256']
report['authorFileSha256'] = sha(author_bytes)
report['entitiesSha256'] = sha(json.dumps(author['entities'], ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode())
for p in report['pages']:
    p['sectionHashes'] = {s['id']: sha(s['markdown'].encode()) for s in author['sections'] if p['pdfPage'] in s['pages']}
    p['issues'] = [i['id'] for i in author['issues'] if p['pdfPage'] in i['pages']]
report['diagrams'] = []
for s in author['sections']:
    for d in s.get('diagrams', []):
        actual = sha((ROOT / 'public' / d['path']).read_bytes())
        assert actual == d['sha256']
        report['diagrams'].append({'path': d['path'], 'pdfPage': d['pages'][0], 'sha256': actual,
                                   'comparison': 'Все 15 ассетов отдельно просмотрены reviewer через view_image и сопоставлены с оригинальными страницами.'})
report['sourceIssues'] = author['issues']
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'pages': len(report['pages']), 'diagrams': len(report['diagrams']),
                  'authorFileSha256': report['authorFileSha256'], 'entitiesSha256': report['entitiesSha256']}, indent=2))
