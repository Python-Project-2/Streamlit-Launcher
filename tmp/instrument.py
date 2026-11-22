p = 'tmp/build_xlsm.py'
s = open(p, encoding='utf-8').read()
marks = [
    ("# ── halaman DASHBOARD ──", "# ── halaman DASHBOARD ──\nprint('step: login selesai', flush=True)"),
    ("# ── data bantu ──", "# ── data bantu ──\nprint('step: dashboard selesai', flush=True)"),
    ("# ── chart ──", "# ── chart ──\nprint('step: dash_data selesai', flush=True)"),
    ("# ── VBA ──", "# ── VBA ──\nprint('step: chart selesai', flush=True)"),
    ("# pengaturan cetak", "# pengaturan cetak\nprint('step: vba selesai', flush=True)"),
    ("# Simpan dalam keadaan terkunci", "# Simpan dalam keadaan terkunci\nprint('step: cetak selesai', flush=True)"),
]
for old, new in marks:
    if old in s:
        s = s.replace(old, new, 1)
open(p, 'w', encoding='utf-8').write(s)
print('instrumented')
