import csv
import os
import shutil

import win32com.client as win32

BASE = os.path.abspath('output/SuperMarket Analysis-analisis.xlsx')
OUT = os.path.abspath('output/SuperMarket Analysis-aplikasi.xlsm')
WORK = os.path.abspath('tmp/app-build.xlsx')
LOGO = os.path.abspath('icon/logo.png')


def rgb(r, g, b):
    return r + g * 256 + b * 65536


BG = rgb(14, 17, 23)
PANEL = rgb(22, 27, 36)
PANEL2 = rgb(27, 34, 48)
LINE = rgb(42, 49, 64)
TEXT = rgb(230, 234, 242)
MUTED = rgb(138, 148, 166)
ACCENT = rgb(59, 174, 140)
AMBER = rgb(224, 164, 88)
DANGER = rgb(196, 87, 79)
WHITE = rgb(255, 255, 255)
BLACK = rgb(0, 0, 0)

# ── baca kategori dari dataset ──
with open('database/SuperMarket Analysis.csv', encoding='utf-8-sig', newline='') as f:
    rows = list(csv.DictReader(f))
products = []
for r in rows:
    if r['Product line'] not in products:
        products.append(r['Product line'])
payments = []
for r in rows:
    if r['Payment'] not in payments:
        payments.append(r['Payment'])
months = sorted({f"{r['Date'].split('/')[2]}-{int(r['Date'].split('/')[0]):02d}" for r in rows})
LAST_ROW = len(rows) + 1

shutil.copyfile(BASE, WORK)
xl = win32.DispatchEx('Excel.Application')
xl.Visible = False
xl.DisplayAlerts = False
xl.ScreenUpdating = False
xl.AutomationSecurity = 1

wb = xl.Workbooks.Open(WORK)

# hapus halaman Login lama (dengan proteksi)
for name in ('Login',):
    if name in [ws.Name for ws in wb.Worksheets]:
        old = wb.Worksheets(name)
        try:
            old.Unprotect('admin123')
        except Exception:
            pass
        old.Delete()

src = wb.Worksheets('Data')

if 'AKUN' not in [ws.Name for ws in wb.Worksheets]:
    akun = wb.Worksheets.Add(After=wb.Worksheets(wb.Worksheets.Count))
    akun.Name = 'AKUN'
    akun.Range('A1:D1').Value = [['Peran', 'Username', 'Password', 'Nama tampilan']]
    akun.Range('A2:D2').Value = [['Administrator', 'admin', 'admin123', 'Administrator']]
    akun.Range('A1:D1').Font.Bold = True
    akun.Visible = 2

# ── halaman LOGIN di depan ──
login = wb.Worksheets.Add(wb.Worksheets(1))
login.Name = 'LOGIN'
login.Tab.Color = rgb(31, 56, 100)
login.Cells.Interior.Color = BG
login.Cells.Font.Color = TEXT
login.Cells.Font.Name = 'Segoe UI'
for i in range(1, 15):
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

# ── halaman DASHBOARD ──
dash = wb.Worksheets.Add(After=login)
dash.Name = 'Dashboard'
dash.Tab.Color = ACCENT
dash.Cells.Interior.Color = BG
dash.Cells.Font.Name = 'Segoe UI'
dash.Cells.Font.Color = TEXT

widths = {1: 2.2, 2: 2.2, 17: 2.2, 18: 2.2}
for i in range(1, 19):
    dash.Columns(i).ColumnWidth = widths.get(i, 9.4)
for r in range(1, 42):
    dash.Rows(r).RowHeight = 18
dash.Rows(3).RowHeight = 26
dash.Rows(4).RowHeight = 16
dash.Rows(7).RowHeight = 16
dash.Rows(8).RowHeight = 26
dash.Rows(9).RowHeight = 16
dash.Rows(11).RowHeight = 22
dash.Rows(32).RowHeight = 34
dash.Activate()
xl.ActiveWindow.DisplayGridlines = False
xl.ActiveWindow.Zoom = 90

dash.Range('D3').Value = 'DATE SKUNDER'
dash.Range('D3').Font.Size = 18
dash.Range('D3').Font.Bold = True
dash.Range('D3').Font.Color = WHITE
dash.Range('D4').Value = 'Sales & Inventory Analytics  ·  SuperMarket Analysis'
dash.Range('D4').Font.Size = 9
dash.Range('D4').Font.Color = MUTED

dlogo = dash.Shapes.AddPicture(LOGO, 0, -1, dash.Range('B3').Left, dash.Range('B3').Top - 2, 40, 40)
dlogo.Name = 'logoDash'

dash.Range('O3:R3').Merge()
u = dash.Range('O3')
u.Value = 'Masuk sebagai Administrator'
u.Font.Size = 8.5
u.Font.Color = MUTED
u.HorizontalAlignment = -4152
u.VerticalAlignment = -4108

right_edge = dash.Range('R4').Left + dash.Range('R4').Width
out = dash.Shapes.AddShape(5, right_edge - 104, dash.Range('R4').Top, 96, 22)
out.Name = 'btnKeluar'
out.Fill.Solid()
out.Fill.ForeColor.RGB = PANEL2
out.Line.ForeColor.RGB = LINE
out.Line.Weight = 0.75
out.TextFrame2.TextRange.Text = 'KELUAR'
out.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = TEXT
out.TextFrame2.TextRange.Font.Size = 8
out.TextFrame2.TextRange.Font.Bold = True
out.TextFrame2.VerticalAnchor = 3
out.TextFrame2.HorizontalAnchor = 2
out.OnAction = 'DoLogout'

# kartu KPI
cards = [
    ('C6:F9', 'TOTAL PENJUALAN', '=DASH_DATA!F1', '"Rp" #.##0', 'akumulasi seluruh transaksi'),
    ('G6:J9', 'TRANSAKSI', '=DASH_DATA!F2', '#.##0', 'jumlah nota tercatat'),
    ('K6:N9', 'RATA-RATA / NOTA', '=DASH_DATA!F3', '"Rp" #.##0', 'nilai belanja per transaksi'),
    ('O6:R9', 'ITEM TERJUAL', '=DASH_DATA!F4', '#.##0', 'total kuantitas barang'),
]
for rng, label, formula, fmt, note in cards:
    r = dash.Range(rng)
    r.Interior.Color = PANEL
    for idx in (7, 8, 9, 10):
        r.Borders(idx).LineStyle = 1
        r.Borders(idx).Color = LINE
        r.Borders(idx).Weight = 1
    c1, c2 = rng.split(':')
    col1 = dash.Range(c1).Column
    row1 = dash.Range(c1).Row
    # label
    lab = dash.Range(dash.Cells(row1, col1), dash.Cells(row1, dash.Range(c2).Column))
    lab.Merge()
    lab.Value = label
    lab.Font.Size = 7.5
    lab.Font.Bold = True
    lab.Font.Color = MUTED
    lab.HorizontalAlignment = -4131
    lab.VerticalAlignment = -4108
    lab.IndentLevel = 1
    # nilai
    val = dash.Range(dash.Cells(row1 + 1, col1), dash.Cells(row1 + 2, dash.Range(c2).Column))
    val.Merge()
    val.Formula = formula
    val.NumberFormat = fmt
    val.Font.Size = 15
    val.Font.Bold = True
    val.Font.Color = WHITE
    val.HorizontalAlignment = -4131
    val.VerticalAlignment = -4108
    val.IndentLevel = 1
    # catatan
    nt = dash.Range(dash.Cells(row1 + 3, col1), dash.Cells(row1 + 3, dash.Range(c2).Column))
    nt.Merge()
    nt.Value = note
    nt.Font.Size = 7.5
    nt.Font.Color = MUTED
    nt.HorizontalAlignment = -4131
    nt.VerticalAlignment = -4108
    nt.IndentLevel = 1
    # garis aksen di atas kartu
    acc = dash.Shapes.AddShape(1, r.Left, r.Top, r.Width, 2)
    acc.Fill.Solid()
    acc.Fill.ForeColor.RGB = ACCENT
    acc.Line.Visible = 0

dash.Range('C11').Value = 'RINGKASAN PENJUALAN'
dash.Range('C11').Font.Size = 9
dash.Range('C11').Font.Bold = True
dash.Range('C11').Font.Color = MUTED

# ── data bantu ──
if 'DASH_DATA' in [ws.Name for ws in wb.Worksheets]:
    wb.Worksheets('DASH_DATA').Delete()
dd = wb.Worksheets.Add(After=wb.Worksheets(wb.Worksheets.Count))
dd.Name = 'DASH_DATA'
dd.Visible = 0  # xlSheetHidden

dd.Range('E1').Value = 'Total penjualan'
dd.Range('F1').Formula = f'=SUM(Data!$J$2:$J${LAST_ROW})'
dd.Range('F1').NumberFormatLocal = '"Rp" #.##0'
dd.Range('E2').Value = 'Transaksi'
dd.Range('F2').Formula = f'=COUNTA(Data!$A$2:$A${LAST_ROW})'
dd.Range('F2').NumberFormatLocal = '#.##0'
dd.Range('E3').Value = 'Rata-rata per nota'
dd.Range('F3').Formula = '=IF(F2=0,0,F1/F2)'
dd.Range('F3').NumberFormatLocal = '"Rp" #.##0'
dd.Range('E4').Value = 'Item terjual'
dd.Range('F4').Formula = f'=SUM(Data!$H$2:$H${LAST_ROW})'
dd.Range('F4').NumberFormatLocal = '#.##0'
dd.Range('E5').Value = 'Rating rata-rata'
dd.Range('F5').Formula = f'=IFERROR(AVERAGE(Data!$Q$2:$Q${LAST_ROW}),0)'
dd.Range('F5').NumberFormatLocal = '#.##0,00'

dd.Range('A1').Value = 'Lini produk'
dd.Range('B1').Value = 'Penjualan'
dd.Range('C1').Value = 'Porsi'
for i, p in enumerate(products, start=2):
    dd.Cells(i, 1).Value = p
    dd.Cells(i, 2).Formula = f'=SUMIF(Data!$F$2:$F${LAST_ROW},$A{i},Data!$J$2:$J${LAST_ROW})'
    dd.Cells(i, 3).Formula = f'=IF($B$8=0,0,B{i}/$B$8)'
    dd.Cells(i, 2).NumberFormatLocal = '#.##0'
    dd.Cells(i, 3).NumberFormatLocal = '0,0%'
dd.Cells(len(products) + 2, 2).Formula = f'=SUM(B2:B{len(products) + 1})'
dd.Range('B8').NumberFormatLocal = '#.##0'

dd.Range('A10').Value = 'Metode bayar'
dd.Range('B10').Value = 'Transaksi'
dd.Range('C10').Value = 'Penjualan'
for i, p in enumerate(payments, start=11):
    dd.Cells(i, 1).Value = p
    dd.Cells(i, 2).Formula = f'=COUNTIF(Data!$M$2:$M${LAST_ROW},$A{i})'
    dd.Cells(i, 3).Formula = f'=SUMIF(Data!$M$2:$M${LAST_ROW},$A{i},Data!$J$2:$J${LAST_ROW})'
    dd.Cells(i, 2).NumberFormatLocal = '#.##0'
    dd.Cells(i, 3).NumberFormatLocal = '#.##0'

dd.Range('A15').Value = 'Bulan'
dd.Range('B15').Value = 'Penjualan'
for i, m in enumerate(months, start=16):
    dd.Cells(i, 1).Value = m
    dd.Cells(i, 2).Formula = f'=SUMPRODUCT((TEXT(Data!$K$2:$K${LAST_ROW},"yyyy-mm")=$A{i})*Data!$J$2:$J${LAST_ROW})'
    dd.Cells(i, 1).NumberFormat = '@'
    dd.Cells(i, 2).NumberFormatLocal = '#.##0'
dd.Range('A15:B15').Font.Bold = True
dd.Range('A1:C1').Font.Bold = True
dd.Range('A10:C10').Font.Bold = True
dd.Columns('A:C').ColumnWidth = 22

# kartu KPI merujuk DASH_DATA yang baru dibuat
for cell, formula, fmt in (
    ('C7', '=DASH_DATA!F1', '"Rp" #.##0'),
    ('G7', '=DASH_DATA!F2', '#.##0'),
    ('K7', '=DASH_DATA!F3', '"Rp" #.##0'),
    ('O7', '=DASH_DATA!F4', '#.##0'),
):
    dash.Range(cell).Formula = formula
    dash.Range(cell).NumberFormat = fmt

# ── chart ──
def _labels(series):
    try:
        return series.DataLabels()
    except Exception:
        return None


def style_chart(ch, title, legend=False, axes=True):
    ch.ChartArea.Format.Fill.ForeColor.RGB = PANEL
    ch.ChartArea.Format.Line.Visible = 0
    ch.PlotArea.Format.Fill.ForeColor.RGB = PANEL
    ch.PlotArea.Format.Line.Visible = 0
    ch.HasTitle = True
    ch.ChartTitle.Text = title
    ch.ChartTitle.Font.Color = TEXT
    ch.ChartTitle.Font.Size = 10
    ch.ChartTitle.Font.Bold = True
    ch.ChartTitle.Font.Name = 'Segoe UI'
    ch.HasLegend = legend
    if legend:
        lg = ch.Legend
        lg.Font.Color = MUTED
        lg.Font.Size = 8
        lg.Position = -4107
    for ax in ((1, 2) if axes else ()):
        a = ch.Axes(ax)
        a.Format.Line.Visible = 0
        tl = a.TickLabels
        tl.Font.Color = MUTED
        tl.Font.Size = 8
        tl.Font.Name = 'Segoe UI'
        a.HasMajorGridlines = (ax == 2)
        if ax == 2:
            gl = a.MajorGridlines
            gl.Format.Line.ForeColor.RGB = LINE
            gl.Format.Line.Weight = 0.5
            gl.Format.Line.DashStyle = 4


def add_chart(rng, ctype, title, source, legend=False):
    r = dash.Range(rng)
    co = dash.ChartObjects().Add(r.Left, r.Top, r.Width, r.Height)
    ch = co.Chart
    ch.ChartType = ctype
    ch.SetSourceData(Source=source)
    style_chart(ch, title, legend, axes=(ctype not in (80,)))
    return ch


ch1 = add_chart('C13:G30', 57, 'PENJUALAN PER LINI PRODUK', dd.Range(f'A1:B{len(products) + 1}'))
sc = ch1.SeriesCollection(1)
sc.Format.Fill.ForeColor.RGB = ACCENT
sc.Format.Line.Visible = 0
sc.HasDataLabels = True
dl = _labels(sc)
if dl is not None:
    dl.Font.Color = TEXT
    dl.Font.Size = 7
    dl.Font.Name = 'Segoe UI'
    dl.NumberFormatLocal = '#.##0'
ch1.Axes(1).ReversePlotOrder = True
ch1.Axes(2).TickLabelPosition = -4142
ch1.Axes(2).HasMajorGridlines = False

ch2 = add_chart('H13:L30', 4, 'TREN PENJUALAN BULANAN', dd.Range(f'A15:B{15 + len(months)}'))
sc = ch2.SeriesCollection(1)
sc.Format.Line.ForeColor.RGB = AMBER
sc.Format.Line.Weight = 2.25
sc.MarkerStyle = 8
sc.MarkerSize = 5
sc.MarkerBackgroundColor = AMBER
sc.MarkerForegroundColor = AMBER
sc.Smooth = False

ch3 = add_chart('M13:Q30', 80, 'METODE PEMBAYARAN', dd.Range(f'A10:B{10 + len(payments)}'), legend=True)
sc = ch3.SeriesCollection(1)
colors = [ACCENT, AMBER, rgb(88, 132, 214), rgb(160, 120, 200)]
for i in range(1, len(payments) + 1):
    pt = sc.Points(i)
    pt.Format.Fill.ForeColor.RGB = colors[(i - 1) % len(colors)]
    pt.Format.Line.ForeColor.RGB = PANEL
    pt.Format.Line.Weight = 1.5
sc.HasDataLabels = True
dl = _labels(sc)
if dl is not None:
    dl.Font.Color = TEXT
    dl.Font.Size = 8
    dl.ShowPercentage = True
    dl.ShowValue = False

# navigasi
navs = [
    ('Data', 'Data'), ('Statistik', 'Statistik'), ('Korelasi', 'Korelasi'),
    ('Persediaan', 'Persediaan'), ('Decision Tree', 'Decision Tree'), ('Workflow', 'Workflow'),
    ('Grafik', 'Grafik'), ('Metodologi', 'Metodologi'),
]
x = dash.Range('C32').Left
top = dash.Range('C32').Top
for name, label in navs:
    shp = dash.Shapes.AddShape(5, x, top, 92, 26)
    shp.Name = 'nav_' + name.replace(' ', '')
    shp.Fill.Solid()
    shp.Fill.ForeColor.RGB = PANEL2
    shp.Line.ForeColor.RGB = LINE
    shp.Line.Weight = 0.75
    shp.TextFrame2.TextRange.Text = label
    shp.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = TEXT
    shp.TextFrame2.TextRange.Font.Size = 8
    shp.TextFrame2.TextRange.Font.Name = 'Segoe UI'
    shp.TextFrame2.VerticalAnchor = 3
    shp.TextFrame2.HorizontalAnchor = 2
    shp.AlternativeText = name
    shp.OnAction = 'NavTo'
    x += 100

dash.Range('C34').Value = 'Klik salah satu menu untuk membuka lembar analisis. Data dihitung ulang otomatis dari lembar Data.'
dash.Range('C34').Font.Size = 8
dash.Range('C34').Font.Color = MUTED

# ── VBA ──
proj = wb.VBProject
for comp in list(proj.VBComponents):
    if comp.Type == 1 and comp.Name not in ('ThisWorkbook',):
        proj.VBComponents.Remove(comp)

module = proj.VBComponents.Add(1)
module.Name = 'AppCore'
module.CodeModule.AddFromString(r'''
Option Explicit

Public Sub OpenLogin()
    frmLogin.Show
End Sub

Public Function CheckLogin(ByVal u As String, ByVal p As String) As Boolean
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets("AKUN")
    If Len(Trim$(u)) = 0 Or Len(p) = 0 Then Exit Function
    CheckLogin = (StrComp(Trim$(u), CStr(ws.Range("B2").Value), vbTextCompare) = 0) _
        And (StrComp(p, CStr(ws.Range("C2").Value), vbBinaryCompare) = 0)
End Function

Public Sub LockApp()
    Dim ws As Worksheet
    ThisWorkbook.Worksheets("LOGIN").Visible = xlSheetVisible
    ThisWorkbook.Worksheets("LOGIN").Activate
    For Each ws In ThisWorkbook.Worksheets
        If ws.Name <> "LOGIN" And ws.Name <> "AKUN" Then
            ws.Visible = xlSheetVeryHidden
        End If
    Next ws
    ActiveWindow.DisplayWorkbookTabs = False
End Sub

Public Sub UnlockApp()
    Dim ws As Worksheet
    For Each ws In ThisWorkbook.Worksheets
        If ws.Name <> "LOGIN" And ws.Name <> "AKUN" And ws.Name <> "DASH_DATA" Then
            ws.Visible = xlSheetVisible
        End If
    Next ws
    ThisWorkbook.Worksheets("Dashboard").Activate
    ThisWorkbook.Worksheets("LOGIN").Visible = xlSheetVeryHidden
    ActiveWindow.DisplayWorkbookTabs = True
End Sub

Public Sub DoLogout()
    LockApp
End Sub

Public Sub NavTo()
    Dim nm As String
    nm = ActiveSheet.Shapes(Application.Caller).AlternativeText
    On Error Resume Next
    ThisWorkbook.Worksheets(nm).Activate
End Sub
''')

this = proj.VBComponents('ThisWorkbook')
this.CodeModule.AddFromString('Private Sub Workbook_Open()\r\n    LockApp\r\nEnd Sub\r\n')

form = proj.VBComponents.Add(3)
form.Name = 'frmLogin'
form.Properties('Caption').Value = 'Masuk — Date Skunder'
form.Properties('Width').Value = 322
form.Properties('Height').Value = 252
form.Properties('BackColor').Value = PANEL


def add(kind, name, left, top, width, height, caption=None, size=10, bold=False, color=TEXT, back=None):
    ctl = form.Designer.Controls.Add(kind)
    ctl.Name = name
    ctl.Left, ctl.Top, ctl.Width, ctl.Height = left, top, width, height
    ctl.Font.Name = 'Segoe UI'
    ctl.Font.Size = size
    ctl.Font.Bold = bold
    if caption is not None:
        ctl.Caption = caption
    ctl.ForeColor = color
    if back is not None:
        ctl.BackColor = back
    return ctl


add('Forms.Label.1', 'lblBrand', 16, 12, 290, 22, 'DATE SKUNDER', 14, True, ACCENT)
add('Forms.Label.1', 'lblSub', 16, 34, 290, 16, 'Masuk untuk membuka dashboard', 9, False, MUTED)
add('Forms.Label.1', 'lblUser', 16, 64, 100, 14, 'Username', 9, False, TEXT)
txt_user = add('Forms.TextBox.1', 'txtUser', 16, 82, 290, 22, None, 11)
txt_user.BackColor = BG
txt_user.ForeColor = TEXT
txt_user.BorderStyle = 1
add('Forms.Label.1', 'lblPass', 16, 112, 100, 14, 'Password', 9, False, TEXT)
txt_pass = add('Forms.TextBox.1', 'txtPass', 16, 130, 290, 22, None, 11)
txt_pass.BackColor = BG
txt_pass.ForeColor = TEXT
txt_pass.BorderStyle = 1
txt_pass.PasswordChar = '*'
add('Forms.Label.1', 'lblMsg', 16, 158, 290, 16, '', 8.5, False, DANGER)
add('Forms.CommandButton.1', 'btnMasuk', 16, 182, 140, 30, 'MASUK', 10, True, rgb(9, 20, 16), ACCENT)
add('Forms.CommandButton.1', 'btnBatal', 166, 182, 140, 30, 'BATAL', 10, False, TEXT, PANEL2)

form.CodeModule.AddFromString(r'''
Private Sub UserForm_Initialize()
    txtUser.Text = ""
    txtPass.Text = ""
    lblMsg.Caption = ""
End Sub

Private Sub btnMasuk_Click()
    If Not CheckLogin(txtUser.Text, txtPass.Text) Then
        lblMsg.Caption = "Username atau password salah."
        txtPass.Text = ""
        txtPass.SetFocus
        Exit Sub
    End If
    Unload Me
    UnlockApp
End Sub

Private Sub btnBatal_Click()
    Unload Me
End Sub
''')

# pengaturan cetak
dash.PageSetup.Orientation = 2
dash.PageSetup.Zoom = False
dash.PageSetup.FitToPagesWide = 1
dash.PageSetup.FitToPagesTall = 1
dash.PageSetup.PrintArea = 'A1:R35'
login.PageSetup.Orientation = 1
login.PageSetup.Zoom = False
login.PageSetup.FitToPagesWide = 1
login.PageSetup.FitToPagesTall = 1
login.PageSetup.PrintArea = 'A1:N31'

# Simpan dalam keadaan terkunci: tanpa makro pun hanya halaman login yang terlihat.
login.Activate()
for ws in wb.Worksheets:
    if ws.Name not in ('LOGIN', 'AKUN'):
        ws.Visible = 2
wb.Worksheets('LOGIN').Visible = -1
xl.ActiveWindow.DisplayWorkbookTabs = False
wb.SaveAs(OUT, FileFormat=52)
print('saved', OUT, os.path.getsize(OUT))
wb.Close(SaveChanges=False)
xl.Quit()
