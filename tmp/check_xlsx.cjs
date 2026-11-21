const ExcelJS = require('exceljs');

(async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(process.argv[2]);
    console.log('sheets:', wb.worksheets.map((w) => `${w.name}[${w.state}]`).join(', '));
    const login = wb.getWorksheet('Login');
    console.log('activeTab:', JSON.stringify(wb.views));
    for (const a of ['C7', 'C8', 'H1', 'C10', 'C11', 'B13']) {
        const c = login.getCell(a);
        console.log(a, JSON.stringify(c.value), 'locked=', c.protection && c.protection.locked);
    }
    console.log('login protected:', !!login.sheetProtection, JSON.stringify(login.sheetProtection));
    console.log('menu:', [16, 17, 18].map((r) => `${login.getCell(r, 2).value} -> ${login.getCell(r, 3).value && login.getCell(r, 3).value.hyperlink}`).join(' | '));
    const akun = wb.getWorksheet('AKUN');
    console.log('akun B2/C2:', akun.getCell('B2').value, akun.getCell('C2').value);
    const pg = wb.getWorksheet('Pengadaan');
    console.log('Pengadaan C4:', JSON.stringify(pg.getCell('C4').value));
    const toc = wb.getWorksheet('Daftar Isi');
    console.log('toc rows:', [6, 7, 8].map((r) => toc.getCell(r, 2).value).join(' | '));
    console.log('toc hyperlink r6:', JSON.stringify(toc.getCell(6, 4).value));
})();
