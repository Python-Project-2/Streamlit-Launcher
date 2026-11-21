import os

import win32com.client as win32

xl = win32.DispatchEx('Excel.Application')
xl.Visible = False
xl.DisplayAlerts = False
path = os.path.abspath('tmp/form-probe.xlsm')
try:
    wb = xl.Workbooks.Add()
    proj = wb.VBProject
    form = proj.VBComponents.Add(3)  # vbext_ct_MSForm
    form.Name = 'frmLogin'
    form.Properties('Caption').Value = 'Masuk'
    form.Properties('Width').Value = 300
    form.Properties('Height').Value = 210
    lbl = form.Designer.Controls.Add('Forms.Label.1')
    lbl.Name = 'lblTitle'
    lbl.Caption = 'DATE SKUNDER'
    lbl.Left, lbl.Top, lbl.Width, lbl.Height = 18, 12, 260, 24
    txt = form.Designer.Controls.Add('Forms.TextBox.1')
    txt.Name = 'txtPass'
    txt.PasswordChar = '*'
    txt.Left, txt.Top, txt.Width, txt.Height = 18, 90, 260, 22
    btn = form.Designer.Controls.Add('Forms.CommandButton.1')
    btn.Name = 'btnMasuk'
    btn.Caption = 'MASUK'
    btn.Left, btn.Top, btn.Width, btn.Height = 18, 130, 120, 28
    form.CodeModule.AddFromString(
        'Private Sub btnMasuk_Click()\r\n'
        '    MsgBox "user=" & txtUser.Text & " pass=" & txtPass.Text\r\n'
        'End Sub\r\n'
    )
    wb.SaveAs(path, FileFormat=52)
    print('form created, code lines:', form.CodeModule.CountOfLines)
    wb.Close(SaveChanges=False)
finally:
    xl.Quit()
print('saved', os.path.exists(path), os.path.getsize(path) if os.path.exists(path) else 0)
