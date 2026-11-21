const topics = [
    ['dt', 'decision tree classifier comprehensive review applications'],
    ['dt2', 'decision tree algorithms survey classification ensemble'],
    ['chi', 'chi-square test independence tutorial applied research'],
    ['chi2', 'Pearson chi-square test categorical data analysis guide'],
];
const q = (s) => encodeURIComponent(s);

(async () => {
    for (const [id, text] of topics) {
        const url = `https://api.crossref.org/works?query.bibliographic=${q(text)}&filter=from-pub-date:2022-01-01,until-pub-date:2026-12-31,type:journal-article&rows=8&select=DOI,title,author,issued,container-title,volume,issue,page,is-referenced-by-count&mailto=admin@example.ac.id`;
        const j = await (await fetch(url, { headers: { 'User-Agent': 'refcheck/1.0 (mailto:admin@example.ac.id)' } })).json();
        console.log(`\n## ${id}`);
        for (const m of j.message.items) {
            const year = (m.issued && m.issued['date-parts'][0][0]) || '';
            const a = (m.author || []).map((x) => x.family).filter(Boolean);
            console.log(`- ${year} | cites ${m['is-referenced-by-count']} | ${a.slice(0, 3).join(', ')} | ${(m.title || [''])[0].slice(0, 80)} | ${(m['container-title'] || [''])[0].slice(0, 40)} ${m.volume || ''}(${m.issue || ''}) ${m.page || ''} | ${m.DOI}`);
        }
        await new Promise((r) => setTimeout(r, 600));
    }
})();
