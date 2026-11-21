p = 'tmp/build_xlsm.py'
s = open(p, encoding='utf-8').read()
s = s.replace('def style_chart(ch, title, legend=False):', 'def style_chart(ch, title, legend=False, axes=True):')
s = s.replace("""    for ax in (1, 2):
        a = ch.Axes(ax)""", """    for ax in ((1, 2) if axes else ()):
        a = ch.Axes(ax)""")
s = s.replace("""    ch.SetSourceData(Source=source)
    style_chart(ch, title, legend)""", """    ch.SetSourceData(Source=source)
    style_chart(ch, title, legend, axes=(ctype not in (80,)))""")
open(p, 'w', encoding='utf-8').write(s)
print('ok')
