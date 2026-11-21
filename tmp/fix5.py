p = 'tmp/build_xlsm.py'
s = open(p, encoding='utf-8').read()

# 1) tulis ulang rumus KPI setelah DASH_DATA dibuat
s = s.replace("""dd.Range('A1:C1').Font.Bold = True
dd.Range('A10:C10').Font.Bold = True
dd.Columns('A:C').ColumnWidth = 22""", """dd.Range('A1:C1').Font.Bold = True
dd.Range('A10:C10').Font.Bold = True
dd.Columns('A:C').ColumnWidth = 22

# kartu KPI merujuk DASH_DATA yang baru dibuat
for cell, formula, fmt in (
    ('C7', '=DASH_DATA!F1', '\"Rp\" #,##0'),
    ('G7', '=DASH_DATA!F2', '#,##0'),
    ('K7', '=DASH_DATA!F3', '\"Rp\" #,##0'),
    ('O7', '=DASH_DATA!F4', '#,##0'),
):
    dash.Range(cell).Formula = formula
    dash.Range(cell).NumberFormat = fmt""")

# 2) pengaturan cetak agar seluruh papan terlihat
s = s.replace("""# Simpan dalam keadaan terkunci""", """# pengaturan cetak
dash.PageSetup.Orientation = 2
dash.PageSetup.Zoom = False
dash.PageSetup.FitToPagesWide = 1
dash.PageSetup.FitToPagesTall = 1
dash.PageSetup.PrintArea = 'A1:R40'
login.PageSetup.Orientation = 1
login.PageSetup.Zoom = False
login.PageSetup.FitToPagesWide = 1
login.PageSetup.FitToPagesTall = 1
login.PageSetup.PrintArea = 'A1:N32'

# Simpan dalam keadaan terkunci""")

open(p, 'w', encoding='utf-8').write(s)
print('patched')
