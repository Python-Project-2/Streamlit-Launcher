import type { ColType, SheetResult } from './analysis';
import type { DecisionTreeNode } from './decisionTree';
import { hbarChart, histChart, lineChart, matrixChart, scatterChart, STATUS_COLORS, flowChart } from './chartImages';
import type { Chart } from './chartImages';
import { layoutFlow } from './workflow';
export type Align = 'l' | 'r' | 'c';
export type Block =
	| { t: 'h1' | 'h2' | 'h3'; text: string }
	| { t: 'p'; text: string }
	| { t: 'formula'; text: string }
	| { t: 'bullets'; items: string[] }
	| { t: 'callout'; title: string; text: string }
	| { t: 'table'; no: number; caption: string; head: string[]; rows: string[][]; align?: Align[] }
	| { t: 'figure'; no: number; caption: string; png: Uint8Array; w: number; h: number }
	| { t: 'pagebreak' };

export interface RefRun { text: string; i?: boolean }
export interface JournalMeta { author: string; affiliation: string; email: string }
export interface Journal {
	title: string;
	author: string;
	affiliation: string;
	email: string;
	date: string;
	abstractId: string;
	keywordsId: string;
	abstractEn: string;
	keywordsEn: string;
	blocks: Block[];
	refRuns: RefRun[][];
	references: string[];
	appendix: Block[];
}

// ───────── Referensi (APA 6, gaya Mendeley) ─────────
interface Ref { first: string; next: string; runs: RefRun[] }
const t = (text: string): RefRun => ({ text });
const it = (text: string): RefRun => ({ text, i: true });
const same = (s: string, runs: RefRun[]): Ref => ({ first: s, next: s, runs });
const REF: Record<string, Ref> = {
	// — kualitas data & data mining —
	wang96: same('Wang & Strong, 1996', [t('Wang, R. Y., & Strong, D. M. (1996). Beyond accuracy: What data quality means to data consumers. '), it('Journal of Management Information Systems'), t(', '), it('12'), t('(4), 5–33. https://doi.org/10.1080/07421222.1996.11518099')]),
	pipino02: same('Pipino, Lee, & Wang, 2002', [t('Pipino, L. L., Lee, Y. W., & Wang, R. Y. (2002). Data quality assessment. '), it('Communications of the ACM'), t(', '), it('45'), t('(4), 211–218. https://doi.org/10.1145/505248.506010')]),
	batini09: { first: 'Batini, Cappiello, Francalanci, & Maurino, 2009', next: 'Batini et al., 2009', runs: [t('Batini, C., Cappiello, C., Francalanci, C., & Maurino, A. (2009). Methodologies for data quality assessment and improvement. '), it('ACM Computing Surveys'), t(', '), it('41'), t('(3), Article 16. https://doi.org/10.1145/1541880.1541883')] },
	whang23: { first: 'Whang, Roh, Song, & Lee, 2023', next: 'Whang et al., 2023', runs: [t('Whang, S. E., Roh, Y., Song, H., & Lee, J.-G. (2023). Data collection and quality challenges in deep learning: A data-centric AI perspective. '), it('The VLDB Journal'), t(', '), it('32'), t('(4), 791–813. https://doi.org/10.1007/s00778-022-00775-9')] },
	zha25: { first: 'Zha et al., 2025', next: 'Zha et al., 2025', runs: [t('Zha, D., Bhat, Z. P., Lai, K.-H., Yang, F., Jiang, Z., Zhong, S., & Hu, X. (2025). Data-centric artificial intelligence: A survey. '), it('ACM Computing Surveys'), t(', '), it('57'), t('(5), Article 129. https://doi.org/10.1145/3711118')] },
	sambasivan21: { first: 'Sambasivan et al., 2021', next: 'Sambasivan et al., 2021', runs: [t('Sambasivan, N., Kapania, S., Highfill, H., Akrong, D., Paritosh, P., & Aroyo, L. M. (2021). “Everyone wants to do the model work, not the data work”: Data cascades in high-stakes AI. In '), it('Proceedings of the 2021 CHI Conference on Human Factors in Computing Systems'), t(' (Article 39). New York, NY: ACM. https://doi.org/10.1145/3411764.3445518')] },
	northcutt21: { first: 'Northcutt, Jiang, & Chuang, 2021', next: 'Northcutt et al., 2021', runs: [t('Northcutt, C., Jiang, L., & Chuang, I. (2021). Confident learning: Estimating uncertainty in dataset labels. '), it('Journal of Artificial Intelligence Research'), t(', '), it('70'), t(', 1373–1411. https://doi.org/10.1613/jair.1.12125')] },
	wilkinson16: { first: 'Wilkinson et al., 2016', next: 'Wilkinson et al., 2016', runs: [t('Wilkinson, M. D., Dumontier, M., Aalbersberg, I. J., Appleton, G., Axton, M., Baak, A., … Mons, B. (2016). The FAIR Guiding Principles for scientific data management and stewardship. '), it('Scientific Data'), t(', '), it('3'), t(', 160018. https://doi.org/10.1038/sdata.2016.18')] },
	wickham14: same('Wickham, 2014', [t('Wickham, H. (2014). Tidy data. '), it('Journal of Statistical Software'), t(', '), it('59'), t('(10), 1–23. https://doi.org/10.18637/jss.v059.i10')]),
	han12: { first: 'Han, Kamber, & Pei, 2012', next: 'Han et al., 2012', runs: [t('Han, J., Kamber, M., & Pei, J. (2012). '), it('Data mining: Concepts and techniques'), t(' (3rd ed.). Waltham, MA: Morgan Kaufmann.')] },
	han22: { first: 'Han, Pei, & Tong, 2022', next: 'Han et al., 2022', runs: [t('Han, J., Pei, J., & Tong, H. (2022). '), it('Data mining: Concepts and techniques'), t(' (4th ed.). Cambridge, MA: Morgan Kaufmann.')] },
	witten16: { first: 'Witten, Frank, Hall, & Pal, 2016', next: 'Witten et al., 2016', runs: [t('Witten, I. H., Frank, E., Hall, M. A., & Pal, C. J. (2016). '), it('Data mining: Practical machine learning tools and techniques'), t(' (4th ed.). Cambridge, MA: Morgan Kaufmann.')] },
	kusrini09: { first: 'Kusrini & Luthfi, 2009', next: 'Kusrini & Luthfi, 2009', runs: [t('Kusrini, & Luthfi, E. T. (2009). '), it('Algoritma data mining'), t('. Yogyakarta: Andi Offset.')] },
	santosa07: same('Santosa, 2007', [t('Santosa, B. (2007). '), it('Data mining: Teknik pemanfaatan data untuk keperluan bisnis'), t('. Yogyakarta: Graha Ilmu.')]),
	// — data hilang, outlier, statistik —
	little02: { first: 'Little & Rubin, 2002', next: 'Little & Rubin, 2002', runs: [t('Little, R. J. A., & Rubin, D. B. (2002). '), it('Statistical analysis with missing data'), t(' (2nd ed.). Hoboken, NJ: John Wiley & Sons.')] },
	rubin76: same('Rubin, 1976', [t('Rubin, D. B. (1976). Inference and missing data. '), it('Biometrika'), t(', '), it('63'), t('(3), 581–592. https://doi.org/10.1093/biomet/63.3.581')]),
	schafer02: { first: 'Schafer & Graham, 2002', next: 'Schafer & Graham, 2002', runs: [t('Schafer, J. L., & Graham, J. W. (2002). Missing data: Our view of the state of the art. '), it('Psychological Methods'), t(', '), it('7'), t('(2), 147–177. https://doi.org/10.1037/1082-989X.7.2.147')] },
	kots06: { first: 'Kotsiantis, Kanellopoulos, & Pintelas, 2006', next: 'Kotsiantis et al., 2006', runs: [t('Kotsiantis, S. B., Kanellopoulos, D., & Pintelas, P. E. (2006). Data preprocessing for supervised learning. '), it('International Journal of Computer Science'), t(', '), it('1'), t('(2), 111–117.')] },
	tukey77: same('Tukey, 1977', [t('Tukey, J. W. (1977). '), it('Exploratory data analysis'), t('. Reading, MA: Addison-Wesley.')]),
	hodge04: { first: 'Hodge & Austin, 2004', next: 'Hodge & Austin, 2004', runs: [t('Hodge, V. J., & Austin, J. (2004). A survey of outlier detection methodologies. '), it('Artificial Intelligence Review'), t(', '), it('22'), t('(2), 85–126. https://doi.org/10.1023/B:AIRE.0000045502.10941.a9')] },
	aggarwal17: same('Aggarwal, 2017', [t('Aggarwal, C. C. (2017). '), it('Outlier analysis'), t(' (2nd ed.). Cham: Springer.')]),
	joanes98: { first: 'Joanes & Gill, 1998', next: 'Joanes & Gill, 1998', runs: [t('Joanes, D. N., & Gill, C. A. (1998). Comparing measures of sample skewness and kurtosis. '), it('Journal of the Royal Statistical Society: Series D'), t(', '), it('47'), t('(1), 183–189. https://doi.org/10.1111/1467-9884.00122')] },
	field18: same('Field, 2018', [t('Field, A. (2018). '), it('Discovering statistics using IBM SPSS Statistics'), t(' (5th ed.). London: Sage.')]),
	sugiyono19: same('Sugiyono, 2019', [t('Sugiyono. (2019). '), it('Metode penelitian kuantitatif, kualitatif, dan R&D'), t('. Bandung: Alfabeta.')]),
	ghozali18: same('Ghozali, 2018', [t('Ghozali, I. (2018). '), it('Aplikasi analisis multivariate dengan program IBM SPSS 25'), t(' (9th ed.). Semarang: Badan Penerbit Universitas Diponegoro.')]),
	wasserstein16: { first: 'Wasserstein & Lazar, 2016', next: 'Wasserstein & Lazar, 2016', runs: [t('Wasserstein, R. L., & Lazar, N. A. (2016). The ASA’s statement on p-values: Context, process, and purpose. '), it('The American Statistician'), t(', '), it('70'), t('(2), 129–133. https://doi.org/10.1080/00031305.2016.1154108')] },
	sullivan12: { first: 'Sullivan & Feinn, 2012', next: 'Sullivan & Feinn, 2012', runs: [t('Sullivan, G. M., & Feinn, R. (2012). Using effect size—or why the P value is not enough. '), it('Journal of Graduate Medical Education'), t(', '), it('4'), t('(3), 279–282. https://doi.org/10.4300/JGME-D-12-00156.1')] },
	// — korelasi, regresi, asosiasi —
	pearson1895: same('Pearson, 1895', [t('Pearson, K. (1895). Note on regression and inheritance in the case of two parents. '), it('Proceedings of the Royal Society of London'), t(', '), it('58'), t(', 240–242. https://doi.org/10.1098/rspl.1895.0041')]),
	schober18: { first: 'Schober, Boer, & Schwarte, 2018', next: 'Schober et al., 2018', runs: [t('Schober, P., Boer, C., & Schwarte, L. A. (2018). Correlation coefficients: Appropriate use and interpretation. '), it('Anesthesia & Analgesia'), t(', '), it('126'), t('(5), 1763–1768. https://doi.org/10.1213/ANE.0000000000002864')] },
	akoglu18: same('Akoglu, 2018', [t('Akoglu, H. (2018). User’s guide to correlation coefficients. '), it('Turkish Journal of Emergency Medicine'), t(', '), it('18'), t('(3), 91–93. https://doi.org/10.1016/j.tjem.2018.08.001')]),
	cohen88: same('Cohen, 1988', [t('Cohen, J. (1988). '), it('Statistical power analysis for the behavioral sciences'), t(' (2nd ed.). Hillsdale, NJ: Lawrence Erlbaum Associates.')]),
	montgomery21: { first: 'Montgomery, Peck, & Vining, 2021', next: 'Montgomery et al., 2021', runs: [t('Montgomery, D. C., Peck, E. A., & Vining, G. G. (2021). '), it('Introduction to linear regression analysis'), t(' (6th ed.). Hoboken, NJ: John Wiley & Sons.')] },
	pearsonchi00: same('Pearson, 1900', [t('Pearson, K. (1900). On the criterion that a given system of deviations from the probable in the case of a correlated system of variables is such that it can be reasonably supposed to have arisen from random sampling. '), it('The London, Edinburgh, and Dublin Philosophical Magazine and Journal of Science'), t(', '), it('50'), t('(302), 157–175. https://doi.org/10.1080/14786440009463897')]),
	cramer46: same('Cramér, 1946', [t('Cramér, H. (1946). '), it('Mathematical methods of statistics'), t('. Princeton, NJ: Princeton University Press.')]),
	wilson31: { first: 'Wilson & Hilferty, 1931', next: 'Wilson & Hilferty, 1931', runs: [t('Wilson, E. B., & Hilferty, M. M. (1931). The distribution of chi-square. '), it('Proceedings of the National Academy of Sciences'), t(', '), it('17'), t('(12), 684–688. https://doi.org/10.1073/pnas.17.12.684')] },
	tufte01: same('Tufte, 2001', [t('Tufte, E. R. (2001). '), it('The visual display of quantitative information'), t(' (2nd ed.). Cheshire, CT: Graphics Press.')]),
	// — persediaan —
	silver98: { first: 'Silver, Pyke, & Peterson, 1998', next: 'Silver et al., 1998', runs: [t('Silver, E. A., Pyke, D. F., & Peterson, R. (1998). '), it('Inventory management and production planning and scheduling'), t(' (3rd ed.). New York, NY: John Wiley & Sons.')] },
	heizer14: { first: 'Heizer & Render, 2014', next: 'Heizer & Render, 2014', runs: [t('Heizer, J., & Render, B. (2014). '), it('Operations management: Sustainability and supply chain management'), t(' (11th ed.). Boston, MA: Pearson.')] },
	nahmias15: { first: 'Nahmias & Olsen, 2015', next: 'Nahmias & Olsen, 2015', runs: [t('Nahmias, S., & Olsen, T. L. (2015). '), it('Production and operations analysis'), t(' (7th ed.). Long Grove, IL: Waveland Press.')] },
	chopra19: { first: 'Chopra & Meindl, 2019', next: 'Chopra & Meindl, 2019', runs: [t('Chopra, S., & Meindl, P. (2019). '), it('Supply chain management: Strategy, planning, and operation'), t(' (7th ed.). New York, NY: Pearson.')] },
	waters03: same('Waters, 2003', [t('Waters, D. (2003). '), it('Inventory control and management'), t(' (2nd ed.). Chichester: John Wiley & Sons.')]),
	ramanathan06: same('Ramanathan, 2006', [t('Ramanathan, R. (2006). ABC inventory classification with multiple-criteria using weighted linear optimization. '), it('Computers & Operations Research'), t(', '), it('33'), t('(3), 695–700. https://doi.org/10.1016/j.cor.2004.07.014')]),
	harris13: same('Harris, 1913', [t('Harris, F. W. (1913). How many parts to make at once. '), it('Factory, The Magazine of Management'), t(', '), it('10'), t('(2), 135–136, 152.')]),
	gastwirth72: same('Gastwirth, 1972', [t('Gastwirth, J. L. (1972). The estimation of the Lorenz curve and Gini index. '), it('The Review of Economics and Statistics'), t(', '), it('54'), t('(3), 306–316. https://doi.org/10.2307/1937992')]),
	rhoades93: same('Rhoades, 1993', [t('Rhoades, S. A. (1993). The Herfindahl-Hirschman index. '), it('Federal Reserve Bulletin'), t(', '), it('79'), t('(3), 188–189.')]),
	// — decision tree & evaluasi —
	shannon48: same('Shannon, 1948', [t('Shannon, C. E. (1948). A mathematical theory of communication. '), it('Bell System Technical Journal'), t(', '), it('27'), t('(3), 379–423. https://doi.org/10.1002/j.1538-7305.1948.tb01338.x')]),
	quinlan86: same('Quinlan, 1986', [t('Quinlan, J. R. (1986). Induction of decision trees. '), it('Machine Learning'), t(', '), it('1'), t('(1), 81–106. https://doi.org/10.1007/BF00116251')]),
	quinlan93: same('Quinlan, 1993', [t('Quinlan, J. R. (1993). '), it('C4.5: Programs for machine learning'), t('. San Mateo, CA: Morgan Kaufmann.')]),
	breiman84: { first: 'Breiman, Friedman, Olshen, & Stone, 1984', next: 'Breiman et al., 1984', runs: [t('Breiman, L., Friedman, J. H., Olshen, R. A., & Stone, C. J. (1984). '), it('Classification and regression trees'), t('. Belmont, CA: Wadsworth.')] },
	hastie09: { first: 'Hastie, Tibshirani, & Friedman, 2009', next: 'Hastie et al., 2009', runs: [t('Hastie, T., Tibshirani, R., & Friedman, J. (2009). '), it('The elements of statistical learning: Data mining, inference, and prediction'), t(' (2nd ed.). New York, NY: Springer. https://doi.org/10.1007/978-0-387-84858-7')] },
	james23: { first: 'James, Witten, Hastie, Tibshirani, & Taylor, 2023', next: 'James et al., 2023', runs: [t('James, G., Witten, D., Hastie, T., Tibshirani, R., & Taylor, J. (2023). '), it('An introduction to statistical learning: With applications in Python'), t('. Cham: Springer. https://doi.org/10.1007/978-3-031-39189-7')] },
	pedregosa11: { first: 'Pedregosa et al., 2011', next: 'Pedregosa et al., 2011', runs: [t('Pedregosa, F., Varoquaux, G., Gramfort, A., Michel, V., Thirion, B., Grisel, O., … Duchesnay, E. (2011). Scikit-learn: Machine learning in Python. '), it('Journal of Machine Learning Research'), t(', '), it('12'), t(', 2825–2830.')] },
	kots07: same('Kotsiantis, 2007', [t('Kotsiantis, S. B. (2007). Supervised machine learning: A review of classification techniques. '), it('Informatica'), t(', '), it('31'), t('(3), 249–268.')]),
	sokolova09: { first: 'Sokolova & Lapalme, 2009', next: 'Sokolova & Lapalme, 2009', runs: [t('Sokolova, M., & Lapalme, G. (2009). A systematic analysis of performance measures for classification tasks. '), it('Information Processing & Management'), t(', '), it('45'), t('(4), 427–437. https://doi.org/10.1016/j.ipm.2009.03.002')] },
	powers11: same('Powers, 2011', [t('Powers, D. M. W. (2011). Evaluation: From precision, recall and F-measure to ROC, informedness, markedness and correlation. '), it('Journal of Machine Learning Technologies'), t(', '), it('2'), t('(1), 37–63.')]),
	grandini20: { first: 'Grandini, Bagli, & Visani, 2020', next: 'Grandini et al., 2020', runs: [t('Grandini, M., Bagli, E., & Visani, G. (2020). '), it('Metrics for multi-class classification: An overview'), t('. arXiv:2008.05756.')] },
	chicco20: { first: 'Chicco & Jurman, 2020', next: 'Chicco & Jurman, 2020', runs: [t('Chicco, D., & Jurman, G. (2020). The advantages of the Matthews correlation coefficient (MCC) over F1 score and accuracy in binary classification evaluation. '), it('BMC Genomics'), t(', '), it('21'), t(', Article 6. https://doi.org/10.1186/s12864-019-6413-7')] },
	cohen60: same('Cohen, 1960', [t('Cohen, J. (1960). A coefficient of agreement for nominal scales. '), it('Educational and Psychological Measurement'), t(', '), it('20'), t('(1), 37–46. https://doi.org/10.1177/001316446002000104')]),
	kohavi95: same('Kohavi, 1995', [t('Kohavi, R. (1995). A study of cross-validation and bootstrap for accuracy estimation and model selection. In '), it('Proceedings of the 14th International Joint Conference on Artificial Intelligence'), t(' (pp. 1137–1145). San Francisco, CA: Morgan Kaufmann.')]),
	hawkins04: same('Hawkins, 2004', [t('Hawkins, D. M. (2004). The problem of overfitting. '), it('Journal of Chemical Information and Computer Sciences'), t(', '), it('44'), t('(1), 1–12. https://doi.org/10.1021/ci0342472')]),
	kaufman12: { first: 'Kaufman, Rosset, Perlich, & Stitelman, 2012', next: 'Kaufman et al., 2012', runs: [t('Kaufman, S., Rosset, S., Perlich, C., & Stitelman, O. (2012). Leakage in data mining: Formulation, detection, and avoidance. '), it('ACM Transactions on Knowledge Discovery from Data'), t(', '), it('6'), t('(4), Article 15. https://doi.org/10.1145/2382577.2382579')] },
	rudin19: same('Rudin, 2019', [t('Rudin, C. (2019). Stop explaining black box machine learning models for high stakes decisions and use interpretable models instead. '), it('Nature Machine Intelligence'), t(', '), it('1'), t('(5), 206–215. https://doi.org/10.1038/s42256-019-0048-x')]),
	grinsz22: { first: 'Grinsztajn, Oyallon, & Varoquaux, 2022', next: 'Grinsztajn et al., 2022', runs: [t('Grinsztajn, L., Oyallon, E., & Varoquaux, G. (2022). Why do tree-based models still outperform deep learning on typical tabular data? '), it('Advances in Neural Information Processing Systems'), t(', '), it('35'), t(', 507–520.')] },
	shwartz22: { first: 'Shwartz-Ziv & Armon, 2022', next: 'Shwartz-Ziv & Armon, 2022', runs: [t('Shwartz-Ziv, R., & Armon, A. (2022). Tabular data: Deep learning is not all you need. '), it('Information Fusion'), t(', '), it('81'), t(', 84–90. https://doi.org/10.1016/j.inffus.2021.11.011')] },
	sheetjs: same('SheetJS, n.d.', [t('SheetJS. (n.d.). '), it('SheetJS community edition'), t(' [Perangkat lunak]. https://sheetjs.com')]),
};

const TYPE_SHORT: Record<ColType, string> = { number: 'Desimal', integer: 'Bulat', id: 'ID', date: 'Tanggal', boolean: 'Boolean', category: 'Kategori', text: 'Teks' };
const GRAN: Record<string, string> = { year: 'tahun', month: 'bulan', day: 'hari' };

const nf = (x: number | null | undefined, d = 2): string =>
	x === null || x === undefined || !isFinite(x) ? '-' : x.toLocaleString('id-ID', { maximumFractionDigits: d });
const pct = (x: number, d = 1) => `${nf(x, d)}%`;
const cut = (s: string, n = 40) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const and = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} dan ${a[a.length - 1]}`);
const noEmoji = (s: string) => s.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\uFE0F]/gu, '').replace(/\s+/g, ' ').trim();
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

const skewWord = (s: number) => (Math.abs(s) <= 0.5 ? 'simetris' : Math.abs(s) <= 1
	? (s > 0 ? 'miring kanan sedang' : 'miring kiri sedang') : (s > 0 ? 'miring kanan kuat' : 'miring kiri kuat'));
const cvWord = (v: number) => (v < 0.15 ? 'rendah' : v < 0.35 ? 'sedang' : 'tinggi');
const strength = (r: number) => (Math.abs(r) >= 0.7 ? 'Kuat' : Math.abs(r) >= 0.4 ? 'Sedang' : 'Lemah');
const cohenWord = (r: number) => (Math.abs(r) >= 0.5 ? 'Besar' : Math.abs(r) >= 0.3 ? 'Sedang' : Math.abs(r) >= 0.1 ? 'Kecil' : 'Diabaikan');

/** Regresi linear sederhana y = a + b x beserta r, R² dan statistik t. */
function regress(pts: [number, number][]) {
	const n = pts.length;
	const mx = sum(pts.map((p) => p[0])) / n, my = sum(pts.map((p) => p[1])) / n;
	const sxx = sum(pts.map((p) => (p[0] - mx) ** 2)), syy = sum(pts.map((p) => (p[1] - my) ** 2));
	const sxy = sum(pts.map((p) => (p[0] - mx) * (p[1] - my)));
	const b = sxx > 0 ? sxy / sxx : 0, a = my - b * mx;
	const r = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
	const r2 = r * r;
	const tStat = n > 2 && r2 < 1 ? r * Math.sqrt((n - 2) / (1 - r2)) : (r2 >= 1 ? Infinity : 0);
	return { n, a, b, r, r2, tStat };
}

/** Uji chi-kuadrat independensi + Cramér's V; nilai kritis dihampiri dengan Wilson-Hilferty (alpha = 0,05). */
function chiSquare(grid: number[][]) {
	const rowSum = grid.map((r) => sum(r));
	const colSum = grid[0]?.map((_, j) => sum(grid.map((r) => r[j]))) ?? [];
	const total = sum(rowSum);
	const ri = rowSum.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
	const ci = colSum.map((v, j) => (v > 0 ? j : -1)).filter((j) => j >= 0);
	if (total <= 0 || ri.length < 2 || ci.length < 2) { return null; }
	let chi = 0;
	for (const i of ri) {
		for (const j of ci) {
			const e = (rowSum[i] * colSum[j]) / total;
			if (e > 0) { chi += (grid[i][j] - e) ** 2 / e; }
		}
	}
	const df = (ri.length - 1) * (ci.length - 1);
	const v = Math.sqrt(chi / (total * Math.min(ri.length - 1, ci.length - 1)));
	const z = 1.6449, q = 2 / (9 * df);
	const crit = df * (1 - q + z * Math.sqrt(q)) ** 3;
	return { chi, df, v, crit, total, sig: chi > crit };
}

function gini(vals: number[]): number {
	const s = [...vals].filter((v) => v >= 0).sort((a, b) => a - b);
	const n = s.length, tot = sum(s);
	if (n < 2 || tot <= 0) { return 0; }
	let cum = 0;
	s.forEach((v, i) => { cum += (i + 1) * v; });
	return (2 * cum) / (n * tot) - (n + 1) / n;
}

function treeStats(node: DecisionTreeNode, depth = 0): { leaves: number; nodes: number; depth: number } {
	if (node.isLeaf || !node.children?.length) { return { leaves: 1, nodes: 1, depth }; }
	let leaves = 0, nodes = 1, d = depth;
	for (const ch of node.children) {
		const s = treeStats(ch, depth + 1);
		leaves += s.leaves; nodes += s.nodes; d = Math.max(d, s.depth);
	}
	return { leaves, nodes, depth: d };
}

export function buildJournal(sheet: SheetResult, fileName: string, meta: JournalMeta): Journal {
	const year = new Date().getFullYear();
	const refs: Record<string, Ref> = {
		...REF,
		tool: {
			first: `${meta.author}, ${year}`, next: `${meta.author}, ${year}`,
			runs: [t(`${meta.author}. (${year}). `), it('Date Skunder: Ekstensi analisis data dan penyusun artikel jurnal otomatis untuk Visual Studio Code'), t(' [Perangkat lunak].')],
		},
	};
	const seen = new Set<string>();
	const used = new Set<string>();
	/** Sitasi APA 6: kutipan pertama lengkap, kutipan berikutnya "et al." untuk 3+ penulis. */
	const c = (k: string) => { used.add(k); const r = refs[k]; const s = seen.has(k) ? r.next : r.first; seen.add(k); return s; };

	const B: Block[] = [];
	const APP: Block[] = [];
	let out: Block[] = B;
	let tN = 0, fN = 0, L = 0;
	const nextTab = () => tN + 1;
	const nextFig = () => fN + 1;
	const h1 = (text: string) => { L = 0; out.push({ t: 'h1', text }); };
	const sub = (text: string) => out.push({ t: 'h2', text: `${String.fromCharCode(65 + L++)}. ${text}` });
	const p = (text: string) => out.push({ t: 'p', text });
	const f = (text: string) => out.push({ t: 'formula', text });
	const ul = (items: string[]) => out.push({ t: 'bullets', items });
	const box = (title: string, text: string) => out.push({ t: 'callout', title, text });
	const tb = (caption: string, head: string[], rows: string[][], align?: Align[]) => { tN++; out.push({ t: 'table', no: tN, caption, head, rows, align }); };
	const fg = (caption: string, ch: Chart) => { fN++; out.push({ t: 'figure', no: fN, caption, png: ch.png, w: ch.w, h: ch.h }); };
	/** Tabel dua kolom (label, nilai). */
	const tb2 = (caption: string, h1Label: string, h2Label: string, items: { label: string; value: number }[], fm: (v: number) => string = (v) => nf(v)) =>
		tb(caption, [h1Label, h2Label], items.map((x) => [cut(x.label, 30), fm(x.value)]), ['l', 'r']);

	// ───────── data dasar ─────────
	const base = fileName.replace(/\.[^.]+$/, '');
	const hl = sheet.csvHealth;
	const n = sheet.totalRows;
	const pCols = sheet.headers.length;
	const numCols = sheet.columns.filter((x) => x.num);
	const catCols = sheet.columns.filter((x) => x.type === 'category');
	const dateCols = sheet.columns.filter((x) => x.type === 'date');
	const stock = sheet.stockAnalysis;
	const needs = sheet.needsAnalysis;
	const dt = sheet.decisionTreeAnalysis;
	const date = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
	const title = `Analisis Data Eksploratif Komprehensif${dt ? ' dan Klasifikasi Decision Tree C4.5' : ''}${stock ? ' serta Evaluasi Persediaan' : ''} pada Dataset ${base}`;
	const rating = hl.qualityScore >= 90 ? 'sangat baik' : hl.qualityScore >= 75 ? 'baik' : hl.qualityScore >= 50 ? 'cukup dan perlu pembersihan' : 'buruk dan perlu pembersihan menyeluruh';

	const pairs: { a: string; b: string; r: number }[] = [];
	const { cols: cc, matrix } = sheet.corr;
	for (let i = 0; i < cc.length; i++) {
		for (let j = i + 1; j < cc.length; j++) {
			const r = matrix[i][j];
			if (r !== null) { pairs.push({ a: cc[i], b: cc[j], r }); }
		}
	}
	pairs.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));

	const cvOf = (x: { num?: { mean: number; std: number } }) => (x.num && x.num.mean !== 0 ? x.num.std / Math.abs(x.num.mean) : 0);
	const mostVar = [...numCols].sort((a, b) => cvOf(b) - cvOf(a))[0];
	const mostSkew = [...numCols].sort((a, b) => Math.abs(b.num!.skew) - Math.abs(a.num!.skew))[0];
	const tr0 = sheet.trends[0];

	// ───────── abstrak ─────────
	const keywordsId = ['analisis data', 'kualitas data', 'statistik deskriptif', 'korelasi Pearson', 'deteksi outlier'];
	if (stock) { keywordsId.push('manajemen persediaan', 'analisis ABC'); }
	if (dt) { keywordsId.push('decision tree', 'C4.5'); }
	const keywordsEn = ['data analysis', 'data quality', 'descriptive statistics', 'Pearson correlation', 'outlier detection'];
	if (stock) { keywordsEn.push('inventory management', 'ABC analysis'); }
	if (dt) { keywordsEn.push('decision tree', 'C4.5'); }

	const abstractId =
		`Artikel ini menganalisis dataset "${base}" yang terdiri atas ${nf(n, 0)} baris dan ${pCols} kolom (${numCols.length} numerik, ${catCols.length} kategorikal, ${dateCols.length} tanggal). ` +
		`Metode yang digunakan adalah analisis kuantitatif deskriptif yang mencakup penilaian kualitas data, statistik deskriptif, deteksi outlier, korelasi dan regresi linear sederhana, uji asosiasi kategorikal, serta analisis tren dan perbandingan kelompok${stock ? ', ditambah analisis persediaan dengan klasifikasi ABC, indeks konsentrasi, dan kebutuhan pengadaan' : ''}${dt ? ' serta klasifikasi dengan algoritma Decision Tree C4.5' : ''}. ` +
		`Hasil disajikan dalam tabel, grafik, dan penjelasan naratif. ` +
		`Skor kualitas data sebesar ${hl.qualityScore}% menunjukkan kualitas yang ${rating}${pairs.length ? `; korelasi terkuat terdapat antara "${pairs[0].a}" dan "${pairs[0].b}" (r = ${nf(pairs[0].r, 3)})` : ''}${dt ? `, sedangkan model klasifikasi untuk atribut target "${dt.targetAttribute}" mencapai akurasi ${pct(dt.accuracy * 100)}` : ''}${stock ? `; terdapat ${stock.kpis.criticalCount} item berstatus kritis dari ${stock.kpis.totalSKUs} SKU` : ''}. ` +
		`Temuan ini dapat menjadi dasar pembersihan data, pemodelan lanjutan, dan pengambilan keputusan berbasis data.`;
	const abstractEn =
		`This article presents a comprehensive analysis of the "${base}" dataset containing ${nf(n, 0)} rows and ${pCols} columns. A descriptive quantitative approach is applied, covering data quality assessment, descriptive statistics, outlier detection, Pearson correlation with simple linear regression, categorical association tests, trend analysis and group comparison` +
		`${stock ? ', inventory analysis with ABC classification, concentration indices and procurement needs' : ''}${dt ? ', and classification using the C4.5 Decision Tree algorithm' : ''}. ` +
		`The results are presented as tables, charts and narrative explanations. The data quality score is ${hl.qualityScore}%${dt ? ` and the classification model for the target attribute "${dt.targetAttribute}" achieves an accuracy of ${nf(dt.accuracy * 100, 1)}%` : ''}. ` +
		`These findings provide a basis for data cleaning, further modelling and data-driven decision making.`;

	// ═════════ I. PENDAHULUAN ═════════
	h1('I. Pendahuluan');
	sub('Latar Belakang');
	p(`Data yang dihasilkan sistem informasi modern baru bernilai apabila kualitasnya terjaga dan hasil analisisnya dapat diinterpretasikan dengan benar (${c('wang96')}; ${c('pipino02')}). Perkembangan terkini menempatkan data sebagai pusat keberhasilan sistem kecerdasan buatan sehingga pendekatan berpusat pada data (data-centric) semakin ditekankan (${c('zha25')}; ${c('whang23')}). Kegagalan menangani data sejak awal dapat memicu kesalahan berantai yang baru terlihat pada tahap pemodelan atau pengambilan keputusan (${c('sambasivan21')}).`);
	p(`Proses penemuan pengetahuan lazimnya diawali dengan pemahaman, pembersihan, dan eksplorasi data sebelum pemodelan dilakukan (${c('han22')}; ${c('han12')}). Data yang hilang, baris ganda, dan nilai ekstrem dapat membiaskan estimasi statistik sehingga perlu diidentifikasi sejak awal (${c('little02')}; ${c('kots06')}). Analisis eksploratif membantu mengenali pola, anomali, dan hubungan antarvariabel secara dini (${c('tukey77')}).`);
	p(`Dataset "${base}" yang dianalisis memiliki ${nf(n, 0)} baris dan ${pCols} kolom. Agar hasilnya mudah dipahami, artikel ini menggabungkan tabel ringkas, grafik, dan penjelasan naratif yang dihasilkan secara otomatis dan dapat direproduksi.`);
	if (stock) {
		p(`Dataset ini juga memuat informasi barang dan kuantitas sehingga dapat dievaluasi sebagai data persediaan. Pengelolaan persediaan bertujuan menjaga ketersediaan barang tanpa menimbulkan penumpukan yang membebani modal kerja (${c('silver98')}; ${c('heizer14')}; ${c('chopra19')}).`);
	}
	if (dt) {
		p(`Selain itu, tersedia atribut kategorikal yang dapat dijadikan target klasifikasi. Algoritma Decision Tree C4.5 dipilih karena menghasilkan aturan keputusan yang mudah dibaca dan dijelaskan (${c('quinlan93')}; ${c('rudin19')}), serta model berbasis pohon tetap kompetitif pada data tabular (${c('grinsz22')}).`);
	}
	sub('Rumusan Masalah dan Tujuan');
	const rq = ['bagaimana kualitas dataset ditinjau dari kelengkapan, integritas, dan konsistensi', 'bagaimana karakteristik statistik, sebaran, dan nilai ekstrem variabel numerik', 'bagaimana hubungan antarvariabel numerik dan antarvariabel kategorikal'];
	if (sheet.trends.length || sheet.groupBars.length) { rq.push('bagaimana pola tren waktu dan perbedaan antarkelompok'); }
	if (stock) { rq.push('bagaimana kondisi persediaan, konsentrasi nilai, dan kebutuhan pengadaan barang'); }
	if (dt) { rq.push('seberapa baik model Decision Tree C4.5 mengklasifikasikan atribut target'); }
	p(`Berdasarkan latar belakang tersebut, rumusan masalah artikel ini adalah: ${rq.map((x, i) => `(${i + 1}) ${x}`).join('; ')}. Tujuan artikel ini adalah menjawab seluruh pertanyaan tersebut dan merumuskan rekomendasi tindak lanjut yang dapat diterapkan.`);
	sub('Manfaat dan Ruang Lingkup');
	ul([
		'Manfaat praktis: memberikan gambaran cepat kondisi data dan prioritas pembersihan sebelum data digunakan.',
		'Manfaat akademis: menyediakan contoh alur analisis eksploratif yang terdokumentasi dan dapat diulang.',
		`Ruang lingkup: satu berkas data ("${fileName}", lembar "${sheet.name}") dengan analisis otomatis tanpa intervensi manual.`,
		'Batasan: hasil bersifat deskriptif dan asosiatif; tidak membuktikan hubungan sebab-akibat.',
	]);

	// ═════════ II. KAJIAN LITERATUR ═════════
	h1('II. Kajian Literatur');
	sub('Kualitas Data');
	p(`Kualitas data dipandang sebagai kelayakan data untuk digunakan dan mencakup beberapa dimensi, di antaranya kelengkapan, akurasi, dan konsistensi (${c('wang96')}; ${c('batini09')}). Penilaian kualitas sebaiknya bersifat terukur dan dapat diulang (${c('pipino02')}). Penelitian ini mengukur tiga komponen, yaitu kelengkapan, integritas (ketiadaan duplikasi), dan konsistensi kolom, yang digabung menjadi satu skor.`);
	f('Kelengkapan = (sel terisi / total sel) × 100%');
	f('Integritas = (1 − baris duplikat / total baris) × 100%');
	f('Konsistensi = (kolom dengan data hilang < 50% / jumlah kolom) × 100%');
	f('Skor kualitas = 0,45 × Kelengkapan + 0,35 × Integritas + 0,20 × Konsistensi');
	sub('Data Hilang dan Penataan Data');
	p(`Mekanisme data hilang dibedakan menjadi hilang sepenuhnya acak, hilang secara acak, dan hilang tidak acak (${c('rubin76')}). Penanganannya perlu mempertimbangkan mekanisme tersebut agar estimasi tidak bias (${c('schafer02')}; ${c('little02')}). Selain itu, data yang rapi, yaitu satu variabel satu kolom dan satu observasi satu baris, memudahkan analisis (${c('wickham14')}).`);
	sub('Statistik Deskriptif, Skewness, dan Outlier');
	p(`Statistik deskriptif meliputi rata-rata, median, simpangan baku, kuartil, nilai minimum, dan maksimum. Koefisien variasi (CV = simpangan baku / rata-rata) digunakan untuk membandingkan keragaman antarvariabel berskala berbeda, sedangkan skewness mengukur kemiringan sebaran (${c('joanes98')}; ${c('field18')}). Outlier dideteksi dengan aturan rentang interkuartil (IQR) (${c('tukey77')}); metode deteksi pencilan lain dapat ditemukan pada ${c('hodge04')} dan ${c('aggarwal17')}.`);
	f('IQR = Q3 − Q1;  Batas bawah = Q1 − 1,5 × IQR;  Batas atas = Q3 + 1,5 × IQR');
	f('CV = s / |rata-rata|;  Banyak kelas histogram k = ⌈log₂ n + 1⌉ (aturan Sturges)');
	sub('Korelasi Pearson dan Regresi Linear Sederhana');
	p(`Korelasi Pearson mengukur kekuatan hubungan linear dua variabel numerik dengan nilai antara −1 dan 1 (${c('pearson1895')}). Interpretasi koefisien harus memperhatikan konteks dan ukuran sampel (${c('schober18')}; ${c('akoglu18')}). Pada artikel ini |r| ≥ 0,7 dikategorikan kuat, 0,4 ≤ |r| < 0,7 sedang, dan |r| < 0,4 lemah; ukuran efek menurut ${c('cohen88')} (0,1 kecil, 0,3 sedang, 0,5 besar) disajikan sebagai pembanding. Regresi linear sederhana menaksir garis kecenderungan hubungan dua variabel (${c('montgomery21')}).`);
	f('r = (n Σxy − Σx Σy) / √[(n Σx² − (Σx)²)(n Σy² − (Σy)²)]');
	f('y = a + b x;  b = Sxy / Sxx;  R² = r²;  t = r √[(n − 2) / (1 − r²)]');
	p(`Nilai p dan uji signifikansi tidak boleh dipakai secara mekanis tanpa melihat besarnya efek (${c('wasserstein16')}; ${c('sullivan12')}).`);
	sub('Asosiasi Variabel Kategorikal');
	p(`Keterkaitan dua variabel kategorikal diuji dengan statistik chi-kuadrat Pearson (${c('pearsonchi00')}) dan kekuatannya diukur dengan koefisien V Cramér (${c('cramer46')}). Nilai kritis chi-kuadrat pada artikel ini dihampiri dengan transformasi Wilson-Hilferty (${c('wilson31')}).`);
	f('Chi-kuadrat = Σ (O − E)² / E;  E = (total baris × total kolom) / N;  V = √[Chi-kuadrat / (N × min(r − 1, k − 1))]');
	if (stock) {
		sub('Manajemen Persediaan, Analisis ABC, dan Indeks Konsentrasi');
		p(`Analisis ABC mengelompokkan barang berdasarkan kontribusi nilainya mengikuti prinsip Pareto: kelas A menyumbang sekitar 70% nilai kumulatif, kelas B hingga 90%, dan sisanya kelas C (${c('silver98')}; ${c('heizer14')}). Pengembangan klasifikasi multikriteria tersedia pada ${c('ramanathan06')}. Status stok ditentukan dari ambang batas yang dihitung relatif terhadap median kuantitas seluruh item (${c('waters03')}; ${c('nahmias15')}). Model kuantitas pesanan ekonomis klasik dikemukakan oleh ${c('harris13')}.`);
		p(`Konsentrasi nilai persediaan diukur dengan koefisien Gini (${c('gastwirth72')}) dan indeks Herfindahl-Hirschman (HHI) (${c('rhoades93')}). Nilai Gini mendekati 1 berarti nilai persediaan terpusat pada sedikit item.`);
		f('Kritis = maks(1, bulatkan(0,15 × Median));  Menipis = maks(2, bulatkan(0,40 × Median));  Overstock = maks(15, bulatkan(2,5 × Median))');
		f('HHI = Σ (pangsa nilai item)² × 10.000;  Gini = [2 Σ i·xi / (n Σ xi)] − (n + 1) / n');
	}
	if (dt) {
		sub('Algoritma Decision Tree C4.5 dan Evaluasi Model');
		p(`Decision tree adalah model klasifikasi berbentuk pohon yang membagi data berdasarkan atribut paling informatif (${c('quinlan86')}; ${c('breiman84')}). C4.5 menyempurnakan ID3 dengan rasio perolehan (gain ratio) agar tidak bias terhadap atribut bernilai banyak (${c('quinlan93')}). Ketidakpastian data diukur dengan entropi (${c('shannon48')}; ${c('kusrini09')}; ${c('santosa07')}). Tinjauan teknik klasifikasi terawasi dapat dilihat pada ${c('kots07')} dan ${c('hastie09')}, sedangkan pengantar modern tersedia pada ${c('james23')}.`);
		f('Entropy(S) = − Σ pi × log₂(pi)');
		f('Gain(S,A) = Entropy(S) − Σ (|Sv| / |S|) × Entropy(Sv)');
		f('SplitInfo(S,A) = − Σ (|Sv| / |S|) × log₂(|Sv| / |S|)');
		f('GainRatio(S,A) = Gain(S,A) / SplitInfo(S,A)');
		p(`Kinerja model dievaluasi dengan matriks konfusi, akurasi, precision, recall, F1-score (${c('sokolova09')}; ${c('powers11')}; ${c('witten16')}), serta koefisien kappa Cohen yang mengoreksi kesesuaian akibat kebetulan (${c('cohen60')}). Untuk klasifikasi multikelas, rata-rata makro memperlakukan setiap kelas setara (${c('grandini20')}); alternatif lain adalah koefisien korelasi Matthews (${c('chicco20')}).`);
		f('Akurasi = prediksi benar / total data uji;  Kappa = (po − pe) / (1 − pe)');
		p(`Risiko utama pemodelan adalah overfitting (${c('hawkins04')}) dan kebocoran data (${c('kaufman12')}). Validasi silang dianjurkan untuk estimasi kinerja yang lebih andal (${c('kohavi95')}). Pada data tabular, model berbasis pohon masih sangat kompetitif dibanding pembelajaran mendalam (${c('shwartz22')}; ${c('grinsz22')}), dan implementasinya tersedia luas, misalnya pada pustaka scikit-learn (${c('pedregosa11')}).`);
	}
	sub('Penelitian Terdahulu');
	const lit: string[][] = [
		[c('wang96'), 'Dimensi kualitas data dari sudut pandang pengguna', 'Dasar skor kualitas data'],
		[c('rubin76'), 'Mekanisme data hilang', 'Interpretasi sel kosong'],
		[c('tukey77'), 'Analisis data eksploratif dan aturan IQR', 'Deteksi outlier dan statistik ringkas'],
		[c('cohen88'), 'Ukuran efek', 'Interpretasi kekuatan korelasi'],
		[c('quinlan93'), 'Algoritma C4.5', 'Model klasifikasi'],
	];
	if (stock) { lit.push([c('silver98'), 'Pengendalian persediaan dan prinsip Pareto', 'Klasifikasi ABC dan status stok']); }
	lit.push([c('zha25'), 'Survei kecerdasan buatan berpusat pada data', 'Penekanan pada kualitas dan kesiapan data']);
	lit.push([c('grinsz22'), 'Perbandingan model pohon dan pembelajaran mendalam pada data tabular', 'Pembenaran penggunaan model berbasis pohon']);
	tb('Ringkasan penelitian terdahulu yang relevan', ['Sumber', 'Fokus', 'Relevansi'], lit, ['l', 'l', 'l']);

	// ═════════ III. METODE PENELITIAN ═════════
	h1('III. Metode Penelitian');
	sub('Desain dan Sumber Data');
	p(`Penelitian ini menggunakan pendekatan kuantitatif deskriptif (${c('sugiyono19')}). Data bersumber dari berkas "${fileName}" (lembar "${sheet.name}") dengan ${nf(n, 0)} baris${sheet.truncated ? ' (dianalisis sebagian karena melebihi batas baris maksimum)' : ''} dan ${pCols} kolom. Berkas dibaca menggunakan pustaka SheetJS (${c('sheetjs')}). Nilai kosong ("", NA, N/A, NaN, null, none, #N/A, dan tanda "-") diperlakukan sebagai data hilang, sedangkan tipe kolom ditentukan otomatis dari isinya. Seluruh perhitungan dijalankan oleh ekstensi Date Skunder (${c('tool')}) sehingga hasilnya dapat direproduksi.`);
	sub('Definisi Operasional dan Parameter');
	tb('Parameter analisis yang digunakan', ['Komponen', 'Ketentuan'], [
		['Data hilang', 'Sel kosong, NA, N/A, NaN, null, none, #N/A, "-"'],
		['Tipe kolom', 'Otomatis: angka, tanggal, boolean, kategori, teks, ID'],
		['Outlier', 'Aturan IQR (1,5 × IQR)'],
		['Histogram', 'Aturan Sturges, 5 hingga 30 kelas'],
		['Korelasi', 'Pearson, maksimum 12 variabel numerik'],
		['Skor kualitas', '0,45 kelengkapan; 0,35 integritas; 0,20 konsistensi'],
		['Klasifikasi ABC', 'Kumulatif nilai 70% (A), 90% (B), sisanya (C)'],
		['Status stok', 'Berdasarkan median kuantitas item'],
		['Decision Tree', 'Gain ratio, kedalaman maks. 5, data uji 25%'],
		['Batas baris', '200.000 baris per lembar'],
	], ['l', 'l']);
	p(`Diagram alir pada Gambar ${nextFig()} memperlihatkan urutan langkah, lima keputusan bersyarat, dan cabang yang benar-benar dijalankan pada dataset ini. Jalur merah adalah jalur utama yang selalu dijalankan, jalur biru adalah cabang yang aktif karena syaratnya terpenuhi, dan jalur abu-abu putus-putus adalah cabang yang dilewati.`);
	fg('Diagram alir analisis data otomatis', flowChart(layoutFlow(sheet, 'column', fileName)));
	sub('Tahapan Analisis');
	const steps = ['pembacaan data dan inferensi tipe kolom', 'penilaian kualitas data', 'statistik deskriptif dan deteksi outlier', 'analisis variabel kategorikal', 'analisis korelasi dan regresi linear sederhana'];
	if (sheet.crosstab) { steps.push('uji asosiasi kategorikal'); }
	if (sheet.trends.length || sheet.groupBars.length) { steps.push('analisis tren dan perbandingan kelompok'); }
	if (stock) { steps.push('agregasi persediaan per item, klasifikasi ABC, indeks konsentrasi, dan penentuan kebutuhan pengadaan'); }
	if (dt) { steps.push('pembagian data latih dan uji, pembentukan pohon C4.5, serta evaluasi model'); }
	steps.push('penyusunan kesimpulan dan rekomendasi');
	p(`Analisis dilakukan dalam beberapa tahap, yaitu ${and(steps)}. Setiap hasil dirangkum secara otomatis dalam tabel dan grafik sesuai jenis datanya, kemudian dijelaskan secara naratif. Visualisasi disusun dengan memperhatikan prinsip integritas grafis (${c('tufte01')}).`);
	sub('Validitas dan Reproduksibilitas');
	p(`Karena seluruh langkah dijalankan oleh program yang sama, hasil dapat diulang pada data yang sama, kecuali pembagian data latih dan uji pada model klasifikasi yang bersifat acak sehingga akurasi dapat berbeda tipis pada setiap proses. Prinsip data yang dapat ditemukan dan digunakan ulang (${c('wilkinson16')}) dijaga dengan mencantumkan parameter pada Tabel ${tN}.`);

	// ═════════ IV. HASIL DAN PEMBAHASAN ═════════
	h1('IV. Hasil dan Pembahasan');

	// ringkasan eksekutif
	const keyPts: string[] = [`Skor kualitas data ${hl.qualityScore}% (${rating}); ${nf(hl.missingCells, 0)} sel kosong dan ${nf(hl.duplicateRows, 0)} baris duplikat.`];
	if (mostVar) { keyPts.push(`Variabel dengan keragaman tertinggi adalah "${mostVar.name}" (CV = ${nf(cvOf(mostVar), 2)}).`); }
	if (pairs.length) { keyPts.push(`Korelasi terkuat: "${pairs[0].a}" dan "${pairs[0].b}" (r = ${nf(pairs[0].r, 3)}).`); }
	if (stock) { keyPts.push(`${stock.kpis.criticalCount} item kritis dan ${stock.kpis.overstockCount} item overstock dari ${stock.kpis.totalSKUs} SKU.`); }
	if (dt) { keyPts.push(`Akurasi model C4.5 untuk "${dt.targetAttribute}" sebesar ${pct(dt.accuracy * 100)}.`); }
	box('Temuan Utama', keyPts.join(' '));

	// A. Gambaran umum
	sub('Gambaran Umum Dataset');
	const typeCount = new Map<ColType, number>();
	sheet.columns.forEach((x) => typeCount.set(x.type, (typeCount.get(x.type) ?? 0) + 1));
	const typeSorted = [...typeCount.entries()].sort((a, b) => b[1] - a[1]);
	const tNo = nextTab();
	p(`Karakteristik umum dataset diringkas pada Tabel ${tNo} dan komposisi tipe kolom pada Tabel ${tNo + 1} serta Gambar ${nextFig()}. Dataset memuat ${nf(n, 0)} baris dan ${pCols} kolom dengan ${nf(hl.populatedCells, 0)} sel terisi.`);
	tb('Ringkasan karakteristik dataset', ['Karakteristik', 'Nilai'], [
		['Jumlah baris', nf(n, 0)], ['Jumlah kolom', nf(pCols, 0)], ['Kolom numerik', nf(numCols.length, 0)],
		['Kolom kategorikal', nf(catCols.length, 0)], ['Kolom tanggal', nf(dateCols.length, 0)],
		['Sel terisi', nf(hl.populatedCells, 0)], ['Sel kosong', nf(hl.missingCells, 0)], ['Baris duplikat', nf(hl.duplicateRows, 0)],
	], ['l', 'r']);
	tb2('Komposisi tipe kolom dataset', 'Tipe kolom', 'Jumlah', typeSorted.map(([k, v]) => ({ label: TYPE_SHORT[k], value: v })), (v) => nf(v, 0));
	fg('Komposisi tipe kolom dataset', hbarChart(typeSorted.map(([k, v]) => ({ label: TYPE_SHORT[k], value: v })), { fmt: (v) => String(Math.round(v)) }));
	if (typeSorted[0]) { p(`Tipe kolom ${TYPE_SHORT[typeSorted[0][0]].toLowerCase()} paling banyak ditemukan, yaitu ${typeSorted[0][1]} dari ${pCols} kolom (${pct((typeSorted[0][1] / pCols) * 100)}).`); }
	const constCols = sheet.columns.filter((x) => x.unique === 1 && x.count > 1);
	const idCols = sheet.columns.filter((x) => x.type === 'id');
	if (constCols.length || idCols.length) {
		p(`${constCols.length ? `Kolom konstan (hanya satu nilai) sebanyak ${constCols.length}: ${and(constCols.slice(0, 5).map((x) => `"${x.name}"`))}, yang tidak informatif untuk analisis. ` : ''}${idCols.length ? `Kolom identitas terdeteksi sebanyak ${idCols.length}: ${and(idCols.slice(0, 5).map((x) => `"${x.name}"`))}, yang dikecualikan dari analisis numerik dan pemodelan.` : ''}`);
	}
	for (const d of dateCols) { p(`Kolom tanggal "${d.name}" mencakup rentang ${d.dateMin} sampai ${d.dateMax} dengan granularitas ${GRAN[d.gran ?? ''] ?? d.gran ?? '-'}.`); }
	const profTab = nextTab();
	p(`Profil kolom disajikan pada Tabel ${profTab}${pCols > 15 ? ' (15 kolom pertama; daftar lengkap pada Lampiran A)' : ''}. Persentase data hilang dihitung terhadap seluruh baris.`);
	tb('Profil kolom dataset', ['Kolom', 'Tipe', 'Terisi', 'Hilang (%)', 'Unik'],
		sheet.columns.slice(0, 15).map((x) => [cut(x.name, 18), TYPE_SHORT[x.type], nf(x.count, 0), nf((x.missing / Math.max(1, x.missing + x.count)) * 100, 1), nf(x.unique, 0)]),
		['l', 'c', 'r', 'r', 'r']);

	// B. Kualitas data
	sub('Kualitas Data');
	p('Perhitungan skor kualitas data beserta substitusi nilainya adalah sebagai berikut.');
	f(`Kelengkapan = (${nf(hl.populatedCells, 0)} / ${nf(hl.totalCells, 0)}) × 100% = ${nf(hl.completenessScore, 1)}%`);
	f(`Integritas = (1 − ${nf(hl.duplicateRows, 0)} / ${nf(n, 0)}) × 100% = ${nf(hl.integrityScore, 1)}%`);
	f(`Konsistensi = ${nf(hl.consistencyScore, 1)}%`);
	f(`Skor = 0,45 × ${nf(hl.completenessScore, 1)} + 0,35 × ${nf(hl.integrityScore, 1)} + 0,20 × ${nf(hl.consistencyScore, 1)} = ${hl.qualityScore}%`);
	const tQ1 = nextTab();
	const comps = [
		{ label: 'Kelengkapan', value: hl.completenessScore }, { label: 'Integritas', value: hl.integrityScore },
		{ label: 'Konsistensi', value: hl.consistencyScore }, { label: 'Skor akhir', value: hl.qualityScore },
	];
	p(`Tabel ${tQ1} dan Gambar ${nextFig()} membandingkan ketiga komponen kualitas data dengan skor akhir. Dengan skor ${hl.qualityScore}%, kualitas dataset tergolong ${rating}. Komponen terendah adalah ${[...comps.slice(0, 3)].sort((a, b) => a.value - b.value)[0].label.toLowerCase()} (${nf([...comps.slice(0, 3)].sort((a, b) => a.value - b.value)[0].value, 1)}%). Terdapat ${nf(hl.missingCells, 0)} sel kosong, ${nf(hl.duplicateRows, 0)} baris duplikat, dan ${hl.outlierColsCount} kolom yang memiliki outlier.`);
	tb2('Komponen skor kualitas data', 'Komponen', 'Nilai (%)', comps, (v) => pct(v, 1));
	fg('Komponen skor kualitas data', hbarChart(comps, { fmt: (v) => nf(v, 1), max: 100, labelLen: 12 }));
	const miss = sheet.columns.filter((x) => x.missing > 0)
		.map((x) => ({ label: x.name, value: (x.missing / Math.max(1, x.missing + x.count)) * 100 }))
		.sort((a, b) => b.value - a.value).slice(0, 8);
	if (miss.length) {
		const tM = nextTab();
		p(`Sebaran data hilang per kolom ditunjukkan pada Tabel ${tM} dan Gambar ${nextFig()}. Kolom "${miss[0].label}" memiliki proporsi data hilang tertinggi, yaitu ${nf(miss[0].value, 1)}%${miss[0].value > 20 ? ', sehingga perlu penanganan khusus (imputasi atau penghapusan kolom) sebelum digunakan dalam pemodelan' : ''}. Mekanisme hilangnya data perlu ditelusuri karena memengaruhi pilihan metode penanganan (${c('rubin76')}).`);
		tb2('Persentase data hilang pada kolom dengan nilai kosong terbanyak', 'Kolom', 'Data hilang (%)', miss, (v) => pct(v, 1));
		fg('Persentase data hilang per kolom', hbarChart(miss, { fmt: (v) => nf(v, 1), max: 100, labelLen: 14 }));
	} else {
		p('Tidak ditemukan kolom dengan data hilang sehingga tidak diperlukan imputasi.');
	}
	const st = { pass: 'Baik', warn: 'Perhatian', fail: 'Kritis' } as const;
	const tQ = nextTab();
	p(`Hasil pemeriksaan kualitas data secara rinci dirangkum pada Tabel ${tQ}. Aspek berstatus "Perhatian" atau "Kritis" menjadi prioritas perbaikan.`);
	tb('Hasil pemeriksaan kualitas data', ['Aspek', 'Status', 'Keterangan'], hl.checklist.map((x) => [x.category, st[x.status], x.detail]), ['l', 'c', 'l']);

	// C. Statistik deskriptif
	sub('Statistik Deskriptif');
	if (numCols.length) {
		const ncs = numCols.slice(0, 12);
		const tD = nextTab();
		p(`Statistik deskriptif variabel numerik dirangkum pada Tabel ${tD} sampai Tabel ${tD + 2}${numCols.length > 12 ? ' (12 variabel pertama)' : ''}. Tabel ${tD} memuat ukuran letak, Tabel ${tD + 1} memuat ukuran pemusatan dan penyebaran, dan Tabel ${tD + 2} memuat bentuk sebaran.`);
		tb('Ukuran letak variabel numerik', ['Variabel', 'Min', 'Q1', 'Q3', 'Maks'],
			ncs.map((x) => [cut(x.name, 16), nf(x.num!.min), nf(x.num!.q1), nf(x.num!.q3), nf(x.num!.max)]), ['l', 'r', 'r', 'r', 'r']);
		tb('Pemusatan dan penyebaran variabel numerik', ['Variabel', 'Rata-rata', 'Median', 'Std. Dev', 'CV'],
			ncs.map((x) => [cut(x.name, 16), nf(x.num!.mean), nf(x.num!.median), nf(x.num!.std), nf(cvOf(x), 2)]), ['l', 'r', 'r', 'r', 'r']);
		tb('Bentuk sebaran variabel numerik', ['Variabel', 'Skewness', 'Bentuk', 'Jumlah'],
			ncs.map((x) => [cut(x.name, 16), nf(x.num!.skew), skewWord(x.num!.skew), nf(x.num!.sum)]), ['l', 'r', 'l', 'r']);
		p(`Variabel "${mostVar.name}" memiliki keragaman relatif ${cvWord(cvOf(mostVar))} (CV = ${nf(cvOf(mostVar), 2)}), tertinggi di antara variabel numerik, sedangkan sebaran paling tidak simetris terdapat pada "${mostSkew.name}" (skewness ${nf(mostSkew.num!.skew)}; ${skewWord(mostSkew.num!.skew)}). Selisih rata-rata dan median yang besar merupakan petunjuk adanya nilai ekstrem yang menarik rata-rata (${c('field18')}). Pada variabel dengan CV tinggi, median lebih tepat digunakan sebagai ukuran pemusatan.`);
		const histCols = numCols.filter((x) => x.num!.hist.counts.length > 1).slice(0, 3);
		for (const x of histCols) {
			const g = nextTab(), s = x.num!;
			p(`Distribusi frekuensi variabel "${x.name}" ditunjukkan pada Tabel ${g} dan Gambar ${nextFig()}. Rata-ratanya ${nf(s.mean)} dan mediannya ${nf(s.median)} dengan skewness ${nf(s.skew)}, sehingga sebaran data cenderung ${skewWord(s.skew)}. Rentang antarkuartil berada pada ${nf(s.q1)} hingga ${nf(s.q3)}.`);
			const hs = s.hist, step = Math.max(1, Math.ceil(hs.counts.length / 10));
			const hrows: string[][] = [];
			for (let i = 0; i < hs.counts.length; i += step) {
				const cnt = hs.counts.slice(i, i + step).reduce((a, b) => a + b, 0);
				const lo = hs.labels[i].split(' – ')[0], hi = hs.labels[Math.min(i + step, hs.counts.length) - 1].split(' – ').pop() ?? '';
				hrows.push([`${lo} – ${hi}`, nf(cnt, 0), pct((cnt / Math.max(1, x.count)) * 100, 1)]);
			}
			tb(`Distribusi frekuensi variabel "${cut(x.name, 28)}"`, ['Interval', 'Frekuensi', 'Proporsi'], hrows, ['l', 'r', 'r']);
			fg(`Histogram variabel "${cut(x.name, 28)}"`, histChart(hs));
		}
	} else {
		p('Dataset tidak memiliki kolom numerik sehingga statistik deskriptif numerik tidak dihitung.');
	}

	// D. Outlier
	sub('Deteksi Outlier');
	if (numCols.length) {
		const outAll = numCols.filter((x) => x.num!.outliers > 0).sort((a, b) => b.num!.outliers / Math.max(1, b.count) - a.num!.outliers / Math.max(1, a.count)).slice(0, 10);
		if (outAll.length) {
			const g = nextTab();
			p(`Hasil deteksi outlier dengan aturan IQR ditunjukkan pada Tabel ${g} dan Gambar ${nextFig()}. Variabel "${outAll[0].name}" memiliki proporsi pencilan tertinggi, yaitu ${nf(outAll[0].num!.outliers, 0)} nilai (${pct((outAll[0].num!.outliers / Math.max(1, outAll[0].count)) * 100)}). Pencilan perlu ditelaah untuk memastikan apakah merupakan kesalahan pencatatan atau nilai ekstrem yang valid (${c('hodge04')}); penghapusan otomatis tidak dianjurkan.`);
			tb('Batas outlier dan jumlah pencilan per variabel', ['Variabel', 'Batas bawah', 'Batas atas', 'Outlier', '%'],
				outAll.map((x) => [cut(x.name, 16), nf(x.num!.lower), nf(x.num!.upper), nf(x.num!.outliers, 0), nf((x.num!.outliers / Math.max(1, x.count)) * 100, 1)]), ['l', 'r', 'r', 'r', 'r']);
			fg('Persentase outlier per variabel numerik', hbarChart(outAll.map((x) => ({ label: x.name, value: (x.num!.outliers / Math.max(1, x.count)) * 100 })), { fmt: (v) => nf(v, 1), labelLen: 14 }));
		} else {
			p('Tidak ditemukan outlier berdasarkan aturan IQR pada variabel numerik, sehingga tidak diperlukan penanganan nilai ekstrem.');
		}
	} else {
		p('Tidak ada variabel numerik sehingga deteksi outlier tidak dilakukan.');
	}

	// E. Kategorikal
	const catWithTop = catCols.filter((x) => x.top && x.top.length);
	if (catWithTop.length) {
		sub('Variabel Kategorikal');
		const tCat = nextTab();
		p(`Konsentrasi nilai pada variabel kategorikal diringkas pada Tabel ${tCat}. Semakin besar proporsi nilai teratas, semakin timpang sebaran kategorinya.`);
		tb('Konsentrasi variabel kategorikal', ['Variabel', 'Unik', 'Top-1 (%)', 'Top-3 (%)'],
			catWithTop.slice(0, 10).map((x) => [cut(x.name, 16), nf(x.unique, 0), nf((x.top![0].count / Math.max(1, x.count)) * 100, 1), nf((sum(x.top!.slice(0, 3).map((v) => v.count)) / Math.max(1, x.count)) * 100, 1)]),
			['l', 'r', 'r', 'r']);
		for (const x of catWithTop.slice(0, 3)) {
			const g = nextTab(), top = x.top![0];
			p(`Frekuensi nilai teratas pada variabel "${x.name}" ditunjukkan pada Tabel ${g} dan Gambar ${nextFig()}. Nilai "${cut(top.value, 30)}" paling dominan dengan proporsi ${pct((top.count / x.count) * 100)} dari ${nf(x.unique, 0)} kategori unik.`);
			tb(`Frekuensi nilai teratas variabel "${cut(x.name, 28)}"`, ['Nilai', 'Frekuensi', 'Proporsi'],
				x.top!.slice(0, 6).map((v) => [cut(v.value, 26), nf(v.count, 0), pct((v.count / x.count) * 100)]), ['l', 'r', 'r']);
			fg(`Frekuensi nilai teratas "${cut(x.name, 28)}"`, hbarChart(x.top!.slice(0, 6).map((v) => ({ label: v.value, value: v.count })), { fmt: (v) => nf(v, 0), labelLen: 14 }));
		}
	}

	// F. Korelasi & regresi
	sub('Analisis Korelasi dan Regresi Sederhana');
	if (cc.length >= 2 && pairs.length) {
		const k = Math.min(cc.length, 8);
		const gH = nextTab();
		p(`Matriks korelasi Pearson antarvariabel numerik ditunjukkan pada Gambar ${nextFig()}${cc.length > k ? ` (${k} variabel pertama dari ${cc.length}; matriks lengkap pada Lampiran B)` : ''}. Nomor kolom menunjukkan variabel berikut: ${cc.slice(0, k).map((x, i) => `${i + 1} = ${cut(x, 24)}`).join('; ')}. Warna merah menandakan korelasi positif dan biru korelasi negatif; semakin pekat warna, semakin kuat hubungannya.`);
		fg('Peta panas korelasi Pearson', matrixChart(cc.slice(0, k).map((x, i) => `${i + 1}.${x}`), cc.slice(0, k).map((_, i) => String(i + 1)), matrix.slice(0, k).map((r) => r.slice(0, k)), { kind: 'corr' }));
		const top = pairs.slice(0, 8);
		const strongN = pairs.filter((x) => Math.abs(x.r) >= 0.7).length, midN = pairs.filter((x) => Math.abs(x.r) >= 0.4 && Math.abs(x.r) < 0.7).length;
		p(`Dari ${pairs.length} pasangan variabel, terdapat ${strongN} pasangan berkorelasi kuat dan ${midN} pasangan berkorelasi sedang. Pasangan terkuat dirangkum pada Tabel ${gH}. Korelasi tertinggi terdapat antara "${top[0].a}" dan "${top[0].b}" (r = ${nf(top[0].r, 3)}; ${strength(top[0].r).toLowerCase()}, ${top[0].r >= 0 ? 'positif' : 'negatif'}) dengan koefisien determinasi r² = ${nf(top[0].r ** 2, 3)}, artinya sekitar ${pct(top[0].r ** 2 * 100)} keragaman satu variabel berkaitan secara linear dengan variabel lainnya. Korelasi tidak serta-merta menunjukkan hubungan sebab-akibat (${c('schober18')}).`);
		tb('Pasangan variabel dengan korelasi terkuat', ['Variabel X', 'Variabel Y', 'r', 'r²', 'Kekuatan', 'Efek'],
			top.map((x) => [cut(x.a, 12), cut(x.b, 12), nf(x.r, 3), nf(x.r ** 2, 3), strength(x.r), cohenWord(x.r)]), ['l', 'l', 'r', 'r', 'c', 'c']);
		const sc = sheet.scatters.filter((s) => s.points.length >= 3).slice(0, 3);
		if (sc.length) {
			const gR = nextTab();
			p(`Diagram pencar beserta garis regresi linear ditunjukkan pada Gambar ${nextFig()}${sc.length > 1 ? ` sampai Gambar ${nextFig() + sc.length - 1}` : ''}, dan parameter regresinya pada Tabel ${gR}. Parameter dihitung dari titik sampel (maksimum sekitar 600 titik per pasangan) sehingga bersifat indikatif. Statistik t yang melebihi sekitar 1,96 menunjukkan koefisien kemiringan yang berbeda nyata dari nol pada taraf 5%, namun besarnya efek tetap harus diperhatikan (${c('wasserstein16')}).`);
			const regRows: string[][] = [];
			for (const s of sc) {
				fg(`Diagram pencar "${cut(s.x, 18)}" terhadap "${cut(s.y, 18)}" (r = ${nf(s.r, 3)})`, scatterChart(s.points, s.x, s.y));
				const rg = regress(s.points);
				regRows.push([`${cut(s.x, 10)} → ${cut(s.y, 10)}`, nf(rg.a, 3), nf(rg.b, 4), nf(rg.r2, 3), nf(rg.tStat, 2), Math.abs(rg.tStat) > 1.96 ? 'Ya' : 'Tidak']);
			}
			tb('Parameter regresi linear sederhana', ['Model (X → Y)', 'a', 'b', 'R²', 't', 'Sig.'], regRows, ['l', 'r', 'r', 'r', 'r', 'c']);
			p(`Pada model pertama, setiap kenaikan satu satuan "${sc[0].x}" berasosiasi dengan perubahan sebesar ${nf(regress(sc[0].points).b, 4)} pada "${sc[0].y}". Model linear sederhana hanya menangkap pola lurus; pola lengkung atau pengaruh variabel ketiga memerlukan analisis lanjutan (${c('montgomery21')}).`);
		}
	} else {
		p('Jumlah variabel numerik yang memenuhi syarat tidak cukup untuk menghitung korelasi.');
	}

	// G. Asosiasi kategorikal
	const ct = sheet.crosstab;
	if (ct) {
		sub('Asosiasi Antarvariabel Kategorikal');
		const grid = ct.series.map((s) => s.data);
		const chi = chiSquare(grid);
		const gX = nextTab();
		p(`Tabulasi silang antara "${ct.a}" dan "${ct.b}" ditunjukkan pada Gambar ${nextFig()} (kategori dengan frekuensi tertinggi) dan hasil ujinya pada Tabel ${gX}.`);
		fg(`Tabulasi silang "${cut(ct.a, 20)}" dan "${cut(ct.b, 20)}"`, matrixChart(ct.series.map((s) => s.name), ct.labels, grid, { kind: 'count', fmt: (v) => nf(v, 0) }));
		if (chi) {
			tb('Uji chi-kuadrat independensi', ['Statistik', 'Nilai'], [
				['Chi-kuadrat', nf(chi.chi, 2)], ['Derajat bebas', nf(chi.df, 0)], ['Nilai kritis (5%)', nf(chi.crit, 2)],
				['V Cramér', nf(chi.v, 3)], ['Jumlah pengamatan', nf(chi.total, 0)], ['Keputusan', chi.sig ? 'Tolak H0' : 'Gagal tolak H0'],
			], ['l', 'r']);
			p(`Nilai chi-kuadrat ${nf(chi.chi, 2)} ${chi.sig ? 'melampaui' : 'tidak melampaui'} nilai kritis ${nf(chi.crit, 2)} pada derajat bebas ${chi.df}, sehingga ${chi.sig ? 'terdapat bukti keterkaitan antara kedua variabel' : 'tidak terdapat bukti keterkaitan yang cukup antara kedua variabel'}. Kekuatan asosiasi diukur oleh V Cramér = ${nf(chi.v, 3)} yang tergolong ${chi.v >= 0.3 ? 'kuat' : chi.v >= 0.1 ? 'lemah hingga sedang' : 'sangat lemah'} (${c('cramer46')}). Uji dilakukan pada kategori teratas saja dan bersifat pendekatan.`);
		} else {
			p('Tabulasi silang tidak memiliki cukup baris dan kolom berisi untuk uji chi-kuadrat.');
		}
	}

	// H. Tren & kelompok
	if (sheet.trends.length || sheet.groupBars.length || dateCols.some((d) => d.series && d.series.labels.length > 1)) {
		sub('Tren Waktu dan Perbandingan Kelompok');
		const dsrc = dateCols.find((d) => d.series && d.series.labels.length > 1);
		if (dsrc?.series) {
			const sr = dsrc.series, mxI = sr.counts.indexOf(Math.max(...sr.counts));
			const gV = nextTab();
			p(`Volume pencatatan data menurut ${GRAN[dsrc.gran ?? ''] ?? dsrc.gran} berdasarkan kolom "${dsrc.name}" ditunjukkan pada Gambar ${nextFig()} dan Tabel ${gV}. Puncak pencatatan terjadi pada ${sr.labels[mxI]} dengan ${nf(sr.counts[mxI], 0)} baris, sedangkan rata-rata per periode adalah ${nf(sum(sr.counts) / sr.counts.length, 1)} baris.`);
			fg(`Jumlah baris per ${GRAN[dsrc.gran ?? ''] ?? dsrc.gran}`, lineChart(sr.labels, sr.counts, `Baris per ${GRAN[dsrc.gran ?? ''] ?? dsrc.gran}`));
			const stp = Math.max(1, Math.ceil(sr.labels.length / 8));
			const rr: string[][] = [];
			for (let i = 0; i < sr.labels.length; i += stp) { rr.push([sr.labels[i], nf(sr.counts[i], 0)]); }
			tb('Jumlah baris per periode', ['Periode', 'Jumlah baris'], rr, ['l', 'r']);
		}
		for (const tr of sheet.trends.slice(0, 2)) {
			const g = nextTab(), first = tr.values[0], last = tr.values[tr.values.length - 1];
			const nT = tr.values.length, mI = (nT - 1) / 2, mV = sum(tr.values) / nT;
			let sxx = 0, sxy = 0, syy = 0;
			tr.values.forEach((v, i) => { sxx += (i - mI) ** 2; sxy += (i - mI) * (v - mV); syy += (v - mV) ** 2; });
			const slope = sxx > 0 ? sxy / sxx : 0, r2 = sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : 0;
			let rise = { i: 0, d: -Infinity }, drop = { i: 0, d: Infinity };
			for (let i = 1; i < nT; i++) {
				const d = tr.values[i] - tr.values[i - 1];
				if (d > rise.d) { rise = { i, d }; }
				if (d < drop.d) { drop = { i, d }; }
			}
			const mx = Math.max(...tr.values), mn = Math.min(...tr.values);
			p(`Tabel ${g} dan Gambar ${nextFig()} menunjukkan rata-rata "${tr.num}" per ${GRAN[tr.gran] ?? tr.gran} berdasarkan kolom "${tr.date}". Nilainya bergerak dari ${nf(first)} pada ${tr.labels[0]} menjadi ${nf(last)} pada ${tr.labels[nT - 1]}, atau ${last >= first ? 'meningkat' : 'menurun'} sebesar ${nf(Math.abs(last - first))}${first !== 0 ? ` (${pct((Math.abs(last - first) / Math.abs(first)) * 100)})` : ''}. Garis tren linear memiliki kemiringan ${nf(slope, 4)} per periode dengan R² = ${nf(r2, 3)}, sehingga tren ${r2 >= 0.5 ? 'cukup jelas' : 'lemah dan didominasi fluktuasi'}. Kenaikan antarperiode terbesar terjadi pada ${tr.labels[rise.i]} (${nf(rise.d)}) dan penurunan terbesar pada ${tr.labels[drop.i]} (${nf(drop.d)}).`);
			fg(`Rata-rata "${cut(tr.num, 22)}" per ${GRAN[tr.gran] ?? tr.gran}`, lineChart(tr.labels, tr.values, tr.num));
			tb(`Ringkasan tren "${cut(tr.num, 20)}"`, ['Ukuran', 'Nilai'], [
				['Periode pengamatan', nf(nT, 0)], ['Nilai awal', nf(first)], ['Nilai akhir', nf(last)],
				['Minimum', `${nf(mn)} (${tr.labels[tr.values.indexOf(mn)]})`], ['Maksimum', `${nf(mx)} (${tr.labels[tr.values.indexOf(mx)]})`],
				['Kemiringan tren', nf(slope, 4)], ['R² tren', nf(r2, 3)],
			], ['l', 'r']);
			const stp = Math.max(1, Math.ceil(nT / 8));
			const idx: number[] = [];
			for (let i = 0; i < nT; i += stp) { idx.push(i); }
			if (idx[idx.length - 1] !== nT - 1) { idx.push(nT - 1); }
			tb(`Rata-rata "${cut(tr.num, 24)}" per ${GRAN[tr.gran] ?? tr.gran}`, ['Periode', 'Rata-rata'], idx.map((i) => [tr.labels[i], nf(tr.values[i])]), ['l', 'r']);
		}
		for (const gb of sheet.groupBars.slice(0, 2)) {
			if (!gb.labels.length) { continue; }
			const g = nextTab(), nT = sum(gb.counts), grand = nT > 0 ? sum(gb.means.map((m, i) => m * gb.counts[i])) / nT : 0;
			const lo = gb.means[gb.means.length - 1];
			p(`Perbandingan rata-rata "${gb.num}" menurut "${gb.cat}" ditunjukkan pada Tabel ${g} dan Gambar ${nextFig()}. Kelompok "${cut(gb.labels[0], 24)}" memiliki rata-rata tertinggi (${nf(gb.means[0])}), sedangkan kelompok "${cut(gb.labels[gb.labels.length - 1], 24)}" terendah (${nf(lo)})${lo !== 0 ? `, atau selisih ${nf(gb.means[0] / lo, 2)} kali` : ''}. Rata-rata keseluruhan tertimbang adalah ${nf(grand)}. Selisih kelompok perlu diuji lebih lanjut dengan analisis varians sebelum disimpulkan bermakna.`);
			tb(`Rata-rata "${cut(gb.num, 20)}" menurut "${cut(gb.cat, 20)}"`, ['Kelompok', 'Rata-rata', 'Jumlah', 'Selisih (%)'],
				gb.labels.slice(0, 8).map((l, i) => [cut(l, 20), nf(gb.means[i]), nf(gb.counts[i], 0), grand !== 0 ? nf(((gb.means[i] - grand) / Math.abs(grand)) * 100, 1) : '-']), ['l', 'r', 'r', 'r']);
			fg(`Rata-rata "${cut(gb.num, 20)}" menurut "${cut(gb.cat, 20)}"`, hbarChart(gb.labels.slice(0, 8).map((l, i) => ({ label: l, value: gb.means[i] })), { labelLen: 14 }));
		}
	}

	// I. Persediaan
	if (stock) {
		const kp = stock.kpis, ab = stock.abcSummary;
		const qtys = stock.items.map((i) => i.quantity).sort((a, b) => a - b);
		const med = qtys[Math.floor(qtys.length * 0.5)] || 1;
		const tot = kp.totalSKUs || 1;
		sub('Analisis Persediaan');
		const tK = nextTab();
		p(`Sistem mendeteksi kolom item "${stock.itemCol}" dan kolom kuantitas "${stock.qtyCol}"${stock.priceCol ? `, kolom harga "${stock.priceCol}"` : ''}${stock.categoryCol ? `, serta kolom kategori "${stock.categoryCol}"` : ''}. Setelah diagregasi per item diperoleh ${nf(kp.totalSKUs, 0)} SKU unik. Indikator utama persediaan disajikan pada Tabel ${tK}.`);
		tb('Indikator utama persediaan', ['Indikator', 'Nilai'], [
			['Total SKU', nf(kp.totalSKUs, 0)], ['Total volume stok', nf(kp.totalStockVolume)], ['Total valuasi', nf(kp.totalValuation)],
			['Rata-rata stok per item', nf(kp.averageStockPerItem)], ['Median stok per item', nf(med)], ['Item kritis', nf(kp.criticalCount, 0)], ['Item menipis', nf(kp.lowCount, 0)],
			['Item aman', nf(kp.healthyCount, 0)], ['Item overstock', nf(kp.overstockCount, 0)],
		], ['l', 'r']);
		p('Ambang batas status stok dihitung dari median kuantitas seluruh item sebagai berikut.');
		f(`Median = ${nf(med)};  Kritis ≤ ${Math.max(1, Math.round(med * 0.15))};  Menipis ≤ ${Math.max(2, Math.round(med * 0.4))};  Overstock ≥ ${Math.max(15, Math.round(med * 2.5))}`);
		const gS = nextTab();
		p(`Distribusi status stok ditunjukkan pada Tabel ${gS} dan Gambar ${nextFig()}. Sebanyak ${pct((kp.criticalCount / tot) * 100)} SKU berstatus kritis dan ${pct((kp.lowCount / tot) * 100)} menipis, sedangkan ${pct((kp.overstockCount / tot) * 100)} mengalami overstock. Secara keseluruhan ${pct(((kp.criticalCount + kp.lowCount) / tot) * 100)} SKU berada di bawah tingkat aman dan memerlukan perhatian.`);
		tb('Distribusi status stok', ['Status', 'Jumlah SKU', 'Proporsi'],
			stock.statusDistribution.map((x) => [x.label, nf(x.count, 0), pct((x.count / tot) * 100)]), ['l', 'r', 'r']);
		fg('Distribusi status stok', hbarChart(stock.statusDistribution.map((x) => ({ label: x.label, value: x.count })), { colors: STATUS_COLORS, fmt: (v) => nf(v, 0), labelLen: 14 }));
		const gA = nextTab();
		p(`Hasil klasifikasi ABC ditunjukkan pada Tabel ${gA} dan Gambar ${nextFig()}. Kelas A terdiri atas ${nf(ab.classA.count, 0)} item (${pct(ab.classA.pctCount)} dari seluruh SKU) tetapi menyumbang ${pct(ab.classA.valPct)} nilai persediaan, sehingga item kelas A memerlukan pengawasan paling ketat (${c('silver98')}). Pola ini ${ab.classA.pctCount < 30 && ab.classA.valPct > 60 ? 'sesuai dengan prinsip Pareto' : 'menyimpang dari pola Pareto klasik'}.`);
		tb('Klasifikasi ABC berdasarkan proporsi item dan nilai', ['Kelas', 'Jumlah item', '% item', '% nilai'], [
			['A', nf(ab.classA.count, 0), pct(ab.classA.pctCount), pct(ab.classA.valPct)],
			['B', nf(ab.classB.count, 0), pct(ab.classB.pctCount), pct(ab.classB.valPct)],
			['C', nf(ab.classC.count, 0), pct(ab.classC.pctCount), pct(ab.classC.valPct)],
		], ['c', 'r', 'r', 'r']);
		fg('Kontribusi nilai menurut kelas ABC (%)', hbarChart([
			{ label: 'Kelas A', value: ab.classA.valPct }, { label: 'Kelas B', value: ab.classB.valPct }, { label: 'Kelas C', value: ab.classC.valPct },
		], { fmt: (v) => nf(v, 1), max: 100, labelLen: 10 }));
		// konsentrasi
		const metric = stock.items.map((x) => (kp.totalValuation > 0 ? x.totalValue : x.quantity));
		const totM = sum(metric) || 1;
		const hhi = sum(metric.map((v) => (v / totM) ** 2)) * 10000, gi = gini(metric);
		const gK = nextTab();
		p(`Konsentrasi nilai persediaan diukur pada Tabel ${gK}. Koefisien Gini sebesar ${nf(gi, 3)} menunjukkan ketimpangan nilai antaritem yang ${gi >= 0.6 ? 'tinggi' : gi >= 0.4 ? 'sedang' : 'rendah'}, dan HHI sebesar ${nf(hhi, 0)} menandakan konsentrasi ${hhi >= 2500 ? 'tinggi' : hhi >= 1500 ? 'sedang' : 'rendah'} pada skala 0 sampai 10.000 (${c('gastwirth72')}; ${c('rhoades93')}).`);
		tb('Indeks konsentrasi nilai persediaan', ['Indeks', 'Nilai', 'Interpretasi'], [
			['Koefisien Gini', nf(gi, 3), gi >= 0.6 ? 'Tinggi' : gi >= 0.4 ? 'Sedang' : 'Rendah'],
			['HHI', nf(hhi, 0), hhi >= 2500 ? 'Tinggi' : hhi >= 1500 ? 'Sedang' : 'Rendah'],
			['Pangsa item terbesar', pct(((Math.max(...metric)) / totM) * 100), '-'],
		], ['l', 'r', 'c']);
		// status x ABC
		const statusKeys: { k: 'critical' | 'low' | 'healthy' | 'overstock'; l: string }[] = [{ k: 'critical', l: 'Kritis' }, { k: 'low', l: 'Menipis' }, { k: 'healthy', l: 'Aman' }, { k: 'overstock', l: 'Overstock' }];
		const gSA = nextTab();
		p(`Tabel ${gSA} memperlihatkan sebaran status stok pada setiap kelas ABC. Item kritis pada kelas A merupakan prioritas tertinggi karena berdampak besar pada nilai dan ketersediaan.`);
		tb('Status stok menurut kelas ABC', ['Kelas', ...statusKeys.map((s) => s.l)],
			(['A', 'B', 'C'] as const).map((cl) => [cl, ...statusKeys.map((s) => nf(stock.items.filter((x) => x.abcClass === cl && x.status === s.k).length, 0))]), ['c', 'r', 'r', 'r', 'r']);
		const gT = nextTab();
		p(`Tabel ${gT} dan Gambar ${nextFig()} memperlihatkan delapan item dengan kuantitas stok terbesar. Item "${cut(stock.topStock[0]?.label ?? '-', 30)}" memiliki stok tertinggi, yaitu ${nf(stock.topStock[0]?.value ?? 0)} unit. Sebaliknya, item dengan stok terendah ditunjukkan pada Gambar ${nextFig() + 1}.`);
		tb2('Delapan item dengan kuantitas stok terbesar', 'Item', 'Kuantitas', stock.topStock.slice(0, 8));
		fg('Delapan item dengan stok terbesar', hbarChart(stock.topStock.slice(0, 8), { labelLen: 14 }));
		fg('Delapan item dengan stok terendah', hbarChart(stock.bottomStock.slice(0, 8), { labelLen: 14, colors: [STATUS_COLORS[0]] }));
		const topA = stock.items.filter((x) => x.abcClass === 'A').slice(0, 8);
		if (topA.length) {
			const gTA = nextTab();
			p(`Delapan item kelas A teratas disajikan pada Tabel ${gTA}. Item ini sebaiknya dipantau melalui stock opname berkala dan kebijakan titik pemesanan ulang yang ketat.`);
			tb('Item kelas A teratas', ['Item', 'Stok', 'Nilai', 'Status'], topA.map((x) => [cut(x.name, 20), nf(x.quantity), nf(x.totalValue), x.statusLabel]), ['l', 'r', 'r', 'c']);
		}
		if (stock.categoryValuation.length >= 2) {
			const gC = nextTab(), cv = stock.categoryValuation[0];
			const share = (cv.value / (sum(stock.categoryValuation.map((x) => x.value)) || 1)) * 100;
			p(`Kontribusi nilai menurut kategori ditunjukkan pada Tabel ${gC} dan Gambar ${nextFig()}. Kategori "${cut(cv.label, 24)}" mendominasi dengan nilai ${nf(cv.value)} (${pct(share)} dari kategori teratas)${share > 40 ? ', yang menandakan ketergantungan tinggi pada satu kategori' : ''}.`);
			tb('Nilai persediaan menurut kategori', ['Kategori', 'Nilai', 'Jumlah SKU'],
				stock.categoryValuation.slice(0, 8).map((x) => [cut(x.label, 24), nf(x.value), nf(x.count, 0)]), ['l', 'r', 'r']);
			fg('Nilai persediaan menurut kategori', hbarChart(stock.categoryValuation.slice(0, 8).map((x) => ({ label: x.label, value: x.value })), { labelLen: 14 }));
		}
	}

	// J. Pengadaan
	if (stock && needs) {
		sub('Analisis Kebutuhan Pengadaan');
		p(`Item berstatus kritis dan menipis dijadikan kandidat pengadaan. Jumlah pemesanan dan estimasi biaya dihitung dengan rumus berikut; pendekatan ini bersifat heuristik dan dapat disempurnakan dengan model kuantitas pesanan ekonomis (${c('harris13')}; ${c('nahmias15')}).`);
		f('Rekomendasi (kritis) = maks(5, bulatkan(1,5 × Median) − stok);  Rekomendasi (menipis) = maks(2, bulatkan(1,2 × Median) − stok)');
		f('Estimasi biaya = Rekomendasi × Harga satuan');
		const gP = nextTab();
		const sorted = [...needs.procurementItems].sort((a, b) => b.estimatedCost - a.estimatedCost);
		const top3 = sum(sorted.slice(0, 3).map((x) => x.estimatedCost));
		p(`Total estimasi anggaran pengadaan adalah ${nf(needs.totalProcurementBudget)} untuk ${nf(needs.procurementItems.length, 0)} item (${nf(needs.urgentItemCount, 0)} mendesak dan ${nf(needs.highPriorityCount, 0)} prioritas tinggi). ${sorted.length >= 3 && needs.totalProcurementBudget > 0 ? `Tiga item terbesar menyerap ${pct((top3 / needs.totalProcurementBudget) * 100)} dari anggaran. ` : ''}Delapan item dengan estimasi biaya terbesar ditunjukkan pada Tabel ${gP}${sorted.length ? ` dan Gambar ${nextFig()}` : ''}.`);
		if (sorted.length) {
			tb('Delapan item pengadaan dengan estimasi biaya terbesar', ['Item', 'Stok', 'Pesan', 'Estimasi biaya', 'Prioritas'],
				sorted.slice(0, 8).map((x) => [cut(x.name, 22), nf(x.currentStock), nf(x.recommendedQty), nf(x.estimatedCost), x.priority]), ['l', 'r', 'r', 'r', 'c']);
			fg('Estimasi biaya pengadaan terbesar', hbarChart(sorted.slice(0, 8).map((x) => ({ label: x.name, value: x.estimatedCost })), { labelLen: 14, colors: [STATUS_COLORS[1]] }));
		}
		if (needs.riskWarnings.length) {
			p('Risiko operasional yang teridentifikasi adalah sebagai berikut.');
			ul(needs.riskWarnings.map(noEmoji));
		}
		if (needs.actionPlan.length) {
			const gAP = nextTab();
			p(`Rencana aksi yang disarankan dirangkum pada Tabel ${gAP}.`);
			tb('Rencana aksi pengelolaan persediaan', ['Tindakan', 'Uraian'], needs.actionPlan.map((x) => [cut(noEmoji(x.title), 40), noEmoji(x.description)]), ['l', 'l']);
		}
	}

	// K. Decision tree
	let dtLab: string[] = [];
	if (dt) {
		sub('Klasifikasi Decision Tree C4.5');
		const total = Object.values(dt.classDistribution).reduce((a, b) => a + b, 0) || 1;
		let hAll = 0;
		for (const cnt of Object.values(dt.classDistribution)) { const pi = cnt / total; if (pi > 0) { hAll -= pi * Math.log2(pi); } }
		const gD = nextTab();
		const majShare = Math.max(...Object.values(dt.classDistribution)) / total;
		p(`Atribut target dipilih otomatis, yaitu "${dt.targetAttribute}" dengan ${Object.keys(dt.classDistribution).length} kelas dan ${dt.predictiveAttributes.length} atribut prediktor. Data dibagi menjadi ${nf(dt.trainingSize, 0)} data latih dan ${nf(dt.testSize, 0)} data uji. Distribusi kelas ditunjukkan pada Tabel ${gD} dan Gambar ${nextFig()} dengan entropi seluruh data sebesar ${nf(hAll, 4)} bit dari maksimum ${nf(Math.log2(Math.max(2, Object.keys(dt.classDistribution).length)), 4)} bit. Kelas mayoritas mencakup ${pct(majShare * 100)} data sehingga akurasi dasar (selalu menebak kelas mayoritas) adalah ${pct(majShare * 100)}.`);
		const dist = Object.entries(dt.classDistribution).sort((a, b) => b[1] - a[1]).slice(0, 8);
		tb('Distribusi kelas atribut target', ['Kelas', 'Jumlah', 'Proporsi'], dist.map(([l, v]) => [cut(l, 24), nf(v, 0), pct((v / total) * 100)]), ['l', 'r', 'r']);
		fg('Distribusi kelas atribut target', hbarChart(dist.map(([l, v]) => ({ label: l, value: v })), { fmt: (v) => nf(v, 0), labelLen: 14 }));
		const sm = dt.splitMetrics;
		if (sm.length) {
			const tG = nextTab();
			f(`GainRatio(${cut(sm[0].attribute, 24)}) = ${nf(sm[0].informationGain, 4)} / ${nf(sm[0].splitInfo, 4)} = ${nf(sm[0].gainRatio, 4)}`);
			p(`Perhitungan gain, split info, dan gain ratio setiap atribut dirangkum pada Tabel ${tG}. Atribut "${sm[0].attribute}" memiliki gain ratio tertinggi sehingga dipilih sebagai simpul akar.`);
			tb('Gain, SplitInfo, dan Gain Ratio atribut teratas', ['Atribut', 'Gain', 'SplitInfo', 'Gain Ratio'],
				sm.slice(0, 8).map((x) => [cut(x.attribute, 14), nf(x.informationGain, 4), nf(x.splitInfo, 4), nf(x.gainRatio, 4)]), ['l', 'r', 'r', 'r']);
		}
		if (dt.featureImportance.length) {
			const gF = nextTab(), fi = dt.featureImportance[0];
			const top3 = sum(dt.featureImportance.slice(0, 3).map((x) => x.importance)) * 100;
			p(`Tingkat kepentingan fitur ditunjukkan pada Tabel ${gF} dan Gambar ${nextFig()}. Fitur "${fi.feature}" memberikan kontribusi terbesar, yaitu ${pct(fi.importance * 100)}, dan tiga fitur teratas bersama-sama menyumbang ${pct(top3)}. Interpretasi ini berbasis information gain pada data latih sehingga tidak menggambarkan hubungan sebab-akibat (${c('rudin19')}).`);
			tb2('Tingkat kepentingan fitur berdasarkan information gain', 'Fitur', 'Kepentingan (%)',
				dt.featureImportance.slice(0, 8).map((x) => ({ label: x.feature, value: x.importance * 100 })), (v) => pct(v, 1));
			fg('Tingkat kepentingan fitur (%)', hbarChart(dt.featureImportance.slice(0, 8).map((x) => ({ label: x.feature, value: x.importance * 100 })), { fmt: (v) => nf(v, 1), labelLen: 14 }));
		}
		const ts = treeStats(dt.tree);
		const gTS = nextTab();
		p(`Struktur pohon yang terbentuk dirangkum pada Tabel ${gTS}. Pohon memiliki ${nf(ts.nodes, 0)} simpul, ${nf(ts.leaves, 0)} daun, dan kedalaman ${ts.depth}, serta menghasilkan ${nf(dt.rules.length, 0)} aturan keputusan${dt.rules.length > 5 ? '; lima aturan pertama ditampilkan sebagai contoh dan seluruh aturan pada Lampiran D' : ''}.`);
		tb('Struktur pohon keputusan', ['Ukuran', 'Nilai'], [
			['Jumlah simpul', nf(ts.nodes, 0)], ['Jumlah daun', nf(ts.leaves, 0)], ['Kedalaman pohon', nf(ts.depth, 0)], ['Jumlah aturan', nf(dt.rules.length, 0)],
			['Data latih', nf(dt.trainingSize, 0)], ['Data uji', nf(dt.testSize, 0)],
		], ['l', 'r']);
		ul(dt.rules.slice(0, 5).map((r) => cut(r, 160)));
		const labels = Object.keys(dt.classDistribution).sort();
		const m = dt.confusionMatrix;
		dtLab = labels.length === m.length ? labels : m.map((_, i) => `Kelas ${i + 1}`);
		if (m.length >= 2 && m.length <= 6) {
			const gX = nextTab();
			p(`Matriks konfusi pada data uji ditunjukkan pada Tabel ${gX} dan Gambar ${nextFig()}; baris menyatakan kelas aktual dan kolom menyatakan kelas prediksi. Angka pada diagonal merupakan prediksi yang benar.`);
			tb('Matriks konfusi pada data uji', ['Aktual \\ Prediksi', ...dtLab.map((l) => cut(l, 10))],
				m.map((row, i) => [cut(dtLab[i], 14), ...row.map((v) => nf(v, 0))]));
			fg('Matriks konfusi pada data uji', matrixChart(dtLab.map((l) => cut(l, 8)), dtLab.map((l) => cut(l, 8)), m, { kind: 'count', fmt: (v) => nf(v, 0) }));
		}
		// metrik per kelas
		const N = sum(m.map((r) => sum(r)));
		const colSum = m.map((_, j) => sum(m.map((r) => r[j])));
		const perClass = m.map((row, i) => {
			const tp = row[i], fn = sum(row) - tp, fp = colSum[i] - tp;
			const pr = tp + fp > 0 ? tp / (tp + fp) : 0, rc = tp + fn > 0 ? tp / (tp + fn) : 0;
			return { l: dtLab[i], pr, rc, f1: pr + rc > 0 ? (2 * pr * rc) / (pr + rc) : 0, sup: sum(row) };
		});
		const macroF1 = perClass.length ? sum(perClass.map((x) => x.f1)) / perClass.length : 0;
		const macroP = perClass.length ? sum(perClass.map((x) => x.pr)) / perClass.length : 0;
		const macroR = perClass.length ? sum(perClass.map((x) => x.rc)) / perClass.length : 0;
		const wF1 = N > 0 ? sum(perClass.map((x) => x.f1 * x.sup)) / N : 0;
		const po = N > 0 ? sum(m.map((r, i) => r[i])) / N : 0;
		const pe = N > 0 ? sum(m.map((r, i) => sum(r) * colSum[i])) / (N * N) : 0;
		const kappa = pe < 1 ? (po - pe) / (1 - pe) : 0;
		const kWord = kappa >= 0.8 ? 'hampir sempurna' : kappa >= 0.6 ? 'substansial' : kappa >= 0.4 ? 'sedang' : kappa >= 0.2 ? 'lemah' : 'sangat lemah';
		const pm = dt.performanceMetrics, acc = dt.accuracy * 100;
		const sameMetric = Math.abs(pm.precision - dt.accuracy) < 1e-9 && Math.abs(pm.recall - dt.accuracy) < 1e-9;
		const grade = acc >= 90 ? 'sangat baik' : acc >= 75 ? 'baik' : acc >= 60 ? 'cukup' : 'masih rendah';
		const tM2 = nextTab();
		p(`Metrik kinerja model dirangkum pada Tabel ${tM2}. Model mencapai akurasi ${pct(acc)} pada ${nf(dt.testSize, 0)} data uji sehingga kinerjanya tergolong ${grade}, ${acc > majShare * 100 ? `lebih tinggi ${nf(acc - majShare * 100, 1)} poin persentase daripada akurasi dasar` : 'tidak melampaui akurasi dasar sehingga model belum memberi nilai tambah'}. ${sameMetric ? 'Precision, recall, dan F1-score mikro identik dengan akurasi (' + c('sokolova09') + '). ' : 'Precision, recall, dan F1-score dihitung secara agregat lintas kelas. '}Koefisien kappa ${nf(kappa, 3)} menunjukkan kesesuaian ${kWord} setelah memperhitungkan kebetulan (${c('cohen60')}).${acc >= 99 ? ' Akurasi yang sangat tinggi perlu diwaspadai sebagai indikasi overfitting atau kebocoran data, sehingga validasi silang disarankan (' + c('kaufman12') + ').' : ''}`);
		tb('Metrik kinerja model', ['Metrik', 'Nilai'], [
			['Akurasi', pct(acc, 2)], ['Akurasi dasar (mayoritas)', pct(majShare * 100, 2)], ['Precision (agregat)', pct(pm.precision * 100, 2)],
			['Recall (agregat)', pct(pm.recall * 100, 2)], ['F1-score (agregat)', pct(pm.f1Score * 100, 2)],
			['Precision makro', pct(macroP * 100, 2)], ['Recall makro', pct(macroR * 100, 2)], ['F1 makro', pct(macroF1 * 100, 2)],
			['F1 tertimbang', pct(wF1 * 100, 2)], ['Kappa Cohen', nf(kappa, 3)],
		], ['l', 'r']);
		if (perClass.length >= 2 && perClass.length <= 10) {
			const tPC = nextTab();
			const worst = [...perClass].sort((a, b) => a.f1 - b.f1)[0];
			p(`Kinerja per kelas disajikan pada Tabel ${tPC}. Kelas dengan F1-score terendah adalah "${cut(worst.l, 20)}" (${pct(worst.f1 * 100)}), sehingga kelas inilah yang paling sulit dikenali model. Selisih antara F1 makro (${pct(macroF1 * 100)}) dan F1 tertimbang (${pct(wF1 * 100)}) menggambarkan pengaruh ketidakseimbangan kelas (${c('grandini20')}).`);
			tb('Kinerja model per kelas', ['Kelas', 'Precision', 'Recall', 'F1', 'Dukungan'],
				perClass.map((x) => [cut(x.l, 14), pct(x.pr * 100, 1), pct(x.rc * 100, 1), pct(x.f1 * 100, 1), nf(x.sup, 0)]), ['l', 'r', 'r', 'r', 'r']);
		}
	} else {
		sub('Klasifikasi Decision Tree C4.5');
		p('Model Decision Tree tidak dibangun karena dataset tidak memiliki atribut kategorikal yang layak sebagai target (2 sampai 10 kelas) atau jumlah barisnya kurang dari 20.');
	}

	// I. Penyajian Penelitian
	sub('Penyajian Penelitian')
	p('Penyajian Penelitian Ini bertujuan untuk Menyajikan data dan membantu dalam menganalisa mendalam.')

	// L. Pembahasan terpadu
	sub('Pembahasan Terpadu');
	p(`Secara keseluruhan, kualitas data yang ${rating} (skor ${hl.qualityScore}%) menentukan seberapa jauh hasil analisis lanjutan dapat dipercaya (${c('wang96')}; ${c('whang23')}). ${hl.missingCells > 0 ? 'Keberadaan sel kosong menuntut keputusan eksplisit mengenai imputasi atau penghapusan agar tidak menimbulkan bias (' + c('schafer02') + '). ' : 'Tidak adanya sel kosong memudahkan pemodelan tanpa imputasi. '}${hl.outlierColsCount > 0 ? `Pencilan pada ${hl.outlierColsCount} kolom menunjukkan bahwa ukuran pemusatan berbasis median lebih tahan terhadap nilai ekstrem dibanding rata-rata. ` : ''}`);
	if (pairs.length) {
		p(`Struktur hubungan antarvariabel menunjukkan ${pairs.filter((x) => Math.abs(x.r) >= 0.7).length ? 'adanya pasangan variabel yang berkorelasi kuat sehingga seleksi fitur diperlukan untuk menghindari multikolinearitas' : 'korelasi yang umumnya tidak terlalu kuat sehingga setiap variabel cenderung membawa informasi yang relatif mandiri'}. Hal ini sejalan dengan anjuran untuk menafsirkan koefisien korelasi bersama ukuran efek dan konteks data (${c('akoglu18')}; ${c('cohen88')}).`);
	}
	if (tr0) { p(`Pola temporal pada "${tr0.num}" memberi petunjuk adanya dinamika antarperiode yang perlu dipertimbangkan dalam perencanaan, misalnya penjadwalan pengadaan atau pemantauan berkala.`); }
	if (stock) { p(`Pada sisi persediaan, kombinasi klasifikasi ABC, indeks konsentrasi, dan status stok memungkinkan prioritas pengelolaan yang terarah: pengawasan ketat untuk item kelas A, pengendalian sederhana untuk kelas C, serta penyesuaian pemesanan bagi item overstock (${c('silver98')}; ${c('chopra19')}).`); }
	if (dt) { p(`Model C4.5 memberi aturan yang mudah dijelaskan kepada pemangku kepentingan (${c('rudin19')}). Meski demikian, estimasi kinerja dari satu pembagian data bersifat tidak stabil sehingga hasil sebaiknya diverifikasi dengan validasi silang (${c('kohavi95')}) dan dibandingkan dengan model lain (${c('grinsz22')}).`); }

	// M. Implikasi
	sub('Implikasi dan Rekomendasi');
	const rec: string[][] = [];
	if (hl.missingCells > 0) { rec.push([`${nf(hl.missingCells, 0)} sel kosong`, 'Dapat membiaskan statistik dan model', 'Imputasi median/rata-rata atau penyaringan data']); }
	if (hl.duplicateRows > 0) { rec.push([`${nf(hl.duplicateRows, 0)} baris duplikat`, 'Menggandakan bobot observasi', 'Hapus baris duplikat']); }
	if (hl.outlierColsCount > 0) { rec.push([`${hl.outlierColsCount} kolom beroutlier`, 'Memengaruhi rata-rata dan simpangan baku', 'Verifikasi nilai ekstrem dan pertimbangkan transformasi']); }
	if (constCols.length) { rec.push([`${constCols.length} kolom konstan`, 'Tidak informatif', 'Hapus dari analisis']); }
	if (pairs.length && Math.abs(pairs[0].r) >= 0.7) { rec.push([`Korelasi kuat (r = ${nf(pairs[0].r, 2)})`, 'Potensi multikolinearitas', 'Seleksi fitur sebelum pemodelan']); }
	if (stock && stock.kpis.criticalCount > 0) { rec.push([`${stock.kpis.criticalCount} item kritis`, 'Risiko kehabisan stok', 'Terbitkan pesanan darurat']); }
	if (stock && stock.kpis.overstockCount > 0) { rec.push([`${stock.kpis.overstockCount} item overstock`, 'Modal kerja tertahan', 'Promosi atau penyesuaian pemesanan']); }
	if (dt && dt.accuracy >= 0.99) { rec.push(['Akurasi ≥ 99%', 'Indikasi overfitting atau kebocoran data', 'Validasi silang dan uji data baru']); }
	if (!rec.length) { rec.push(['Tidak ada masalah signifikan', 'Dataset siap dianalisis lanjut', 'Pertahankan prosedur pengumpulan data']); }
	const tR = nextTab();
	p(`Ringkasan temuan, implikasi, dan rekomendasi tindak lanjut disajikan pada Tabel ${tR}.`);
	tb('Ringkasan temuan, implikasi, dan rekomendasi', ['Temuan', 'Implikasi', 'Rekomendasi'], rec, ['l', 'l', 'l']);

	// Tujuan Penelitian
	sub('Tujuan Penelitian');
	p(`Secara spesifik, penelitian ini bermaksud untuk menganalisa kebutuhan dan juga menentukan data melalui beberapa sasaran utama sebagai berikut:`);

	const tujuanPoin: string[] = [];
	tujuanPoin.push(`Menganalisis kualitas dan integritas data (skor saat ini: ${hl.qualityScore}%) serta mengidentifikasi penanganan yang tepat terhadap ${hl.missingCells > 0 ? 'sel kosong' : 'struktur data'} dan ${hl.outlierColsCount > 0 ? 'nilai pencilan' : 'sebaran data'}.`);
	if (pairs.length) {
		tujuanPoin.push(`Petakan hubungan dan korelasi antarvariabel guna menentukan derajat keterikatan fitur serta menghindari risiko multikolinearitas dalam pemodelan.`);
	}
	if (tr0) {
		tujuanPoin.push(`Mengidentifikasi pola temporal dan dinamika perubahan data antarperiode pada variabel "${tr0.num}" untuk kebutuhan proyeksi atau perencanaan berkala.`);
	}
	if (stock) {
		tujuanPoin.push(`Menentukan prioritas pengelolaan aset persediaan melalui klasifikasi ABC serta memetakan kondisi item yang mengalami kritis maupun overstock.`);
	}
	if (dt) {
		tujuanPoin.push(`Mengevaluasi kinerja model klasifikasi C4.5 dalam menghasilkan aturan keputusan yang akurat, stabil, dan mudah diinterpretasikan oleh pemangku kepentingan.`);
	}
	tujuanPoin.forEach((poin, index) => {
		const huruf = String.fromCharCode(97 + index);
		p(`${huruf}. ${poin}`);
	});

	// Maksud Penelitian
	sub('Makdud Penelitian')
	p(`Maksud penelitian ini bermaksud untuk menyempurnakan date dan juga dapat mempermudah dalam penelitian`)
	const maksud: string[] = [];
	maksud.push(`Secara umum, penelitian ini bermaksud untuk membantu peneliti, mahasiswa, dan profesional data dalam menganalisis data tabular dengan lebih cepat, interaktif, dan terstruktur.`)
	if (hl.missingCells > 0 || hl.duplicateRows > 0 || hl.outlierColsCount > 0) {
		maksud.push(`Secara khusus, penelitian ini bermaksud untuk membantu peneliti, mahasiswa, dan profesional data dalam menganalisis data tabular dengan lebih cepat, interaktif, dan terstruktur.`)
	}
	if (pairs.length) {
		maksud.push(`Menemukan pengetahuan baru (eksploratif): Mengungkap fakta atau data yang sebelumnya belum diketahui.`)
	}
	if (tr0) {
		maksud.push(`Menguji kebenaran (verifikatif): Membuktikan ketepatan suatu teori, asumsi, atau hipotesis yang sudah ada.`)
	}
	if (stock) {
		maksud.push(`Mengembangkan ilmu (pengembangan): Memperbaiki, memperluas, atau memodifikasi teori dan praktik yang sedang berjalan.	`)
	}
	if (dt) {
		maksud.push(`Memecahkan masalah: Memberikan solusi berbasis data terhadap kendala nyata di berbagai bidang (seperti pendidikan, kesehatan, teknologi, atau sosial).`)
	}
	maksud.forEach((poin, index) => {
		const huruf = String.fromCharCode(97 + index);
		p(`${huruf}. ${poin}`);
	});

	// Manfaat Penelitian
	sub(`Manfaat Penlitian`)
	p(`Manfaat ini bermaksud untuk menyempurnakan date dan juga dapat mempermudah dalam penelitian`)
	const manfaat: string[] = [];
	manfaat.push(`Secara umum manfaat penelitian ini adalah membantu dalam menganalisis data tabular dengan lebih cepat, interaktif, dan terstruktur.`)
	if (hl.missingCells > 0 || hl.duplicateRows > 0 || hl.outlierColsCount > 0) {
		manfaat.push(`Menemukan pengetahuan baru (eksploratif): Mengungkap fakta atau data yang sebelumnya belum diketahui.`)
	}
	if (pairs.length) {
		manfaat.push(`Mengembangkan ilmu pengetahuan.`)
	}
	if (tr0) {
		manfaat.push(`Menjadi referensi penelitian selanjutnya.`)
	}
	if (stock) {
		manfaat.push(`Memberikan kontribusi pada ilmu pengetahuan.`)
	}
	manfaat.forEach((poin, index) => {
		const huruf = String.fromCharCode(97 + index);
		p(`${huruf}. ${poin}`);
	});


	// ═════════ V. KETERBATASAN ═════════
	h1('V. Keterbatasan Penelitian');
	p('Beberapa keterbatasan perlu diperhatikan agar hasil tidak ditafsirkan berlebihan.');
	const lim = [
		'Analisis bersifat deskriptif dan asosiatif sehingga tidak menunjukkan hubungan sebab-akibat.',
		'Tipe kolom, deteksi kolom persediaan, dan pemilihan atribut target ditentukan secara otomatis berdasarkan nama dan isi kolom; hasilnya perlu diverifikasi oleh pemilik data.',
		'Deteksi outlier menggunakan aturan IQR yang mengasumsikan sebaran tidak terlalu miring; pada data sangat miring banyak nilai valid dapat terdeteksi sebagai pencilan.',
		'Parameter regresi dan korelasi pasangan diplot dari sampel titik, dan uji chi-kuadrat dilakukan pada kategori teratas, sehingga bersifat pendekatan.',
		'Ambang status stok bersifat relatif terhadap median kuantitas, bukan terhadap laju permintaan atau waktu tunggu pemasok.',
	];
	if (dt) {
		lim.push('Model C4.5 dievaluasi dengan satu pembagian data latih dan uji acak tanpa validasi silang; atribut numerik diperlakukan menurut nilai uniknya tanpa diskretisasi ambang sehingga atribut bernilai banyak dapat membentuk cabang berlebih (' + c('hawkins04') + ').');
	}
	if (sheet.truncated) { lim.push('Dataset dianalisis sebagian karena melebihi batas baris maksimum.'); }
	ul(lim);

	// ═════════ VI. PENUTUP ═════════
	h1('VI. Penutup');
	sub('Kesimpulan');
	const concl: string[] = [`Dataset "${base}" berisi ${nf(n, 0)} baris dan ${pCols} kolom dengan skor kualitas ${hl.qualityScore}% (${rating}).`];
	if (mostVar) { concl.push(`Variabel "${mostVar.name}" memiliki keragaman relatif tertinggi (CV = ${nf(cvOf(mostVar), 2)}).`); }
	if (pairs.length) { concl.push(`Korelasi terkuat terdapat antara "${pairs[0].a}" dan "${pairs[0].b}" (r = ${nf(pairs[0].r, 3)}).`); }
	if (stock) { concl.push(`Dari ${nf(stock.kpis.totalSKUs, 0)} SKU, ${nf(stock.kpis.criticalCount, 0)} item kritis, ${nf(stock.kpis.lowCount, 0)} item menipis, dan ${nf(stock.kpis.overstockCount, 0)} item overstock.`); }
	if (needs) { concl.push(`Estimasi anggaran pengadaan prioritas adalah ${nf(needs.totalProcurementBudget)}.`); }
	if (dt) { concl.push(`Model C4.5 untuk target "${dt.targetAttribute}" mencapai akurasi ${pct(dt.accuracy * 100)} dengan fitur terpenting "${dt.featureImportance[0]?.feature ?? '-'}".`); }
	p(concl.join(' '));
	sub('Saran');
	const advice = hl.cleaningRecommendations.map(noEmoji);
	if (dt) { advice.push('Lakukan validasi silang dan uji pada data baru sebelum model digunakan untuk pengambilan keputusan.'); }
	advice.push('Penelitian selanjutnya disarankan membandingkan hasil dengan algoritma lain, menggunakan data dari periode yang berbeda, dan menambahkan uji inferensial seperti analisis varians untuk perbandingan kelompok.');
	p(advice.join(' '));

	// ═════════ LAMPIRAN ═════════
	out = APP;
	out.push({ t: 'pagebreak' });
	h1('Lampiran');
	sub('Kamus Data Lengkap');
	p(`Daftar seluruh kolom beserta tipe, jumlah terisi, persentase hilang, dan jumlah nilai unik${pCols > 40 ? ' (40 kolom pertama)' : ''}.`);
	tb('Kamus data lengkap', ['Kolom', 'Tipe', 'Terisi', 'Hilang (%)', 'Unik'],
		sheet.columns.slice(0, 40).map((x) => [cut(x.name, 18), TYPE_SHORT[x.type], nf(x.count, 0), nf((x.missing / Math.max(1, x.missing + x.count)) * 100, 1), nf(x.unique, 0)]),
		['l', 'c', 'r', 'r', 'r']);
	if (cc.length >= 2) {
		sub('Matriks Korelasi Lengkap');
		p(`Matriks korelasi Pearson untuk ${cc.length} variabel numerik. Nomor: ${cc.map((x, i) => `${i + 1} = ${cut(x, 20)}`).join('; ')}.`);
		fg('Peta panas korelasi Pearson lengkap', matrixChart(cc.map((x, i) => `${i + 1}.${x}`), cc.map((_, i) => String(i + 1)), matrix, { kind: 'corr' }));
	}
	if (dt) {
		sub('Perhitungan Rinci Decision Tree');
		const calc = dt.detailedCalculations.slice(0, 12);
		p(`Langkah awal perhitungan entropi dan gain ratio pada pembentukan pohon (${calc.length} langkah pertama dari ${dt.detailedCalculations.length}).`);
		tb('Langkah perhitungan Decision Tree', ['No', 'Uraian', 'Hasil'], calc.map((x) => [String(x.step), cut(noEmoji(x.description), 48), cut(String(x.result), 60)]), ['c', 'l', 'l']);
		sub('Seluruh Aturan Keputusan');
		ul(dt.rules.slice(0, 40).map((r) => cut(r, 200)));
	}
	if (stock && needs && needs.procurementItems.length) {
		sub('Daftar Pengadaan');
		tb('Daftar item pengadaan (maksimum 30 item)', ['Item', 'Stok', 'Pesan', 'Biaya', 'Prioritas'],
			needs.procurementItems.slice(0, 30).map((x) => [cut(x.name, 20), nf(x.currentStock), nf(x.recommendedQty), nf(x.estimatedCost), x.priority]), ['l', 'r', 'r', 'r', 'c']);
	}
	if (stock) {
		sub('Daftar Item Persediaan');
		tb('Item persediaan menurut nilai (maksimum 30 item)', ['Item', 'Stok', 'Nilai', 'Status', 'ABC'],
			stock.items.slice(0, 30).map((x) => [cut(x.name, 20), nf(x.quantity), nf(x.totalValue), x.statusLabel, x.abcClass]), ['l', 'r', 'r', 'c', 'c']);
	}
	sub('Catatan Otomatis Sistem');
	ul(sheet.insights.map(noEmoji).slice(0, 25).map((s) => cut(s, 220)));

	// ───────── daftar pustaka (APA, urut abjad) ─────────
	const entries = [...used].map((key) => refs[key].runs)
		.sort((a, b) => a.map((r) => r.text).join('').localeCompare(b.map((r) => r.text).join(''), 'en'));
	return {
		title, author: meta.author, affiliation: meta.affiliation, email: meta.email, date,
		abstractId, keywordsId: keywordsId.join(', '), abstractEn, keywordsEn: keywordsEn.join(', '),
		blocks: B, refRuns: entries, references: entries.map((e) => e.map((r) => r.text).join('')), appendix: APP,
	};
}