p = 'tmp/build_xlsm.py'
lines = open(p, encoding='utf-8').read().split('\n')
idx = max(i for i, l in enumerate(lines) if l.strip().startswith('wb.SaveAs(TMP_OUT'))
lines.insert(idx, "print('saving...', flush=True)")
lines.insert(idx + 2, "print('saved ok', flush=True)")
open(p, 'w', encoding='utf-8').write('\n'.join(lines))
print('inserted around line', idx)
