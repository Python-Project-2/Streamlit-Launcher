import os
import time

import win32com.client as win32

PATH = os.path.abspath('output/SuperMarket Analysis-aplikasi.xlsm')
xl = win32.DispatchEx('Excel.Application')
xl.Visible = False
xl.DisplayAlerts = False
xl.AutomationSecurity = 1
wb = xl.Workbooks.Open(PATH)
time.sleep(1)
print('open visible:', {ws.Name: ws.Visible for ws in wb.Worksheets if ws.Visible == -1})
login = wb.Worksheets('LOGIN')
print('input cells:', repr(login.Range('G12').Value), repr(login.Range('G14').Value), '| label D12:', login.Range('D12').Value, '| label D14:', login.Range('D14').Value)

# salah
login.Range('G12').Value = 'admin'
login.Range('G14').Value = 'salah'
xl.Run('DoLoginSheet')
print('status salah:', login.Range('D19').Value, '| dashboard visible:', wb.Worksheets('Dashboard').Visible)

# benar
login.Range('G12').Value = 'admin'
login.Range('G14').Value = 'admin123'
xl.Run('DoLoginSheet')
time.sleep(0.5)
print('status benar:', login.Range('D19').Value, '| dashboard:', wb.Worksheets('Dashboard').Visible, '| login:', login.Visible)
print('scrollarea dash:', wb.Worksheets('Dashboard').ScrollArea, '| login:', login.ScrollArea)
print('zoom:', xl.ActiveWindow.Zoom, '| tabs:', xl.ActiveWindow.DisplayWorkbookTabs, '| scrollbars:', xl.ActiveWindow.DisplayVerticalScrollBar)

# ekspor tampilan
for sheet, name in (('Dashboard', 'dash'), ('LOGIN', 'login')):
    ws = wb.Worksheets(sheet)
    was = ws.Visible
    ws.Visible = -1
    ws.Activate()
    time.sleep(0.3)
    out = os.path.abspath(f'tmp/{name}.pdf')
    if os.path.exists(out):
        os.remove(out)
    ws.ExportAsFixedFormat(0, out)
    print('export', name, os.path.getsize(out))
    if sheet == 'LOGIN':
        ws.Visible = was

wb.Close(SaveChanges=False)
xl.Quit()
print('done')
