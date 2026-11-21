import re
import sys
from collections import Counter

from docx import Document

doc = Document(sys.argv[1])
paras = [p.text for p in doc.paragraphs]
text = '\n'.join(paras)
print('paragraphs', len(paras), 'chars', len(text))

# deteksi label sitasi yang berulang dalam satu paragraf
bad = []
for p in paras:
    groups = re.findall(r'\(([^()]*\d{4}[^()]*)\)', p)
    for g in groups:
        labels = [x.strip() for x in g.split(';') if x.strip()]
        dup = [k for k, v in Counter(labels).items() if v > 1]
        if dup:
            bad.append((dup, p[:120]))
print('duplicate citation labels in one group:', len(bad))
for b in bad[:10]:
    print('  ', b)

# daftar pustaka
i = next((n for n, p in enumerate(paras) if p.strip().upper() == 'DAFTAR PUSTAKA'), None)
print('ref heading index', i)
refs = [p for p in paras[i + 1:] if re.search(r'\((19|20)\d\d\)|\(n\.d\.\)', p)] if i is not None else []
years = Counter(re.findall(r'\((\d{4})\)', '\n'.join(refs)))
print('years in references:', dict(sorted(years.items())))
outside = [y for y in years if not (2022 <= int(y) <= 2026) and y != '2026']
print('refs with year outside 2022-2026:', outside)
print('sample ref:', refs[0][:160] if refs else '-')
