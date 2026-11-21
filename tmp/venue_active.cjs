// Scratch: cek aktivitas jurnal sumber (apakah masih menerbitkan 2025-2026).
const venues = [
    'Procedia Computer Science',
    'Heliyon',
    'Bulletin of Electrical Engineering and Informatics',
    'The VLDB Journal',
    'ACM Computing Surveys',
    'Journal of Statistical Software',
    'Psychological Methods',
    'PeerJ Computer Science',
    'Journal of Information System Research',
    'Computer Science Review',
    'Neurocomputing',
    'International Journal of Assessment Tools in Education',
    'BAU Journal - Science and Technology',
    'TSAQOFAH',
    'International Research Journal of MMC',
    'Journal of Marketing',
    'Journal of Orthodontics',
    'Asian Journal of Probability and Statistics',
    'Information Visualization',
    'Sustainability',
    'Materials Today: Proceedings',
    'Journal of Industrial and Production Engineering',
    'Management and Production Engineering Review',
    'Contemporary Studies in Economic, Finance and Banking',
    'Journal of Experimental Agriculture International',
    'Sinkron',
    'Transactions of the Association for Computational Linguistics',
    'Mathematics',
    'Turkiye Klinikleri Journal of Biostatistics',
    'Ecological Monographs',
    'Frontiers in Artificial Intelligence',
    'Nature Reviews Methods Primers',
    'Information Fusion',
    'Advances in Neural Information Processing Systems',
];

(async () => {
    for (const v of venues) {
        const url = `https://api.crossref.org/works?query.container-title=${encodeURIComponent(v)}&filter=from-pub-date:2025-01-01,type:journal-article&rows=3&select=DOI,title,issued,container-title&mailto=admin@example.ac.id`;
        try {
            const r = await fetch(url, { headers: { 'User-Agent': 'refcheck/1.0 (mailto:admin@example.ac.id)' } });
            const j = await r.json();
            const items = j.message.items.filter((m) => (m['container-title'] || [''])[0].toLowerCase().includes(v.toLowerCase().slice(0, 18)));
            const ys = items.map((m) => (m.issued && m.issued['date-parts'][0][0]) || '?').join(',');
            console.log(`${items.length ? 'AKTIF ' : 'CEK   '} ${v} -> ${ys || '-'}`);
        } catch (e) {
            console.log(`ERR   ${v} ${e.message}`);
        }
        await new Promise((res) => setTimeout(res, 350));
    }
})();
