import os

import win32com.client as win32

xl = win32.DispatchEx('Excel.Application')
xl.Visible = False
xl.DisplayAlerts = False
try:
    wb = xl.Workbooks.Add()
    ws = wb.Worksheets(1)
    ws.Range('A1:B4').Value = [['x', 'y'], ['a', 1], ['b', 3], ['c', 2]]
    co = ws.ChartObjects().Add(10, 10, 300, 200)
    ch = co.Chart
    ch.ChartType = 57
    ch.SetSourceData(Source=ws.Range('A1:B4'))
    a = ch.Axes(2)
    tests = {
        'ticklabels_attr': lambda: a.TickLabels.Font.Color,
        'ticklabels_call': lambda: a.TickLabels().Font.Color,
        'gridlines_attr': lambda: a.MajorGridlines.Format.Line.Weight,
        'gridlines_call': lambda: a.MajorGridlines().Format.Line.Weight,
        'legend_attr': lambda: ch.Legend.Font.Size,
        'legend_call': lambda: ch.Legend().Font.Size,
        'datalabels_attr': lambda: ch.SeriesCollection(1).DataLabels.Font.Size,
        'datalabels_call': lambda: ch.SeriesCollection(1).DataLabels().Font.Size,
    }
    for name, fn in tests.items():
        try:
            print(name, 'OK ->', fn())
        except Exception as e:
            print(name, 'FAIL', str(e)[:80])
    wb.Close(SaveChanges=False)
finally:
    xl.Quit()
