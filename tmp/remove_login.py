p = 'src/excelGenerator.ts'
s = open(p, encoding='utf-8', newline='').read()

# 1) hapus blok halaman login + AKUN
start = s.index('    // ───── Halaman Login: gerbang aplikasi ─────')
end = s.index("    const wsToc = wb.addWorksheet('Daftar Isi'")
s = s[:start] + s[end:]

# 2) hapus menu aplikasi pada halaman login
start = s.index('    // ── Menu aplikasi pada halaman Login')
end = s.index('    fillToc(wb, wsToc, fileName, {')
s = s[:start] + s[end:]

# 3) hapus deskripsi Login pada daftar isi
lines = s.split('\n')
lines = [ln for ln in lines if "'Login': 'Halaman masuk aplikasi" not in ln]
s = '\n'.join(lines)

# 4) hapus pengaturan cetak halaman login
start = s.index('    // Halaman login dicetak satu halaman penuh')
end = s.index('    wb.views = [', start)
s = s[:start] + s[end:]

open(p, 'w', encoding='utf-8', newline='').write(s)
print('login removed:', 'Halaman Login' not in s, 'wsL' not in s, "'Login'" not in s)
