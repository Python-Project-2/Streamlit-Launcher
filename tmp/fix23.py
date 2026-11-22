p = 'tmp/build_xlsm.py'
s = open(p, encoding='utf-8').read()
if 'import subprocess' not in s:
    s = s.replace('import shutil', 'import shutil\nimport subprocess', 1)
# buang RemovePersonalInformation
s = s.replace("""try:
    wb.RemovePersonalInformation = True
except Exception as exc:
    print('rpi skip:', exc, flush=True)
""", "")
# jalankan penutup dialog otomatis selama Save
s = s.replace("print('saving...', flush=True)\nwb.Save()", """print('saving...', flush=True)
watcher = subprocess.Popen(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', os.path.abspath('tmp/dismiss.ps1')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    wb.Save()
finally:
    watcher.terminate()""")
open(p, 'w', encoding='utf-8').write(s)
print('ok')
