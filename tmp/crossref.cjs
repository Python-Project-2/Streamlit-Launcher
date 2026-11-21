// Scratch: cari kandidat referensi 2022-2026 di Crossref untuk tiap topik.
const topics = [
    ['dq-review', 'data quality assessment dimensions systematic review'],
    ['dq-governance', 'data quality monitoring governance analytics'],
    ['preprocess', 'data preprocessing machine learning review'],
    ['wrangling', 'data wrangling preparation systematic review'],
    ['missing', 'missing data imputation review'],
    ['outlier', 'outlier detection survey tabular data'],
    ['descriptive', 'descriptive statistics reporting guide'],
    ['correlation', 'correlation coefficient interpretation guide'],
    ['regression', 'linear regression practice guide'],
    ['chisquare', 'chi-square test independence categorical variables'],
    ['effectsize', 'effect size p-value limitations'],
    ['visualization', 'data visualization principles charts'],
    ['inventory', 'inventory management review'],
    ['abc', 'ABC classification inventory'],
    ['eoq', 'economic order quantity safety stock'],
    ['decisiontree', 'decision tree C4.5 classification review'],
    ['interpretable', 'interpretable machine learning high stakes decisions'],
    ['metrics', 'classification evaluation metrics review'],
    ['method-id', 'metode penelitian kuantitatif'],
];

const q = (s) => encodeURIComponent(s);
const pick = (m) => {
    const a = (m.author || []).map((x) => `${x.family || ''}${x.given ? ', ' + x.given : ''}`).join('; ');
    return {
        doi: m.DOI,
        year: (m.issued && m.issued['date-parts'][0][0]) || '',
        title: (m.title || [''])[0],
        venue: (m['container-title'] || [''])[0],
        vol: m.volume || '', issue: m.issue || '', page: m.page || '',
        authors: a,
    };
};

(async () => {
    for (const [id, text] of topics) {
        const url = `https://api.crossref.org/works?query.bibliographic=${q(text)}&filter=from-pub-date:2022-01-01,until-pub-date:2026-12-31,type:journal-article&rows=4&select=DOI,title,author,issued,container-title,volume,issue,page&mailto=admin@example.ac.id`;
        try {
            const r = await fetch(url, { headers: { 'User-Agent': 'date-skunder-refcheck/1.0 (mailto:admin@example.ac.id)' } });
            const j = await r.json();
            console.log(`\n## ${id} :: ${text}`);
            for (const m of j.message.items) {
                const c = pick(m);
                console.log(`- ${c.year} | ${c.authors.split(';')[0]} | ${c.title.slice(0, 95)} | ${c.venue.slice(0, 45)} ${c.vol}(${c.issue}) ${c.page} | https://doi.org/${c.doi}`);
            }
        } catch (e) {
            console.log(`\n## ${id} ERROR ${e.message}`);
        }
        await new Promise((r) => setTimeout(r, 400));
    }
})();
