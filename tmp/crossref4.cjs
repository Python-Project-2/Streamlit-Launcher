const topics = [
    ['corr', 'correlation coefficients appropriate use interpretation guide'],
    ['reg', 'simple linear regression analysis step by step guide'],
    ['gini', 'Gini coefficient measurement inequality review'],
    ['hhi', 'Herfindahl Hirschman index market concentration measurement'],
    ['indostat', 'buku statistik penelitian analisis regresi'],
];

const q = (s) => encodeURIComponent(s);

(async () => {
    for (const [id, text] of topics) {
        const url = `https://api.crossref.org/works?query.bibliographic=${q(text)}&filter=from-pub-date:2022-01-01,until-pub-date:2026-12-31&rows=6&select=DOI,title,author,issued,container-title,volume,issue,page,is-referenced-by-count,type&mailto=admin@example.ac.id`;
        try {
            const r = await fetch(url, { headers: { 'User-Agent': 'date-skunder-refcheck/1.0 (mailto:admin@example.ac.id)' } });
            const j = await r.json();
            console.log(`\n## ${id}`);
            for (const m of j.message.items) {
                const year = (m.issued && m.issued['date-parts'][0][0]) || '';
                const a = (m.author || []).map((x) => x.family || '').filter(Boolean);
                console.log(`- ${year} | ${m.type} | cites ${m['is-referenced-by-count']} | ${a.slice(0, 3).join(', ')} | ${(m.title || [''])[0].slice(0, 85)} | ${(m['container-title'] || [''])[0].slice(0, 38)} ${m.volume || ''}(${m.issue || ''}) ${m.page || ''} | ${m.DOI}`);
            }
        } catch (e) {
            console.log(`\n## ${id} ERROR ${e.message}`);
        }
        await new Promise((r) => setTimeout(r, 600));
    }
})();
