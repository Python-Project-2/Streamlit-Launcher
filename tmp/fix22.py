p = 'tmp/build_xlsm.py'
s = open(p, encoding='utf-8').read()
s = s.replace("print('saving...', flush=True)\nwb.Save()", "print('saving...', flush=True)\ntry:\n    wb.RemovePersonalInformation = True\nexcept Exception as exc:\n    print('rpi skip:', exc, flush=True)\nwb.Save()")
open(p, 'w', encoding='utf-8').write(s)
print('ok')
