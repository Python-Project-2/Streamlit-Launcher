// Jalankan dari folder src ekstensi:  node apply-journal-patch.js
// Menyesuaikan struktur bab Journal.ts dengan contoh kelompok.pdf
const fs = require('fs');
const file = 'Journal.ts';
let s = fs.readFileSync(file, 'utf8');

function rep(from, to, label) {
	if (!s.includes(from)) { console.error('TIDAK DITEMUKAN: ' + label); process.exitCode = 1; return; }
	s = s.replace(from, to);
	console.log('OK: ' + label);
}

// I. Pendahuluan: tanpa sub-bab (seperti contoh), hanya paragraf
rep("sub('Latar Belakang');", '', 'hapus sub Latar Belakang');
rep("sub('Rumusan Masalah dan Tujuan');", '', 'hapus sub Rumusan Masalah dan Tujuan');
rep("sub('Manfaat dan Ruang Lingkup');", '', 'hapus sub Manfaat dan Ruang Lingkup');
const bul = /ul\(\[\s*'Manfaat praktis:[\s\S]*?\]\);/;
if (bul.test(s)) {
	s = s.replace(bul, "p(`Ruang lingkup artikel ini adalah satu berkas data (\"${fileName}\", lembar \"${sheet.name}\") yang dianalisis secara otomatis tanpa intervensi manual. Hasilnya bersifat deskriptif dan asosiatif sehingga tidak membuktikan hubungan sebab-akibat, dan diharapkan bermanfaat sebagai gambaran cepat kondisi data serta contoh alur analisis eksploratif yang terdokumentasi dan dapat diulang.`);");
	console.log('OK: bullet Manfaat -> paragraf');
} else { console.error('TIDAK DITEMUKAN: bullet Manfaat'); process.exitCode = 1; }

// III. Metode Penelitian: tanpa sub-bab (seperti contoh)
rep("sub('Desain dan Sumber Data');", '', 'hapus sub Desain dan Sumber Data');
rep("sub('Definisi Operasional dan Parameter');", '', 'hapus sub Definisi Operasional');
rep("sub('Tahapan Analisis');", '', 'hapus sub Tahapan Analisis');
rep("sub('Validitas dan Reproduksibilitas');", '', 'hapus sub Validitas');

// Keterbatasan: jadi sub-bab terakhir di IV, bukan bab sendiri
rep("h1('V. Keterbatasan Penelitian');", "sub('Keterbatasan Penelitian');", 'Keterbatasan -> sub-bab IV');

// V. Penutup (A. Kesimpulan, B. Saran) seperti contoh
rep("h1('VI. Penutup');", "h1('V. Penutup');", 'VI. Penutup -> V. Penutup');

fs.writeFileSync(file, s);
