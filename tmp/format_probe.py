import win32com.client as win32

xl = win32.DispatchEx('Excel.Application')
xl.Visible = False
xl.DisplayAlerts = False
wb = xl.Workbooks.Add()
ws = wb.Worksheets(1)
ws.Range('A1').Value = 322966.749
formats = ['"Rp" #,##0', 'Rp #,##0', '[Rp] #,##0', '[$Rp] #,##0', '#,##0 "Rp"', '"Rp "\\#,##0']
for i, f in enumerate(formats, start=1):
    cell = ws.Cells(i, 1)
    cell.Value = 322966.749
    cell.NumberFormat = f
    print(repr(f), '->', repr(cell.NumberFormat), '| text:', repr(cell.Text))

shp = ws.Shapes.AddShape(5, 10, 200, 100, 30)
shp.Fill.Solid()
shp.Fill.ForeColor.RGB = 27 + 34 * 256 + 48 * 65536
shp.Line.Visible = 0
print('after solid: type', shp.Fill.Type, 'rgb', shp.Fill.ForeColor.RGB, 'line', shp.Line.Visible)
wb.Close(SaveChanges=False)
xl.Quit()
