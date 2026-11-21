import win32com.client as win32

xl = win32.DispatchEx('Excel.Application')
xl.Visible = False
xl.DisplayAlerts = False
wb = xl.Workbooks.Add()
ws = wb.Worksheets(1)
tests = [
    ('NumberFormat', '#,##0'),
    ('NumberFormat', '#,##0.00'),
    ('NumberFormat', 'Rp #,##0'),
    ('NumberFormatLocal', 'Rp #,##0'),
    ('NumberFormatLocal', '"Rp" #,##0'),
]
row = 1
for kind, f in tests:
    cell = ws.Cells(row, 1)
    cell.Value = 322966.749
    try:
        setattr(cell, kind, f)
        print(kind, repr(f), '->', repr(cell.NumberFormat), '| local', repr(cell.NumberFormatLocal), '| text', repr(cell.Text))
    except Exception as e:
        print(kind, repr(f), 'FAIL', str(e)[:90])
    row += 1
wb.Close(SaveChanges=False)
xl.Quit()
