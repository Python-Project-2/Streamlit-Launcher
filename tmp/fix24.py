p = 'tmp/build_xlsm.py'
s = open(p, encoding='utf-8').read()

# border input lebih terlihat
s = s.replace("""        c.Borders(idx).LineStyle = 1
        c.Borders(idx).Color = LINE
        c.Borders(idx).Weight = 1""", """        c.Borders(idx).LineStyle = 1
        c.Borders(idx).Color = rgb(58, 68, 89)
        c.Borders(idx).Weight = 1""")

# password lebih lebar + indikator
s = s.replace("pwd = login_input('G14:H14')", "pwd = login_input('G14:J14')")
s = s.replace("""login.Range('I14:K14').Merge()
bul = login.Range('I14')
bul.Formula = '=IF($G$14="","",REPT("•",LEN($G$14)))'
bul.Font.Size = 11
bul.Font.Color = MUTED
bul.HorizontalAlignment = -4131
bul.VerticalAlignment = -4108
bul.IndentLevel = 0""", """login.Range('K14').Formula = '=IF($G$14="","","●")'
login.Range('K14').Font.Size = 10
login.Range('K14').Font.Color = ACCENT
login.Range('K14').HorizontalAlignment = -4108
login.Range('K14').VerticalAlignment = -4108""")

open(p, 'w', encoding='utf-8').write(s)
print('ok')
