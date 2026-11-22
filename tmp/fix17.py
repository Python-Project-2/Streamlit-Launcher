p = 'tmp/build_xlsm.py'
s = open(p, encoding='utf-8').read()
s = s.replace("""# pengaturan cetak
print('step: cetak selesai', flush=True)""", """print('step: cetak selesai', flush=True)
try:
    print('compile check:', xl.Run('CheckLogin', 'admin', 'admin123'), flush=True)
    print('ThisWorkbook lines:', this.CodeModule.CountOfLines, flush=True)
    print(this.CodeModule.Lines(1, this.CodeModule.CountOfLines), flush=True)
except Exception as exc:
    print('compile error:', exc, flush=True)""")
open(p, 'w', encoding='utf-8').write(s)
print('ok')
