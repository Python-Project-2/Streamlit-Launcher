p = 'tmp/build_xlsm.py'
s = open(p, encoding='utf-8').read()
s = s.replace("    acc.Fill.Solid()\nacc.Fill.ForeColor.RGB = ACCENT", "    acc.Fill.Solid()\n    acc.Fill.ForeColor.RGB = ACCENT")
open(p, 'w', encoding='utf-8').write(s)
print('fixed')
