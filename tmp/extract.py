s = open('tmp/build_xlsm.py', encoding='utf-8').read()
marker = 'module.CodeModule.AddFromString(r"""'
a = s.index(marker) + len(marker)
b = s.index('""")', a)
code = s[a:b]
open('tmp/appcore.bas', 'w', encoding='utf-8').write(code)
print(code[:500])
print('lines', code.count('\n'))
