p = 'tmp/build_xlsm.py'
s = open(p, encoding='utf-8').read()

# ── 1. buat lembar AKUN bila belum ada ──
s = s.replace("""src = wb.Worksheets('Data')""", """src = wb.Worksheets('Data')

if 'AKUN' not in [ws.Name for ws in wb.Worksheets]:
    akun = wb.Worksheets.Add(After=wb.Worksheets(wb.Worksheets.Count))
    akun.Name = 'AKUN'
    akun.Range('A1:D1').Value = [['Peran', 'Username', 'Password', 'Nama tampilan']]
    akun.Range('A2:D2').Value = [['Administrator', 'admin', 'admin123', 'Administrator']]
    akun.Range('A1:D1').Font.Bold = True
    akun.Visible = 2""")

# ── 2. ganti tata letak login ──
start = s.index("for i in range(1, 15):\n    login.Columns(i).ColumnWidth = 5.6")
end = s.index("# ── halaman DASHBOARD ──")

new_login = '''for i in range(1, 15):
    login.Columns(i).ColumnWidth = 8.5
for r in range(1, 34):
    login.Rows(r).RowHeight = 20

card = login.Range('D6:K28')
card.Interior.Color = PANEL
for idx in (7, 8, 9, 10):
    card.Borders(idx).LineStyle = 1
    card.Borders(idx).Color = LINE
    card.Borders(idx).Weight = 1

top_bar = login.Shapes.AddShape(1, card.Left, card.Top, card.Width, 3)
top_bar.Fill.Solid()
top_bar.Fill.ForeColor.RGB = ACCENT
top_bar.Line.Visible = 0

logo = login.Shapes.AddPicture(LOGO, 0, -1, card.Left + (card.Width - 44) / 2, card.Top + 12, 44, 44)
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


def login_label(rng, text):
    login.Range(rng).Merge()
    c = login.Range(rng.split(':')[0])
    c.Value = text
    c.Font.Size = 8
    c.Font.Bold = True
    c.Font.Color = MUTED
    c.HorizontalAlignment = -4152
    c.VerticalAlignment = -4108


def login_input(rng):
    login.Range(rng).Merge()
    c = login.Range(rng.split(':')[0])
    c.Interior.Color = rgb(9, 12, 18)
    for idx in (7, 8, 9, 10):
        c.Borders(idx).LineStyle = 1
        c.Borders(idx).Color = LINE
        c.Borders(idx).Weight = 1
    c.Font.Size = 11
    c.Font.Color = TEXT
    c.HorizontalAlignment = -4131
    c.VerticalAlignment = -4108
    c.IndentLevel = 1
    return c


login_label('D12:F12', 'USERNAME')
login_input('G12:K12')

login_label('D14:F14', 'PASSWORD')
pwd = login_input('G14:H14')
pwd.NumberFormat = ';;;'          # isi password tidak ditampilkan
pwd.Font.Size = 12

login.Range('I14:K14').Merge()
bul = login.Range('I14')
bul.Formula = '=IF($G$14="","",REPT("•",LEN($G$14)))'
bul.Font.Size = 11
bul.Font.Color = MUTED
bul.HorizontalAlignment = -4131
bul.VerticalAlignment = -4108
bul.IndentLevel = 0

btn = login.Shapes.AddShape(5, card.Left + 24, login.Range('D16').Top, card.Width - 48, 44)
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
btn.OnAction = 'DoLoginSheet'

login.Range('D19:K19').Merge()
t = login.Range('D19')
t.Value = 'Masukkan username dan password, lalu klik MASUK.'
t.Font.Size = 8.5
t.Font.Color = MUTED
t.HorizontalAlignment = -4108
t.VerticalAlignment = -4108

login.Range('D21:K21').Merge()
t = login.Range('D21')
t.Value = 'Akun default  ·  admin / admin123'
t.Font.Size = 8.5
t.Font.Color = MUTED
t.HorizontalAlignment = -4108

login.Range('D23:K23').Merge()
t = login.Range('D23')
t.Value = 'Password tidak ditampilkan saat diketik.'
t.Font.Size = 7.5
t.Font.Color = MUTED
t.HorizontalAlignment = -4108

login.Range('D27:K27').Merge()
t = login.Range('D27')
t.Value = '© 2026 Date Skunder  ·  Data: SuperMarket Analysis'
t.Font.Size = 8
t.Font.Color = MUTED
t.HorizontalAlignment = -4108

'''

s = s[:start] + new_login + s[end:]
s = s.replace("login.PageSetup.PrintArea = 'A1:N30'", "login.PageSetup.PrintArea = 'A1:N31'")
open(p, 'w', encoding='utf-8').write(s)
print('login layout replaced')
