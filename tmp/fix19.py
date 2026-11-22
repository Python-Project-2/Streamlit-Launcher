p = 'tmp/build_xlsm.py'
s = open(p, encoding='utf-8').read()
# hapus blok compile check
start = s.index("try:\n    print('compile check:'")
end = s.index("    print('compile error:', exc, flush=True)", start) + len("    print('compile error:', exc, flush=True)")
s = s[:start] + s[end:]
# tambah log sekitar SaveAs
s = s.replace("wb.SaveAs(TMP_OUT, FileFormat=52)", "print('saving...', flush=True)\nwb.SaveAs(TMP_OUT, FileFormat=52)\nprint('saved ok', flush=True)")
open(p, 'w', encoding='utf-8').write(s)
print('ok')
