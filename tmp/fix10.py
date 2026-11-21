p = 'tmp/build_xlsm.py'
s = open(p, encoding='utf-8').read()
s = s.replace("""navs = [
    ('Data', 'Data sumber'), ('Statistik', 'Statistik'), ('Korelasi', 'Korelasi'),
    ('Persediaan', 'Persediaan'), ('Decision Tree', 'C4.5'), ('Workflow', 'Alur'),
    ('Grafik', 'Grafik'), ('Metodologi', 'Rumus'),
]""", """navs = [
    ('Data', 'Data'), ('Statistik', 'Statistik'), ('Korelasi', 'Korelasi'),
    ('Persediaan', 'Persediaan'), ('Decision Tree', 'Decision Tree'), ('Workflow', 'Workflow'),
    ('Grafik', 'Grafik'), ('Metodologi', 'Metodologi'),
]""")
s = s.replace("ch1.Axes(1).ReversePlotOrder = True", "ch1.Axes(1).ReversePlotOrder = True\nch1.Axes(2).TickLabelPosition = -4142\nch1.Axes(2).HasMajorGridlines = False")
open(p, 'w', encoding='utf-8').write(s)
print('ok')
