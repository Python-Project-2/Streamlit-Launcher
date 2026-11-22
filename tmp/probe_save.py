import os
import shutil

import win32com.client as win32

BASE = os.path.abspath('output/SuperMarket Analysis-analisis.xlsx')
WORK = os.path.abspath('tmp/probe2.xlsx')
OUT = os.path.abspath('tmp/probe2.xlsm')
shutil.copyfile(BASE, WORK)
if os.path.exists(OUT):
    os.remove(OUT)
xl = win32.DispatchEx('Excel.Application')
xl.Visible = False
xl.DisplayAlerts = False
wb = xl.Workbooks.Open(WORK)
print('open ok', flush=True)
mod = wb.VBProject.VBComponents.Add(1)
mod.Name = 'TestMod'
mod.CodeModule.AddFromString('Public Sub Hello()\r\n    MsgBox "ok"\r\nEnd Sub\r\n')
print('module ok', flush=True)
wb.SaveAs(OUT, FileFormat=52)
print('saved', os.path.getsize(OUT), flush=True)
wb.Close(SaveChanges=False)
xl.Quit()
print('done', flush=True)
