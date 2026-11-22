p = 'tmp/build_xlsm.py'
s = open(p, encoding='utf-8').read()
s = s.replace("""# Simpan dalam keadaan terkunci
print('step: cetak selesai', flush=True): tanpa makro pun hanya halaman login yang terlihat.""",
"""print('step: cetak selesai', flush=True)
# Simpan dalam keadaan terkunci: tanpa makro pun hanya halaman login yang terlihat.""")
open(p, 'w', encoding='utf-8').write(s)
print('fixed')
