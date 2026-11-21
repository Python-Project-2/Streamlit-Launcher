p = 'tmp/build_xlsm.py'
s = open(p, encoding='utf-8').read()
s = s.replace("\nshp.Fill.ForeColor.RGB = PANEL2", "\n    shp.Fill.ForeColor.RGB = PANEL2")
open(p, 'w', encoding='utf-8').write(s)
print('ok')
