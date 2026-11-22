import os

import win32com.client as win32

OUT = os.path.abspath('tmp/probe3.xlsm')
if os.path.exists(OUT):
    os.remove(OUT)
code = open('tmp/appcore.bas', encoding='utf-8').read()
this_code = (
    'Private Sub Workbook_Open()\r\n'
    '    LockApp\r\n'
    'End Sub\r\n'
    '\r\n'
    'Private Sub Workbook_SheetActivate(ByVal Sh As Object)\r\n'
    '    On Error Resume Next\r\n'
    '    Select Case Sh.Name\r\n'
    '        Case "Dashboard"\r\n'
    '            Sh.ScrollArea = "A1:R35"\r\n'
    '            ActiveWindow.Zoom = 85\r\n'
    '        Case "LOGIN"\r\n'
    '            Sh.ScrollArea = "A1:N31"\r\n'
    '        Case Else\r\n'
    '            Sh.ScrollArea = ""\r\n'
    '    End Select\r\n'
    'End Sub\r\n'
)

xl = win32.DispatchEx('Excel.Application')
xl.Visible = False
xl.DisplayAlerts = False
wb = xl.Workbooks.Add()
wb.SaveAs(OUT, FileFormat=52)
print('base saved', os.path.getsize(OUT), flush=True)
proj = wb.VBProject
mod = proj.VBComponents.Add(1)
mod.Name = 'AppCore'
mod.CodeModule.AddFromString(code)
print('appcore added', flush=True)
this = proj.VBComponents('ThisWorkbook')
this.CodeModule.AddFromString(this_code)
print('thisworkbook added', flush=True)
wb.Save()
print('saved after vba', os.path.getsize(OUT), flush=True)
wb.Close(SaveChanges=False)
xl.Quit()
print('done', flush=True)
