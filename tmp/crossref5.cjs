const q = (s) => encodeURIComponent(s);
const searches = [
    ['iqr', 'interquartile range boxplot outlier detection method'],
    ['cramer', "Cramer's V effect size categorical association"],
];
const dois = [
    '10.1177/14653125221076142',
    '10.1037/met0000612',
    '10.3126/irjmmc.v6i1.77479',
    '10.21776/csefb.2022.01.3.08',
];
const fmt = (a) => `${a.family || '?'}, ${(a.given || '').split(/[\s.-]+/).filter(Boolean).map((p) => p[0].toUpperCase() + '.').join(' ')}`;

(async () => {
    for (const [id, text] of searches) {
        const url = `https://api.crossref.org/works?query.bibliographic=${q(text)}&filter=from-pub-date:2022-01-01,until-pub-date:2026-12-31,type:journal-article&rows=5&select=DOI,title,author,issued,container-title,volume,issue,page,is-referenced-by-count&mailto=admin@example.ac.id`;
        const j = await (await fetch(url, { headers: { 'User-Agent': 'refcheck/1.0 (mailto:admin@example.ac.id)' } })).json();
        console.log(`\n## ${id}`);
        for (const m of j.message.items) {
            const year = (m.issued && m.issued['date-parts'][0][0]) || '';
            console.log(`- ${year} | cites ${m['is-referenced-by-count']} | ${(m.author || []).map((x) => x.family).slice(0, 3).join(', ')} | ${(m.title || [''])[0].slice(0, 85)} | ${(m['container-title'] || [''])[0].slice(0, 38)} ${m.volume || ''}(${m.issue || ''}) ${m.page || ''} | ${m.DOI}`);
        }
        await new Promise((r) => setTimeout(r, 500));
    }
    console.log('\n## verify');
    for (const doi of dois) {
        const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}?mailto=admin@example.ac.id`, { headers: { 'User-Agent': 'refcheck/1.0' } });
        if (!r.ok) { console.log(`FAIL ${doi} ${r.status}`); continue; }
        const m = (await r.json()).message;
        const year = (m.issued && m.issued['date-parts'][0][0]) || '';
        console.log(`${doi}\n  ${(m.title || [''])[0]}\n  ${(m.author || []).map(fmt).join('; ')}\n  ${(m['container-title'] || [''])[0]} | ${year} | ${m.volume || '-'}(${m.issue || '-'}) ${m.page || '-'} art ${m['article-number'] || '-'} | ${m.type}`);
        await new Promise((res) => setTimeout(res, 350));
    }
})();
