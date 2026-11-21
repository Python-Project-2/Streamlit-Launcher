p = 'tmp/build_xlsm.py'
s = open(p, encoding='utf-8').read()

# format angka lokal
s = s.replace('"Rp" #,##0', '"Rp" #.##0')
s = s.replace("'#,##0'", "'#.##0'")
s = s.replace('"0.0%"', "'0,0%'")
s = s.replace("NumberFormat = '0.0%'", "NumberFormatLocal = '0,0%'")
s = s.replace("NumberFormat = '#.##0'", "NumberFormatLocal = '#.##0'")
s = s.replace("NumberFormat = '\"Rp\" #.##0'", "NumberFormatLocal = '\"Rp\" #.##0'")
s = s.replace("NumberFormat = '0.00'", "NumberFormatLocal = '#.##0,00'")

# tombol keluar di tepi kanan
s = s.replace("out = dash.Shapes.AddShape(5, dash.Range('P4:R4').Left + 40, dash.Range('P4').Top, 92, 22)",
              "right_edge = dash.Range('R4').Left + dash.Range('R4').Width\nout = dash.Shapes.AddShape(5, right_edge - 104, dash.Range('R4').Top, 96, 22)")

# solid fill untuk semua shape
for name in ('btn', 'out', 'shp', 'acc'):
    s = s.replace(f"{name}.Fill.ForeColor.RGB", f"{name}.Fill.Solid()\n{name}.Fill.ForeColor.RGB")

# chart lebih besar
s = s.replace("'C13:G25'", "'C13:G30'").replace("'H13:L25'", "'H13:L30'").replace("'M13:Q25'", "'M13:Q30'")

# hapus tabel ringkas
start = s.index('# tabel ringkas')
end = s.index('# navigasi')
s = s[:start] + s[end:]

# navigasi lebih atas
s = s.replace("dash.Range('C36').Left", "dash.Range('C32').Left")
s = s.replace("dash.Range('C36').Top", "dash.Range('C32').Top")
s = s.replace("dash.Rows(36).RowHeight = 34", "dash.Rows(32).RowHeight = 34")
s = s.replace("dash.Range('C38')", "dash.Range('C34')")
s = s.replace("dash.PageSetup.PrintArea = 'A1:R40'", "dash.PageSetup.PrintArea = 'A1:R35'")

# label data chart memakai format lokal
s = s.replace("dl.NumberFormat = '#.##0'", "dl.NumberFormatLinked = False\ndl.NumberFormatLocal = '#.##0'")

open(p, 'w', encoding='utf-8').write(s)
print('patched, table removed:', '# tabel ringkas' not in s)
