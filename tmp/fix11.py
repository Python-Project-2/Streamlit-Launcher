p = 'tmp/build_xlsm.py'
s = open(p, encoding='utf-8').read()

s = s.replace("""card.Borders.LineStyle = 1
card.Borders.Color = LINE
card.Borders.Weight = 1""", """for idx in (7, 8, 9, 10):
    card.Borders(idx).LineStyle = 1
    card.Borders(idx).Color = LINE
    card.Borders(idx).Weight = 1""")

s = s.replace("""    r.Borders.LineStyle = 1
    r.Borders.Color = LINE
    r.Borders.Weight = 1""", """    for idx in (7, 8, 9, 10):
        r.Borders(idx).LineStyle = 1
        r.Borders(idx).Color = LINE
        r.Borders(idx).Weight = 1""")

s = s.replace("""wb.Worksheets('LOGIN').Activate
wb.SaveAs(OUT, FileFormat=52)""", """# rapikan tautan lama pada Daftar Isi
try:
    toc = wb.Worksheets('Daftar Isi')
    for rr in range(1, 45):
        v = toc.Cells(rr, 2).Value
        if isinstance(v, str) and v.strip().lower() == 'login':
            toc.Cells(rr, 2).Value = 'LOGIN'
            toc.Cells(rr, 3).Value = 'Gerbang login aplikasi (username: admin, password: admin123)'
            toc.Cells(rr, 4).Value = 'Buka >'
            toc.Hyperlinks.Add(toc.Cells(rr, 4), '', "'LOGIN'!A1", '', 'Buka >')
            break
except Exception as exc:
    print('toc skip:', exc)

wb.Worksheets('LOGIN').Activate
wb.SaveAs(OUT, FileFormat=52)""")

open(p, 'w', encoding='utf-8').write(s)
print('ok')
