import os
import shutil

import win32com.client as win32

BASE = os.path.abspath('output/SuperMarket Analysis-analisis.xlsx')
WORK = os.path.abspath('tmp/probe-app.xlsx')
shutil.copyfile(BASE, WORK)
xl = win32.DispatchEx('Excel.Application')
xl.Visible = False
xl.DisplayAlerts = False
wb = xl.Workbooks.Open(WORK)
print('opened', flush=True)
login = wb.Worksheets.Add(wb.Worksheets(1))
login.Name = 'LOGIN'
print('sheet added', flush=True)
login.Cells.Interior.Color = 14 + 17 * 256 + 23 * 65536
print('cells filled', flush=True)
for i in range(1, 15):
    login.Columns(i).ColumnWidth = 8.5
for r in range(1, 34):
    login.Rows(r).RowHeight = 20
print('size set', flush=True)
login.Range('D6:K28').Interior.Color = 22 + 27 * 256 + 36 * 65536
print('card filled', flush=True)
for idx in (7, 8, 9, 10):
    login.Range('D6:K28').Borders(idx).LineStyle = 1
    login.Range('D6:K28').Borders(idx).Color = 42 + 49 * 256 + 64 * 65536
    login.Range('D6:K28').Borders(idx).Weight = 1
print('card border', flush=True)
login.Range('D9:K9').Merge()
login.Range('D9').Value = 'DATE SKUNDER'
print('title', flush=True)
login.Range('G12:K12').Merge()
login.Range('G12').Value = 'admin'
login.Range('G14:H14').Merge()
login.Range('G14').Value = 'admin123'
print('inputs', flush=True)
login.Range('G14').NumberFormat = ';;;'
print('pwd format', flush=True)
login.Range('I14:K14').Merge()
login.Range('I14').Formula = '=IF($G$14="","",REPT("•",LEN($G$14)))'
print('bullets', flush=True)
wb.Close(SaveChanges=False)
xl.Quit()
print('done', flush=True)
