import os
import time

import win32com.client as win32

PATH = os.path.abspath('output/SuperMarket Analysis-aplikasi.xlsm')

# 1) buka tanpa menjalankan makro
xl = win32.DispatchEx('Excel.Application')
xl.Visible = False
xl.DisplayAlerts = False
xl.AutomationSecurity = 3  # makro dinonaktifkan
wb = xl.Workbooks.Open(PATH)
time.sleep(0.5)
vis = {ws.Name: ws.Visible for ws in wb.Worksheets}
print('tanpa makro -> LOGIN:', vis.get('LOGIN'), 'Dashboard:', vis.get('Dashboard'), 'lain terlihat:', [k for k, v in vis.items() if v == -1])
wb.Close(SaveChanges=False)
xl.Quit()

# 2) buka dengan makro, uji alur
xl = win32.DispatchEx('Excel.Application')
xl.Visible = False
xl.DisplayAlerts = False
xl.AutomationSecurity = 1
wb = xl.Workbooks.Open(PATH)
time.sleep(1)
comps = [c.Name for c in wb.VBProject.VBComponents]
print('komponen VBA:', comps)
print('form ada:', 'frmLogin' in comps, '| kode ThisWorkbook baris:', wb.VBProject.VBComponents('ThisWorkbook').CodeModule.CountOfLines)
print('cek login benar:', xl.Run('CheckLogin', 'admin', 'admin123'), '| salah:', xl.Run('CheckLogin', 'admin', 'x'))
xl.Run('UnlockApp')
time.sleep(0.5)
print('setelah login -> Dashboard:', wb.Worksheets('Dashboard').Visible, '| LOGIN:', wb.Worksheets('LOGIN').Visible, '| DASH_DATA:', wb.Worksheets('DASH_DATA').Visible)
xl.Run('DoLogout')
time.sleep(0.5)
print('setelah logout -> Dashboard:', wb.Worksheets('Dashboard').Visible, '| LOGIN:', wb.Worksheets('LOGIN').Visible)
wb.Close(SaveChanges=False)
xl.Quit()
print('selesai')
