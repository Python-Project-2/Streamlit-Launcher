import sys

import pymupdf

src, out = sys.argv[1], sys.argv[2]
pages = [int(x) for x in (sys.argv[3] if len(sys.argv) > 3 else '1').split(',')]
doc = pymupdf.open(src)
for p in pages:
    page = doc[p - 1] if p > 0 else doc[-1]
    pix = page.get_pixmap(matrix=pymupdf.Matrix(2, 2))
    target = f"{out}-p{p}.png"
    pix.save(target)
    print('saved', target, pix.width, 'x', pix.height)
