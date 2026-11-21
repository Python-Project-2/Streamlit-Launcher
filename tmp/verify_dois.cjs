const dois = [
    '10.1016/j.procs.2024.03.008',
    '10.11591/eei.v12i6.5667',
    '10.1007/s00778-022-00775-9',
    '10.1145/3711118',
    '10.18637/jss.v105.i07',
    '10.7717/peerj-cs.2119',
    '10.1016/j.cosrev.2022.100463',
    '10.1016/j.neucom.2023.126634',
    '10.21449/ijate.1101295',
    '10.54729/ktpe9512',
    '10.1177/00222429231216910',
    '10.58578/tsaqofah.v4i5.3586',
    '10.9734/ajpas/2022/v18i430454',
    '10.1016/j.matpr.2022.09.298',
    '10.1080/21681015.2022.2037761',
    '10.24425/mper.2022.142391',
    '10.3390/su16135544',
    '10.33395/sinkron.v7i1.11243',
    '10.9734/jeai/2022/v44i730833',
    '10.1038/s43586-022-00172-0',
    '10.1162/tacl_a_00675',
    '10.3390/math13162609',
    '10.5336/biostatic.2022-89212',
    '10.1002/ecm.1557',
    '10.3389/frai.2026.1794271',
    '10.7717/peerj-cs.2730',
    '10.1016/j.heliyon.2025.e42777',
    '10.3390/e25040671',
    '10.1177/14738716251409351',
    '10.1007/978-3-031-38747-0',
    '10.1016/j.inffus.2021.11.011',
];

const fmt = (a) => {
    if (!a) { return '?'; }
    const initials = (g) => (g || '').split(/[\s.-]+/).filter(Boolean).map((p) => p[0].toUpperCase() + '.').join(' ');
    return `${a.family || a.name || '?'}, ${initials(a.given)}`.trim();
};

(async () => {
    for (const doi of dois) {
        try {
            const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}?mailto=admin@example.ac.id`, {
                headers: { 'User-Agent': 'date-skunder-refcheck/1.0 (mailto:admin@example.ac.id)' },
            });
            if (!r.ok) { console.log(`FAIL ${doi} HTTP ${r.status}`); continue; }
            const m = (await r.json()).message;
            const year = (m.issued && m.issued['date-parts'][0][0]) || (m.published && m.published['date-parts'][0][0]) || '';
            console.log(`${doi}\n  ${(m.title || [''])[0]}\n  ${(m.author || []).map(fmt).join('; ')}\n  ${(m['container-title'] || [''])[0]} | ${year} | vol ${m.volume || '-'} no ${m.issue || '-'} pp ${m.page || '-'} art ${m['article-number'] || '-'} | type ${m.type}`);
        } catch (e) {
            console.log(`ERR ${doi} ${e.message}`);
        }
        await new Promise((res) => setTimeout(res, 350));
    }
})();
