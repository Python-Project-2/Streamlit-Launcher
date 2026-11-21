p = 'tmp/build_xlsm.py'
s = open(p, encoding='utf-8').read()
s = s.replace("""wb.Worksheets('LOGIN').Activate
wb.SaveAs(OUT, FileFormat=52)""", """# Simpan dalam keadaan terkunci: tanpa makro pun hanya halaman login yang terlihat.
login.Activate()
for ws in wb.Worksheets:
    if ws.Name not in ('LOGIN', 'AKUN'):
        ws.Visible = 2
wb.Worksheets('LOGIN').Visible = -1
xl.ActiveWindow.DisplayWorkbookTabs = False
wb.SaveAs(OUT, FileFormat=52)""")
open(p, 'w', encoding='utf-8').write(s)
print('ok')
