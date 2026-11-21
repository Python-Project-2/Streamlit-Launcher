p = 'tmp/build_xlsm.py'
s = open(p, encoding='utf-8').read()

start = s.index("card = login.Range('D7:J25')")
end = s.index("# ── halaman DASHBOARD ──")

new = '''for i in range(1, 15):
    login.Columns(i).ColumnWidth = 8.5
for r in range(1, 34):
    login.Rows(r).RowHeight = 20

card = login.Range('D6:K27')
card.Interior.Color = PANEL
card.Borders.LineStyle = 1
card.Borders.Color = LINE
card.Borders.Weight = 1
dash_top = login.Shapes.AddShape(1, card.Left, card.Top, card.Width, 3)
dash_top.Fill.Solid()
dash_top.Fill.ForeColor.RGB = ACCENT
dash_top.Line.Visible = 0

logo = login.Shapes.AddPicture(LOGO, 0, -1, card.Left + (card.Width - 48) / 2, card.Top + 12, 48, 48)
logo.Name = 'logoLogin'

login.Range('D9:K9').Merge()
t = login.Range('D9')
t.Value = 'DATE SKUNDER'
t.Font.Size = 17
t.Font.Bold = True
t.Font.Color = WHITE
t.HorizontalAlignment = -4108
t.VerticalAlignment = -4108

login.Range('D10:K10').Merge()
t = login.Range('D10')
t.Value = 'Aplikasi Analisis Data & Laporan Otomatis'
t.Font.Size = 9
t.Font.Color = MUTED
t.HorizontalAlignment = -4108
t.VerticalAlignment = -4108

login.Range('D12:K12').Merge()
t = login.Range('D12')
t.Value = 'Masuk untuk membuka dashboard'
t.Font.Size = 11
t.Font.Color = TEXT
t.HorizontalAlignment = -4108
t.VerticalAlignment = -4108

btn = login.Shapes.AddShape(5, login.Range('D14').Left + 24, login.Range('D14').Top, card.Width - 48, 46)
btn.Name = 'btnMasuk'
btn.Fill.Solid()
btn.Fill.ForeColor.RGB = ACCENT
btn.Fill.Transparency = 0
btn.Line.Visible = 0
btn.TextFrame2.TextRange.Text = 'MASUK'
btn.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = rgb(9, 20, 16)
btn.TextFrame2.TextRange.Font.Size = 12
btn.TextFrame2.TextRange.Font.Bold = True
btn.TextFrame2.TextRange.Font.Name = 'Segoe UI'
btn.TextFrame2.VerticalAnchor = 3
btn.TextFrame2.HorizontalAnchor = 2
btn.OnAction = 'OpenLogin'

login.Range('D17:K18').Merge()
t = login.Range('D17')
t.Value = 'Seluruh lembar kerja disembunyikan sampai Anda masuk.'
t.Font.Size = 8.5
t.Font.Color = MUTED
t.HorizontalAlignment = -4108
t.VerticalAlignment = -4108
t.WrapText = True

login.Range('D21:K21').Merge()
t = login.Range('D21')
t.Value = 'Akun default  ·  admin / admin123'
t.Font.Size = 8.5
t.Font.Color = MUTED
t.HorizontalAlignment = -4108

login.Range('D25:K25').Merge()
t = login.Range('D25')
t.Value = '© 2026 Date Skunder  ·  Data: SuperMarket Analysis'
t.Font.Size = 8
t.Font.Color = MUTED
t.HorizontalAlignment = -4108

'''

s = s[:start] + new + s[end:]
s = s.replace("login.PageSetup.PrintArea = 'A1:N32'", "login.PageSetup.PrintArea = 'A1:N30'")
open(p, 'w', encoding='utf-8').write(s)
print('login block replaced')
