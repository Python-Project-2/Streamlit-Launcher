p = 'tmp/build_xlsm.py'
s = open(p, encoding='utf-8').read()
s = s.replace("print('step: open', flush=True)", "print('step: open', flush=True)\nwb.SaveAs(TMP_OUT, FileFormat=52)\nprint('step: converted', flush=True)", 1)
s = s.replace("print('saving...', flush=True)\nwb.SaveAs(TMP_OUT, FileFormat=52)\nprint('saved ok', flush=True)",
              "print('saving...', flush=True)\nwb.Save()\nprint('saved ok', flush=True)")
# hapus blok SAVE_EARLY agar tidak dobel
if "if os.environ.get('SAVE_EARLY'):" in s:
    a = s.index("if os.environ.get('SAVE_EARLY'):")
    b = s.index('# ── VBA ──', a)
    s = s[:a] + s[b:]
open(p, 'w', encoding='utf-8').write(s)
print('ok')
