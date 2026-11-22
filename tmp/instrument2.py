p = 'tmp/build_xlsm.py'
s = open(p, encoding='utf-8').read()
s = s.replace("wb = xl.Workbooks.Open(WORK)", "wb = xl.Workbooks.Open(WORK)\nprint('step: open', flush=True)", 1)
s = s.replace("    akun.Visible = 2", "    akun.Visible = 2\nprint('step: akun', flush=True)", 1)
s = s.replace("login.Name = 'LOGIN'", "login.Name = 'LOGIN'\nprint('step: login sheet', flush=True)", 1)
open(p, 'w', encoding='utf-8').write(s)
print('ok')
