p = 'tmp/build_xlsm.py'
s = open(p, encoding='utf-8').read()
s = s.replace("tl = _get(a, 'TickLabels')", 'tl = a.TickLabels')
open(p, 'w', encoding='utf-8').write(s)
print('ok', '_get' in s)
