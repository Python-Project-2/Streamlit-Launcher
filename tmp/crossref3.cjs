const topics = [
    ['missing', 'handling missing data review methods practice'],
    ['corr', 'Pearson correlation coefficient review interpretation'],
    ['reg', 'regression analysis practical guide researchers'],
    ['desc', 'skewness kurtosis normality descriptive statistics guide'],
    ['abc', 'ABC analysis inventory classification multi-criteria review'],
    ['eoq', 'economic order quantity model review'],
    ['conc', 'Herfindahl Hirschman index concentration Gini coefficient'],
    ['entropy', 'information entropy decision tree split measure'],
    ['dtreview', 'decision trees overview classification regression'],
    ['leakage', 'data leakage machine learning causes detection'],
    ['fair', 'FAIR data principles implementation review'],
    ['metrics2', 'precision recall F1 score evaluation classifier tutorial'],
    ['dqml', 'data quality machine learning datasets assessment framework'],
    ['indostat', 'statistik deskriptif analisis data penelitian'],
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
                console.log(`- ${year} | cites ${m['is-referenced-by-count']} | ${a.slice(0, 3).join(', ')} | ${(m.title || [''])[0].slice(0, 88)} | ${(m['container-title'] || [''])[0].slice(0, 40)} ${m.volume || ''}(${m.issue || ''}) ${m.page || ''} | ${m.DOI}`);
            }
        } catch (e) {
            console.log(`\n## ${id} ERROR ${e.message}`);
        }
        await new Promise((r) => setTimeout(r, 600));
    }
})();
