s = open('tmp/build_xlsm.py', encoding='utf-8').read()
a = s.index('this.CodeModule.AddFromString(')
b = s.index('\n\n', a)
print(s[a:b])
