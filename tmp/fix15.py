p = 'tmp/build_xlsm.py'
s = open(p, encoding='utf-8').read()

# hapus injeksi modul per lembar
start = s.index('sheet_code = {')
end = s.index('# pengaturan cetak', start)
s = s[:start] + s[end:]

# tambahkan event SheetActivate pada ThisWorkbook
old = "this.CodeModule.AddFromString('Private Sub Workbook_Open()\\r\\n    LockApp\\r\\nEnd Sub\\r\\n')"
new = """this.CodeModule.AddFromString(
    'Private Sub Workbook_Open()\\r\\n'
    '    LockApp\\r\\n'
    'End Sub\\r\\n'
    '\\r\\n'
    'Private Sub Workbook_SheetActivate(ByVal Sh As Object)\\r\\n'
    '    On Error Resume Next\\r\\n'
    '    Select Case Sh.Name\\r\\n'
    '        Case "Dashboard"\\r\\n'
    '            Sh.ScrollArea = "A1:R35"\\r\\n'
    '            ActiveWindow.Zoom = 85\\r\\n'
    '        Case "LOGIN"\\r\\n'
    '            Sh.ScrollArea = "A1:N31"\\r\\n'
    '        Case Else\\r\\n'
    '            Sh.ScrollArea = ""\\r\\n'
    '    End Select\\r\\n'
    'End Sub\\r\\n'
)"""
s = s.replace(old, new)
open(p, 'w', encoding='utf-8').write(s)
print('moved to ThisWorkbook; sheet_code removed:', 'sheet_code' not in s)
