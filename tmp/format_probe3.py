import win32com.client as win32

xl = win32.DispatchEx('Excel.Application')
xl.Visible = False
xl.DisplayAlerts = False
wb = xl.Workbooks.Add()
ws = wb.Worksheets(1)
tests = [
    ('NumberFormatLocal', '#.##0'),
    ('NumberFormatLocal', '"Rp" #.##0'),
    ('NumberFormatLocal', '#.##0,00'),
    ('NumberFormatLocal', '0,0%'),
]
row = 1
for kind, f in tests:
    cell = ws.Cells(row, 1)
    cell.Value = 322966.749 if row < 4 else 0.157
    try:
        setattr(cell, kind, f)
        print(kind, repr(f), '-> stored', repr(cell.NumberFormat), '| text', repr(cell.Text))
    except Exception as e:
        print(kind, repr(f), 'FAIL', str(e)[:90])
    row += 1
wb.Close(SaveChanges=False)
xl.Quit()
