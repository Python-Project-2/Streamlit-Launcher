// Scratch: kandidat referensi 2022-2026, urut relevansi + jumlah sitasi.
const topics = [
    ['preprocess', 'data preprocessing techniques machine learning review'],
    ['missing', 'missing data imputation methods review comparison'],
    ['correlation', 'correlation analysis guide interpretation social sciences'],
    ['regression', 'simple linear regression tutorial interpretation'],
    ['chisquare', 'chi-square test independence association guide'],
    ['effectsize', 'effect size statistical significance reporting'],
    ['visualization', 'data visualization principles review'],
    ['abc', 'ABC analysis inventory classification review'],
    ['decisiontree', 'decision tree algorithms review classification'],
    ['crossval', 'cross-validation model selection review'],
    ['overfit', 'overfitting machine learning causes remedies review'],
    ['kappa', 'Cohen kappa agreement coefficient interpretation'],
    ['dq', 'data quality dimensions assessment review'],
    ['eda', 'exploratory data analysis review'],
    ['inventory', 'inventory control models review demand'],
];

const q = (s) => encodeURIComponent(s);

(async () => {
    for (const [id, text] of topics) {
        const url = `https://api.crossref.org/works?query.bibliographic=${q(text)}&filter=from-pub-date:2022-01-01,until-pub-date:2026-12-31,type:journal-article&rows=5&select=DOI,title,author,issued,container-title,volume,issue,page,is-referenced-by-count&mailto=admin@example.ac.id`;
        try {
            const r = await fetch(url, { headers: { 'User-Agent': 'date-skunder-refcheck/1.0 (mailto:admin@example.ac.id)' } });
            const j = await r.json();
            console.log(`\n## ${id}`);
            for (const m of j.message.items) {
                const year = (m.issued && m.issued['date-parts'][0][0]) || '';
                const a = (m.author || []).map((x) => x.family || '').filter(Boolean);
                console.log(`- ${year} | cites ${m['is-referenced-by-count']} | ${a.slice(0, 3).join(', ')} | ${(m.title || [''])[0].slice(0, 90)} | ${(m['container-title'] || [''])[0].slice(0, 42)} ${m.volume || ''}(${m.issue || ''}) ${m.page || ''} | ${m.DOI}`);
            }
        } catch (e) {
            console.log(`\n## ${id} ERROR ${e.message}`);
        }
        await new Promise((r) => setTimeout(r, 500));
    }
})();
