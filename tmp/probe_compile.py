import os

import win32com.client as win32

OUT = os.path.abspath('tmp/probe4.xlsm')
if os.path.exists(OUT):
    os.remove(OUT)
code = open('tmp/appcore.bas', encoding='utf-8').read()

xl = win32.DispatchEx('Excel.Application')
xl.Visible = False
xl.DisplayAlerts = False
wb = xl.Workbooks.Add()
wb.Worksheets(1).Name = 'LOGIN'
wb.Worksheets.Add(After=wb.Worksheets(1)).Name = 'AKUN'
wb.Worksheets('AKUN').Range('B2').Value = 'admin'
wb.Worksheets('AKUN').Range('C2').Value = 'admin123'
wb.SaveAs(OUT, FileFormat=52)
proj = wb.VBProject
mod = proj.VBComponents.Add(1)
mod.Name = 'AppCore'
mod.CodeModule.AddFromString(code)
print('code added', flush=True)
try:
    print('run result:', xl.Run('CheckLogin', 'admin', 'admin123'), flush=True)
    print('run salah:', xl.Run('CheckLogin', 'admin', 'x'), flush=True)
except Exception as e:
    print('RUN ERROR', e, flush=True)
wb.Close(SaveChanges=False)
xl.Quit()
print('done', flush=True)
