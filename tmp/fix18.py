p = 'tmp/build_xlsm.py'
s = open(p, encoding='utf-8').read()
s = s.replace("# ── VBA ──", """if os.environ.get('SAVE_EARLY'):
    wb.SaveAs(TMP_OUT, FileFormat=52)
    wb.Close(SaveChanges=False)
    xl.Quit()
    print('early saved', os.path.getsize(TMP_OUT), flush=True)
    raise SystemExit(0)

# ── VBA ──""", 1)
open(p, 'w', encoding='utf-8').write(s)
print('ok')
