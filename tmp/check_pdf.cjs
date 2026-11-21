const fs = require('fs');
const { PDFDocument, PDFName, PDFArray } = require('pdf-lib');

(async () => {
    const pdf = await PDFDocument.load(fs.readFileSync(process.argv[2]));
    let annots = 0;
    let uris = 0;
    for (const page of pdf.getPages()) {
        const arr = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
        if (!arr) { continue; }
        annots += arr.size();
        for (let i = 0; i < arr.size(); i++) {
            const a = arr.lookup(i);
            const action = a && a.lookup && a.lookup(PDFName.of('A'));
            if (action && action.lookup(PDFName.of('URI'))) { uris++; }
        }
    }
    console.log('pages', pdf.getPageCount(), 'annots', annots, 'uri actions', uris);
})();
