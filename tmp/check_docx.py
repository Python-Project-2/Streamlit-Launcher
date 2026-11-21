import re
import sys
import zipfile

path = sys.argv[1]
z = zipfile.ZipFile(path)
names = z.namelist()
doc = z.read('word/document.xml').decode('utf8')
rels = z.read('word/_rels/document.xml.rels').decode('utf8')
print('parts', len(names))
print('hyperlink tags', doc.count('<w:hyperlink'))
print('external rels', len(re.findall('TargetMode="External"', rels)))
print('poin utama box', 'Poin Utama Penelitian' in doc)
print('ref note 2022-2026', '2022' in rels or 'terbit pada 2022' in doc)
print('sections', doc.count('<w:sectPr'))
print('hyperlink sample', re.findall(r'Target="([^"]+)"', rels)[:3])
