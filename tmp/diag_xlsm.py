import os

import win32com.client as win32

PATH = os.path.abspath('output/SuperMarket Analysis-aplikasi.xlsm')
xl = win32.DispatchEx('Excel.Application')
xl.Visible = False
xl.DisplayAlerts = False
xl.AutomationSecurity = 1
wb = xl.Workbooks.Open(PATH)
xl.Run('UnlockApp')
d = wb.Worksheets('Dashboard')
for cell in ('C7', 'G7', 'K7', 'O7', 'D29'):
    c = d.Range(cell)
    print(cell, 'value=', c.Text, '| fmt=', repr(c.NumberFormat), '| type=', c.Value2)
sh = d.Shapes('nav_Data')
print('nav fill type:', sh.Fill.Type, 'fore:', sh.Fill.ForeColor.RGB, 'visible:', sh.Fill.Visible)
print('nav line visible:', sh.Line.Visible, 'weight:', sh.Line.Weight)
sh2 = d.Shapes('btnKeluar')
print('keluar left/width:', sh2.Left, sh2.Width, 'sheet width:', d.Range('R1').Left + d.Range('R1').Width)
ch = d.ChartObjects(1).Chart
sc = ch.SeriesCollection(1)
print('datalabels number format:', repr(sc.DataLabels().NumberFormat))
wb.Close(SaveChanges=False)
xl.Quit()
