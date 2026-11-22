p = 'tmp/build_xlsm.py'
s = open(p, encoding='utf-8').read()

# ── ganti isi modul AppCore ──
start = s.index("module.CodeModule.AddFromString(r'''")
end = s.index("''')", start) + len("''')")

new_module = r'''module.CodeModule.AddFromString(r"""
Option Explicit

Public Sub DoLoginSheet()
    Dim ws As Worksheet, u As String, p As String
    Set ws = ThisWorkbook.Worksheets("LOGIN")
    u = Trim$(CStr(ws.Range("G12").Value))
    p = CStr(ws.Range("G14").Value)
    If Len(u) = 0 Or Len(p) = 0 Then
        ws.Range("D19").Value = "Username dan password belum diisi."
        Exit Sub
    End If
    If CheckLogin(u, p) Then
        ws.Range("D19").Value = "Login berhasil. Membuka dashboard..."
        Application.EnableEvents = False
        ws.Range("G14").Value = ""
        Application.EnableEvents = True
        UnlockApp
    Else
        ws.Range("D19").Value = "Username atau password salah."
        Application.EnableEvents = False
        ws.Range("G14").Value = ""
        Application.EnableEvents = True
        ws.Range("G12").Select
    End If
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
    ActiveWindow.DisplayVerticalScrollBar = False
    ActiveWindow.DisplayHorizontalScrollBar = False
    ActiveWindow.DisplayHeadings = False
    ActiveWindow.Zoom = 90
    ThisWorkbook.Worksheets("LOGIN").Range("G12").Select
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
    ActiveWindow.DisplayVerticalScrollBar = False
    ActiveWindow.DisplayHorizontalScrollBar = False
    ActiveWindow.DisplayHeadings = False
    ActiveWindow.Zoom = 85
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
""")'''

s = s[:start] + new_module + s[end:]

# ── hapus form, tambahkan modul per lembar ──
start = s.index('form = proj.VBComponents.Add(3)')
end = s.index("wb.Worksheets('LOGIN').Activate", start)

new_tail = '''# modul lembar: batasi area gulir agar tidak bisa scroll ke bawah
sheet_code = {
    'LOGIN': 'Private Sub Worksheet_Activate()\\r\\n    Me.ScrollArea = "A1:N31"\\r\\nEnd Sub\\r\\n',
    'Dashboard': 'Private Sub Worksheet_Activate()\\r\\n    Me.ScrollArea = "A1:R35"\\r\\n    ActiveWindow.Zoom = 85\\r\\nEnd Sub\\r\\n',
}
for sheet_name, code in sheet_code.items():
    comp = proj.VBComponents(wb.Worksheets(sheet_name).CodeName)
    comp.CodeModule.AddFromString(code)

'''

s = s[:start] + new_tail + s[end:]
open(p, 'w', encoding='utf-8').write(s)
print('vba updated')
