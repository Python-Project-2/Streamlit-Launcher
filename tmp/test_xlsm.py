import os
import time

import win32com.client as win32

PATH = os.path.abspath('output/SuperMarket Analysis-aplikasi.xlsm')
xl = win32.DispatchEx('Excel.Application')
xl.Visible = False
xl.DisplayAlerts = False
xl.AutomationSecurity = 1  # aktifkan makro

wb = xl.Workbooks.Open(PATH)
time.sleep(1)

print('macros enabled:', xl.EnableEvents, 'file:', wb.Name)
print('sheets on open:', {ws.Name: ws.Visible for ws in wb.Worksheets})

print('login benar :', xl.Run('CheckLogin', 'admin', 'admin123'))
print('login salah :', xl.Run('CheckLogin', 'admin', 'salah'))
print('login kosong:', xl.Run('CheckLogin', '', ''))

xl.Run('UnlockApp')
time.sleep(1)
print('after unlock:', {ws.Name: ws.Visible for ws in wb.Worksheets})
print('charts on dashboard:', wb.Worksheets('Dashboard').ChartObjects().Count)

# ekspor tampilan
for sheet, name in (('Dashboard', 'dash'), ('LOGIN', 'login')):
    ws = wb.Worksheets(sheet)
    was = ws.Visible
    ws.Visible = -1
    ws.Activate()
    out = os.path.abspath(f'tmp/{name}.pdf')
    if os.path.exists(out):
        os.remove(out)
    ws.ExportAsFixedFormat(0, out)
    print('exported', name, os.path.exists(out), os.path.getsize(out) if os.path.exists(out) else 0)
    if sheet == 'LOGIN':
        ws.Visible = was

xl.Run('LockApp')
wb.Close(SaveChanges=False)
xl.Quit()
print('done')
