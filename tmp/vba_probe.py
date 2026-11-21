import os
import time

import win32com.client as win32

xl = win32.DispatchEx('Excel.Application')
xl.Visible = False
xl.DisplayAlerts = False
try:
    wb = xl.Workbooks.Add()
    try:
        print('VBProject:', wb.VBProject.Name)
        print('AccessVBOM: OK')
    except Exception as e:
        print('VBProject error:', e)
    wb.Close(SaveChanges=False)
finally:
    xl.Quit()
