
export interface DecisionTreeNode {
	attribute?: string;
	/** Label cabang yang ditampilkan pada tepi (mis. `= Merah`, `<= 3.5`, `> 3.5`). */
	value?: any;
	/** Kondisi tepi dalam bentuk dapat dibaca. */
	condition?: string;
	splitType?: 'categorical' | 'numeric';
	/** Untuk cabang hasil split numerik. */
	threshold?: number;
	test?: 'lte' | 'gt';
	label?: string;
	children?: DecisionTreeNode[];
	samples?: number;
	distribution?: Record<string, number>;
	entropy?: number;
	gain?: number;
	splitInfo?: number;
	gainRatio?: number;
	depth?: number;
	/** Tingkat kesalahan simpul terhadap data latihnya (1 − kemurnian kelas mayoritas). */
	errorRate?: number;
	isLeaf: boolean;
}

export interface SplitMetrics {
	attribute: string;
	type: 'categorical' | 'numeric';
	entropy: number;
	informationGain: number;
	splitInfo: number;
	gainRatio: number;
	/** Penurunan indeks Gini sebagai pembanding kriteria pemilihan. */
	giniGain: number;
	splitPoints?: any[];
	uniqueValues?: number;
	/** Jumlah simpul pohon yang memakai atribut ini (diisi setelah pohon terbentuk). */
	usedAtNodes?: number;
	usedAtRoot?: boolean;
	depthFirstUsed?: number;
}

export interface ClassMetric {
	label: string;
	support: number;
	predicted: number;
	tp: number;
	fp: number;
	fn: number;
	precision: number;
	recall: number;
	f1: number;
	specificity: number;
}

export interface AggregateMetrics {
	accuracy: number;
	microF1: number;
	macroPrecision: number;
	macroRecall: number;
	macroF1: number;
	weightedPrecision: number;
	weightedRecall: number;
	weightedF1: number;
	kappa: number;
	mcc: number;
}

export interface TreeShape {
	nodes: number;
	internalNodes: number;
	leaves: number;
	depth: number;
	avgLeafSamples: number;
	minLeafSamples: number;
	maxLeafSamples: number;
	avgRuleLength: number;
	leafPurityAvg: number;
	leavesWithError: number;
}

export interface RuleDetail {
	index: number;
	condition: string;
	prediction: string;
	samples: number;
	/** Kemurnian daun (kelas mayoritas / seluruh sampel daun). */
	confidence: number;
	error: number;
	/** Porsi data latih yang jatuh ke aturan ini. */
	coverage: number;
	classDistribution: Record<string, number>;
}

export interface AttributeUsage {
	attribute: string;
	type: 'categorical' | 'numeric';
	nodes: number;
	depthFirstUsed: number;
	isRoot: boolean;
	uniqueValues: number;
}

export interface MisclassificationPair {
	actual: string;
	predicted: string;
	count: number;
	share: number;
}

export interface NumericSplitInfo {
	attribute: string;
	threshold: number;
	gainRatio: number;
	leftSamples: number;
	rightSamples: number;
	depth: number;
}

export interface BaselineInfo {
	majorityClass: string;
	accuracy: number;
	noInformationRate: number;
	entropyBits: number;
	maxEntropyBits: number;
	normalizedEntropy: number;
}

export interface FoldDetail {
	fold: number;
	trainSize: number;
	testSize: number;
	accuracy: number;
	macroF1: number;
	rootAttribute: string;
	leaves: number;
	depth: number;
}

export interface CrossValidationResult {
	folds: number;
	seed: number;
	sampled: boolean;
	sampleSize: number;
	meanAccuracy: number;
	stdAccuracy: number;
	minAccuracy: number;
	maxAccuracy: number;
	meanMacroF1: number;
	stdMacroF1: number;
	meanLeaves: number;
	meanDepth: number;
	foldDetails: FoldDetail[];
	rootStability: { attribute: string; count: number; share: number }[];
}

export interface PruningReport {
	applied: boolean;
	method: 'reduced-error';
	validationSize: number;
	nodesBefore: number;
	leavesBefore: number;
	nodesAfter: number;
	leavesAfter: number;
	subtreesPruned: number;
	accuracyValidationBefore: number;
	accuracyValidationAfter: number;
}

export interface DecisionTreeConfig {
	targetAttribute: string;
	maxDepth: number;
	testSplit: number;
	seed: number;
	minSamplesLeaf: number;
	minGainRatio: number;
	maxBranches: number;
	mergeRare: boolean;
	pruning: boolean;
	cvFolds: number;
	predictiveAttributes: string[];
	numericAttributes: string[];
	excludedAttributes: string[];
}

export interface DecisionTreeAnalysis {
	tree: DecisionTreeNode;
	rules: string[];
	ruleDetails: RuleDetail[];
	accuracy: number;
	confusionMatrix: number[][];
	confusionLabels: string[];
	featureImportance: { feature: string; importance: number }[];
	splitMetrics: SplitMetrics[];
	trainingSize: number;
	testSize: number;
	targetAttribute: string;
	predictiveAttributes: string[];
	classDistribution: Record<string, number>;
	outputDistribution: Record<string, number>;
	detailedCalculations: {
		step: number;
		description: string;
		formula: string;
		calculation: string;
		result: number | string;
	}[];
	performanceMetrics: {
		precision: number;
		recall: number;
		f1Score: number;
		specificity: number;
		macroPrecision: number;
		macroRecall: number;
		macroF1: number;
		weightedF1: number;
		kappa: number;
		mcc: number;
	};
	treeShape: TreeShape;
	perClassMetrics: ClassMetric[];
	aggregateMetrics: AggregateMetrics;
	baseline: BaselineInfo;
	attributeUsage: AttributeUsage[];
	numericSplits: NumericSplitInfo[];
	misclassified: MisclassificationPair[];
	predictions: { actual: string; predicted: string; correct: boolean }[];
	crossValidation?: CrossValidationResult;
	pruning?: PruningReport;
	config: DecisionTreeConfig;
}

export interface DecisionTreeOptions {
	maxDepth?: number;
	testSplit?: number;
	excludeAttributes?: string[];
	seed?: number;
	minSamplesLeaf?: number;
	minGainRatio?: number;
	maxBranches?: number;
	mergeRare?: boolean;
	pruning?: boolean;
	validationSplit?: number;
	cvFolds?: number;
	cvMaxRows?: number;
}

type DataRow = Record<string, any>;

const MAX_CALC_STEPS = 400;
const MAX_NUMERIC_CANDIDATES = 160;

// ═══════════════════════════════════════════════════════════════════════════════
// Utilitas dasar
// ═══════════════════════════════════════════════════════════════════════════════

function numericOf(value: any): number | null {
	if (typeof value === 'number') { return Number.isFinite(value) ? value : null; }
	if (typeof value === 'string') {
		const t = value.trim().replace(/\s/g, '');
		if (!t) { return null; }
		const plain = /^-?\d+(?:[.,]\d+)?$/.test(t) ? t.replace(',', '.') : t.replace(/[.,](?=\d{3}\b)/g, '');
		const n = Number(plain.replace(/,/g, ''));
		return Number.isFinite(n) ? n : null;
	}
	return null;
}

function makeRandom(seed: number): () => number {
	let a = (seed >>> 0) || 1;
	return () => {
		a = (a + 0x6D2B79F5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function shuffle<T>(items: T[], random: () => number): T[] {
	const out = items.slice();
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
	}
	return out;
}

function round4(x: number): number {
	return Math.round((Number.isFinite(x) ? x : 0) * 1e4) / 1e4;
}

function distributionOf(rows: DataRow[], targetAttr: string): Record<string, number> {
	const out: Record<string, number> = {};
	rows.forEach((row) => {
		const cls = String(row[targetAttr]);
		out[cls] = (out[cls] || 0) + 1;
	});
	return out;
}

function majorityOf(distribution: Record<string, number>): string {
	const sorted = Object.entries(distribution).sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));
	return sorted.length ? sorted[0][0] : 'Unknown';
}

function entropyFromMap(counts: Map<string, number>, total: number): number {
	if (total <= 0) { return 0; }
	let h = 0;
	counts.forEach((count) => {
		if (count > 0) {
			const p = count / total;
			h -= p * Math.log2(p);
		}
	});
	return h;
}

function giniFromMap(counts: Map<string, number>, total: number): number {
	if (total <= 0) { return 0; }
	let sum = 0;
	counts.forEach((count) => {
		const p = count / total;
		sum += p * p;
	});
	return 1 - sum;
}

/** Entropi sebuah himpunan data: H(S) = −Σ p_i · log2(p_i). */
function calculateEntropy(data: DataRow[], targetAttr: string): number {
	if (!data.length) { return 0; }
	const counts = new Map<string, number>();
	data.forEach((row) => {
		const cls = String(row[targetAttr]);
		counts.set(cls, (counts.get(cls) || 0) + 1);
	});
	return entropyFromMap(counts, data.length);
}

/** Entropi + indeks Gini sebuah dataset. */
function impurity(data: DataRow[], targetAttr: string): { entropy: number; gini: number } {
	if (!data.length) { return { entropy: 0, gini: 0 }; }
	const counts = new Map<string, number>();
	data.forEach((row) => {
		const cls = String(row[targetAttr]);
		counts.set(cls, (counts.get(cls) || 0) + 1);
	});
	return { entropy: entropyFromMap(counts, data.length), gini: giniFromMap(counts, data.length) };
}

/** Frekuensi nilai unik sebuah atribut (tanpa nilai kosong). */
function valueCounts(rows: DataRow[], attr: string): Map<string, number> {
	const counts = new Map<string, number>();
	rows.forEach((row) => {
		const raw = row[attr];
		if (raw === null || raw === undefined || String(raw).trim() === '') { return; }
		const key = String(raw);
		counts.set(key, (counts.get(key) || 0) + 1);
	});
	return counts;
}

/** Profil sebuah atribut: numerik (semua nilai terisi berupa angka) atau kategorikal. */
function attributeProfile(rows: DataRow[], attr: string): { type: 'categorical' | 'numeric'; unique: number; missing: number; numericCount: number } {
	const values = new Set<string>();
	let filled = 0, numericCount = 0;
	rows.forEach((row) => {
		const raw = row[attr];
		if (raw === null || raw === undefined || String(raw).trim() === '') { return; }
		filled += 1;
		values.add(String(raw));
		if (numericOf(raw) !== null) { numericCount += 1; }
	});
	const numeric = filled > 0 && numericCount === filled;
	return { type: numeric ? 'numeric' : 'categorical', unique: values.size, missing: rows.length - filled, numericCount };
}

function rareThreshold(nodeSize: number, mergeRare: boolean): number {
	if (!mergeRare) { return 0; }
	if (nodeSize < 20) { return 0; }
	return Math.min(5, Math.max(1, Math.floor(nodeSize * 0.02)));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Evaluasi split
// ═══════════════════════════════════════════════════════════════════════════════

interface Branch {
	key: string;
	label: string;
	rows: DataRow[];
	threshold?: number;
	test?: 'lte' | 'gt';
}

interface SplitEvaluation {
	attribute: string;
	type: 'categorical' | 'numeric';
	entropy: number;
	gain: number;
	splitInfo: number;
	gainRatio: number;
	giniGain: number;
	branches: Branch[];
	uniqueValues: number;
	rareMerged: number;
	candidatesTried: number;
	bestThreshold?: number;
}

function bestNumericSplit(rows: DataRow[], attr: string, targetAttr: string): { threshold: number; gain: number; splitInfo: number; gainRatio: number; giniGain: number; candidates: number } | null {
	const pairs: { v: number; cls: string }[] = [];
	rows.forEach((row) => {
		const v = numericOf(row[attr]);
		if (v !== null) { pairs.push({ v, cls: String(row[targetAttr]) }); }
	});
	const n = pairs.length;
	if (n < 2) { return null; }
	pairs.sort((a, b) => a.v - b.v);

	const totalCounts = new Map<string, number>();
	pairs.forEach((p) => totalCounts.set(p.cls, (totalCounts.get(p.cls) || 0) + 1));
	const h0 = entropyFromMap(totalCounts, n);
	const g0 = giniFromMap(totalCounts, n);

	const cuts: number[] = [];
	for (let i = 1; i < n; i++) { if (pairs[i - 1].v !== pairs[i].v) { cuts.push(i); } }
	if (!cuts.length) { return null; }

	const step = Math.max(1, Math.ceil(cuts.length / MAX_NUMERIC_CANDIDATES));
	const left = new Map<string, number>();
	const right = new Map(totalCounts);
	let leftN = 0;
	let best: { threshold: number; gain: number; splitInfo: number; gainRatio: number; giniGain: number } | null = null;
	let tried = 0;

	for (let ci = 0; ci < cuts.length; ci++) {
		const i = cuts[ci];
		// Pindahkan baris [leftN, i) ke sisi kiri; kanan berkurang bersamaan.
		for (let k = leftN; k < i; k++) {
			const cls = pairs[k].cls;
			left.set(cls, (left.get(cls) || 0) + 1);
			const rc = (right.get(cls) || 0) - 1;
			if (rc > 0) { right.set(cls, rc); } else { right.delete(cls); }
		}
		leftN = i;
		if (ci % step !== 0 && ci !== cuts.length - 1) { continue; }
		tried += 1;

		const rightN = n - leftN;
		const wl = leftN / n, wr = rightN / n;
		const gain = h0 - (wl * entropyFromMap(left, leftN) + wr * entropyFromMap(right, rightN));
		const splitInfo = -((wl > 0 ? wl * Math.log2(wl) : 0) + (wr > 0 ? wr * Math.log2(wr) : 0));
		const giniGain = g0 - (wl * giniFromMap(left, leftN) + wr * giniFromMap(right, rightN));
		const gainRatio = splitInfo > 0 ? gain / splitInfo : 0;
		const threshold = (pairs[i - 1].v + pairs[i].v) / 2;

		if (!best
			|| gainRatio > best.gainRatio + 1e-12
			|| (Math.abs(gainRatio - best.gainRatio) <= 1e-12 && gain > best.gain)) {
			best = { threshold, gain, splitInfo, gainRatio, giniGain };
		}
	}

	return best ? { ...best, candidates: tried } : null;
}

/** Evaluasi satu atribut: gain, split info, gain ratio, Gini, dan cabang-cabangnya. */
function evaluateAttribute(rows: DataRow[], attr: string, targetAttr: string, profileType: 'categorical' | 'numeric', mergeRare: boolean): SplitEvaluation | null {
	const { entropy: h0, gini: g0 } = impurity(rows, targetAttr);

	if (profileType === 'numeric') {
		const best = bestNumericSplit(rows, attr, targetAttr);
		if (!best) { return null; }
		const left: DataRow[] = [], right: DataRow[] = [];
		rows.forEach((row) => {
			const v = numericOf(row[attr]);
			if (v === null) { return; }
			(v <= best.threshold ? left : right).push(row);
		});
		// Anotasi Branch[] perlu: tanpa itu literal 'lte'/'gt' melebar jadi string
		// sehingga hasil .filter() tidak lagi assignable ke SplitEvaluation.branches.
		const branches: Branch[] = [
			{ key: 'lte', label: `<= ${round4(best.threshold)}`, rows: left, threshold: best.threshold, test: 'lte' },
			{ key: 'gt', label: `> ${round4(best.threshold)}`, rows: right, threshold: best.threshold, test: 'gt' },
		];
		return {
			attribute: attr,
			type: 'numeric',
			entropy: h0,
			gain: best.gain,
			splitInfo: best.splitInfo,
			gainRatio: best.gainRatio,
			giniGain: best.giniGain,
			branches: branches.filter((b) => b.rows.length > 0),
			uniqueValues: new Set(rows.map((r) => String(r[attr]))).size,
			rareMerged: 0,
			candidatesTried: best.candidates,
			bestThreshold: best.threshold,
		};
	}

	// Kategorikal: hitung frekuensi, gabungkan nilai jarang ke “(lainnya)” bila perlu.
	const counts = valueCounts(rows, attr);
	const limit = rareThreshold(rows.length, mergeRare);
	const rare: string[] = [];
	if (limit > 0) {
		counts.forEach((count, key) => { if (count < limit) { rare.push(key); } });
	}
	const mergeKeys = rare.length > 1 && counts.size > 2 ? new Set(rare) : new Set<string>();

	const buckets = new Map<string, DataRow[]>();
	rows.forEach((row) => {
		const raw = String(row[attr] ?? '');
		const key = mergeKeys.has(raw) ? '(lainnya)' : raw;
		const bucket = buckets.get(key);
		if (bucket) { bucket.push(row); } else { buckets.set(key, [row]); }
	});

	if (buckets.size < 2) { return null; }

	let weightedEntropy = 0, weightedGini = 0, splitInfo = 0;
	buckets.forEach((bucket) => {
		const w = bucket.length / rows.length;
		const imp = impurity(bucket, targetAttr);
		weightedEntropy += w * imp.entropy;
		weightedGini += w * imp.gini;
		if (w > 0) { splitInfo -= w * Math.log2(w); }
	});
	const gain = h0 - weightedEntropy;
	const gainRatio = splitInfo > 0 ? gain / splitInfo : 0;

	return {
		attribute: attr,
		type: 'categorical',
		entropy: h0,
		gain,
		splitInfo,
		gainRatio,
		giniGain: g0 - weightedGini,
		branches: Array.from(buckets.entries()).map(([key, bucket]) => ({ key, label: key, rows: bucket })),
		uniqueValues: counts.size,
		rareMerged: mergeKeys.size,
		candidatesTried: 1,
	};
}

/** Atribut terbaik untuk split: gain ratio tertinggi, tie-break gain lalu jumlah cabang. */
function findBestAttribute(
	rows: DataRow[],
	attributes: string[],
	targetAttr: string,
	profiles: Map<string, 'categorical' | 'numeric'>,
	options: Required<Pick<DecisionTreeOptions, 'mergeRare' | 'minGainRatio' | 'maxBranches'>> & { minBranch: number },
	calculations: any[],
	depth: number,
): SplitEvaluation | null {
	if (!attributes.length) { return null; }
	let best: SplitEvaluation | null = null;
	let skippedSmall = 0;

	for (const attr of attributes) {
		const evaluation = evaluateAttribute(rows, attr, targetAttr, profiles.get(attr) || 'categorical', options.mergeRare);
		if (!evaluation) { continue; }
		// Setiap cabang harus berisi cukup baris: mencegah cabang “1 baris” yang membuat pohon tidak rapi.
		if (options.minBranch > 1 && evaluation.branches.some((b) => b.rows.length < options.minBranch)) {
			skippedSmall += 1;
			continue;
		}
		if (!best
			|| evaluation.gainRatio > best.gainRatio + 1e-12
			|| (Math.abs(evaluation.gainRatio - best.gainRatio) <= 1e-12 && evaluation.gain > best.gain + 1e-12)
			|| (Math.abs(evaluation.gainRatio - best.gainRatio) <= 1e-12 && Math.abs(evaluation.gain - best.gain) <= 1e-12 && evaluation.branches.length < best.branches.length)) {
			best = evaluation;
		}
	}
	if (!best) {
		if (skippedSmall) {
			pushCalc(calculations, {
				description: `Tidak ada split yang memenuhi syarat pada kedalaman ${depth}`,
				formula: `minimal ${options.minBranch} baris per cabang`,
				calculation: `${skippedSmall} atribut diabaikan karena ada cabang dengan baris kurang dari ${options.minBranch}`,
				result: 'Simpul menjadi daun (kelas mayoritas)',
			});
		}
		return null;
	}

	// Batas gain ratio minimal (pra-pemangkasan).
	if (best.gain <= 0 || best.gainRatio < options.minGainRatio) { return null; }

	const detailRows = best.branches
		.slice(0, 10)
		.map((b) => `  - Cabang \"${b.label}\": ${b.rows.length} sampel (${((b.rows.length / rows.length) * 100).toFixed(1)}%), H = ${calculateEntropy(b.rows, targetAttr).toFixed(4)}`)
		.join('\n');
	pushCalc(calculations, {
		description: `Split terbaik pada kedalaman ${depth}: atribut \"${best.attribute}\" (${best.type === 'numeric' ? 'numerik, ambang' : 'kategorikal'})`,
		formula: 'GainRatio = Gain / SplitInfo  (IG(S,A) = H(S) − Σ (|Sᵥ|/|S|) × H(Sᵥ))',
		calculation: `H(S) = ${best.entropy.toFixed(4)} (${rows.length} sampel)\n${detailRows}${best.rareMerged ? `\n  - ${best.rareMerged} nilai jarang digabung ke cabang \"(lainnya)\"` : ''}${best.candidatesTried > 1 ? `\n  - ${best.candidatesTried} kandidat ambang diuji; terpilih ambang ${round4(best.bestThreshold ?? 0)}` : ''}`,
		result: `IG = ${best.gain.toFixed(4)}, Split Info = ${best.splitInfo.toFixed(4)}, Gain Ratio = ${best.gainRatio.toFixed(4)}, Gini Gain = ${best.giniGain.toFixed(4)}`,
	});
	return best;
}

/** Tambahkan langkah rinci bila kuota belum penuh. */
function pushCalc(calculations: any[], entry: { description: string; formula: string; calculation: string; result: number | string }): void {
	if (calculations.length >= MAX_CALC_STEPS) { return; }
	calculations.push({ step: calculations.length + 1, ...entry });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pembentukan pohon
// ═══════════════════════════════════════════════════════════════════════════════

interface BuildContext {
	targetAttr: string;
	profiles: Map<string, 'categorical' | 'numeric'>;
	maxDepth: number;
	minSamplesLeaf: number;
	mergeRare: boolean;
	minGainRatio: number;
	maxBranches: number;
	calculations: any[];
}

/** Buat daun dari sekumpulan baris. */
function makeLeaf(rows: DataRow[], targetAttr: string, depth: number, note?: string): DecisionTreeNode {
	const distribution = distributionOf(rows, targetAttr);
	const label = majorityOf(distribution);
	return {
		isLeaf: true,
		label,
		samples: rows.length,
		distribution,
		entropy: calculateEntropy(rows, targetAttr),
		depth,
		errorRate: rows.length ? 1 - (distribution[label] || 0) / rows.length : 0,
		condition: note,
	};
}

/** Bangun pohon secara rekursif dengan pra-pemangkasan. */
function buildTree(rows: DataRow[], attributes: string[], ctx: BuildContext, depth: number): DecisionTreeNode {
	const classes = new Set(rows.map((row) => String(ctx.targetAttr in row ? row[ctx.targetAttr] : '')));
	if (classes.size <= 1) { return makeLeaf(rows, ctx.targetAttr, depth, 'semua sampel satu kelas'); }
	if (!attributes.length) { return makeLeaf(rows, ctx.targetAttr, depth, 'tidak ada atribut tersisa'); }
	if (depth >= ctx.maxDepth) { return makeLeaf(rows, ctx.targetAttr, depth, `kedalaman maksimum ${ctx.maxDepth} tercapai`); }
	if (rows.length < ctx.minSamplesLeaf * 2) { return makeLeaf(rows, ctx.targetAttr, depth, `sampel < 2 × minimal daun (${ctx.minSamplesLeaf})`); }

	const best = findBestAttribute(rows, attributes, ctx.targetAttr, ctx.profiles, {
		mergeRare: ctx.mergeRare, minGainRatio: ctx.minGainRatio, maxBranches: ctx.maxBranches,
		minBranch: ctx.minSamplesLeaf,
	}, ctx.calculations, depth);
	if (!best) { return makeLeaf(rows, ctx.targetAttr, depth, 'tidak ada split yang menambah informasi'); }

	const distribution = distributionOf(rows, ctx.targetAttr);
	const node: DecisionTreeNode = {
		attribute: best.attribute,
		isLeaf: false,
		samples: rows.length,
		distribution,
		entropy: best.entropy,
		gain: best.gain,
		splitInfo: best.splitInfo,
		gainRatio: best.gainRatio,
		splitType: best.type,
		depth,
		children: [],
	};

	const remaining = attributes.filter((a) => a !== best.attribute);
	best.branches.forEach((branch) => {
		const child = branch.rows.length < ctx.minSamplesLeaf
			? makeLeaf(branch.rows, ctx.targetAttr, depth + 1, `cabang < minimal daun (${ctx.minSamplesLeaf})`)
			: buildTree(branch.rows, remaining, ctx, depth + 1);
		child.value = branch.label;
		child.condition = branch.label;
		child.test = branch.test;
		child.threshold = branch.threshold;
		child.depth = depth + 1;
		node.children!.push(child);
	});

	return node;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Prediksi & evaluasi
// ═══════════════════════════════════════════════════════════════════════════════

/** Prediksi kelas sebuah baris (cabang tak dikenal → kelas mayoritas simpul saat itu). */
function predict(tree: DecisionTreeNode, row: DataRow): string {
	if (tree.isLeaf || !tree.children?.length || !tree.attribute) { return tree.label || 'Unknown'; }
	const raw = row[tree.attribute];

	if (tree.splitType === 'numeric') {
		const v = numericOf(raw);
		if (v === null) { return majorityOf(tree.distribution || {}); }
		const target = tree.children.find((c) => (v <= (c.threshold ?? 0) ? c.test === 'lte' : c.test === 'gt'));
		return target ? predict(target, row) : majorityOf(tree.distribution || {});
	}

	const value = raw === null || raw === undefined ? '' : String(raw);
	const exact = tree.children.find((c) => String(c.value) === value);
	if (exact) { return predict(exact, row); }
	// Nilai yang jarang mungkin sudah digabung menjadi cabang “(lainnya)”.
	const fallback = tree.children.find((c) => String(c.value) === '(lainnya)');
	if (fallback) { return predict(fallback, row); }
	return majorityOf(tree.distribution || {});
}

interface EvaluationResult {
	accuracy: number;
	confusionMatrix: number[][];
	confusionLabels: string[];
	predictions: { actual: string; predicted: string; correct: boolean }[];
}

/** Akurasi, matriks konfusi, dan daftar prediksi pada sebuah himpunan uji. */
function evaluateModel(tree: DecisionTreeNode, testData: DataRow[], targetAttr: string): EvaluationResult {
	const pairs = testData.map((row) => {
		const actual = String(row[targetAttr]);
		const predicted = predict(tree, row);
		return { actual, predicted, correct: actual === predicted };
	});
	const labels = Array.from(new Set([...pairs.map((p) => p.actual), ...pairs.map((p) => p.predicted)])).sort();
	const index = new Map(labels.map((l, i) => [l, i]));
	const matrix: number[][] = labels.map(() => labels.map(() => 0));
	pairs.forEach((p) => { matrix[index.get(p.actual) || 0][index.get(p.predicted) || 0] += 1; });
	const correct = pairs.filter((p) => p.correct).length;
	return {
		accuracy: pairs.length ? correct / pairs.length : 0,
		confusionMatrix: matrix,
		confusionLabels: labels,
		predictions: pairs,
	};
}

/** Metrik per kelas dari matriks konfusi. */
function perClassMetrics(matrix: number[][], labels: string[]): ClassMetric[] {
	const n = matrix.length;
	const rowTotals = matrix.map((row) => row.reduce((a, b) => a + b, 0));
	const colTotals = matrix.map((_, j) => matrix.reduce((a, row) => a + (row[j] || 0), 0));
	const total = rowTotals.reduce((a, b) => a + b, 0);
	return matrix.map((row, i) => {
		const tp = row[i] || 0;
		const fp = colTotals[i] - tp;
		const fn = rowTotals[i] - tp;
		const tn = total - tp - fp - fn;
		const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
		const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
		const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
		const specificity = tn + fp > 0 ? tn / (tn + fp) : 0;
		return {
			label: labels[i] || `Kelas ${i + 1}`,
			support: rowTotals[i], predicted: colTotals[i], tp, fp, fn,
			precision: round4(precision), recall: round4(recall), f1: round4(f1), specificity: round4(specificity),
		};
	});
}

/** Agregat makro, tertimbang, mikro, kappa Cohen, dan MCC multikelas. */
function aggregateMetrics(matrix: number[][], classes: ClassMetric[], accuracy: number): AggregateMetrics {
	const total = classes.reduce((a, c) => a + c.support, 0);
	const support = (label: string) => classes.find((c) => c.label === label)?.support ?? 0;
	const mean = (pick: (c: ClassMetric) => number) => (classes.length ? classes.reduce((a, c) => a + pick(c), 0) / classes.length : 0);
	const weighted = (pick: (c: ClassMetric) => number) => (total ? classes.reduce((a, c) => a + pick(c) * c.support, 0) / total : 0);

	// Kappa Cohen: (po − pe) / (1 − pe)
	const n = matrix.length;
	const rowTotals = matrix.map((row) => row.reduce((a, b) => a + b, 0));
	const colTotals = matrix.map((_, j) => matrix.reduce((a, row) => a + (row[j] || 0), 0));
	const po = total > 0 ? matrix.reduce((a, row, i) => a + (row[i] || 0), 0) / total : 0;
	const pe = total > 0 ? rowTotals.reduce((a, r, i) => a + r * colTotals[i], 0) / (total * total) : 0;
	const kappa = pe < 1 ? (po - pe) / (1 - pe) : 0;

	// MCC multikelas (Gorodkin): (c·s − Σ pk·tk) / sqrt((s² − Σ pk²)(s² − Σ tk²))
	const s = total;
	const c = matrix.reduce((a, row, i) => a + (row[i] || 0), 0);
	const pFollow = rowTotals.reduce((a, r) => a + r * r, 0);
	const tFollow = colTotals.reduce((a, t) => a + t * t, 0);
	const denom = Math.sqrt((s * s - pFollow) * (s * s - tFollow));
	const mcc = denom > 0 ? (c * s - rowTotals.reduce((a, r, i) => a + r * colTotals[i], 0)) / denom : 0;

	return {
		accuracy: round4(accuracy),
		microF1: round4(accuracy),
		macroPrecision: round4(mean((x) => x.precision)),
		macroRecall: round4(mean((x) => x.recall)),
		macroF1: round4(mean((x) => x.f1)),
		weightedPrecision: round4(weighted((x) => x.precision)),
		weightedRecall: round4(weighted((x) => x.recall)),
		weightedF1: round4(weighted((x) => x.f1)),
		kappa: round4(kappa),
		mcc: round4(mcc),
	};
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pasca-pemangkasan reduced-error
// ═══════════════════════════════════════════════════════════════════════════════

/** Bagikan baris validasi ke cabang-cabang sebuah simpul memakai aturan split-nya. */
function routeRows(node: DecisionTreeNode, rows: DataRow[]): DataRow[][] {
	const buckets: DataRow[][] = (node.children || []).map(() => []);
	if (!node.children?.length) { return buckets; }
	rows.forEach((row) => {
		let idx = -1;
		if (node.splitType === 'numeric') {
			const v = numericOf(row[node.attribute!]);
			if (v !== null) {
				idx = node.children!.findIndex((c) => (v <= (c.threshold ?? 0) ? c.test === 'lte' : c.test === 'gt'));
			}
		} else {
			const value = row[node.attribute!] === null || row[node.attribute!] === undefined ? '' : String(row[node.attribute!]);
			idx = node.children!.findIndex((c) => String(c.value) === value);
			if (idx < 0) { idx = node.children!.findIndex((c) => String(c.value) === '(lainnya)'); }
		}
		if (idx >= 0) { buckets[idx].push(row); }
	});
	return buckets;
}

interface PruneStats { subtreesPruned: number }

/** Pemangkasan reduced-error: ganti subtree dengan daun bila tidak memperburuk akurasi validasi. */
function reducedErrorPrune(node: DecisionTreeNode, rows: DataRow[], targetAttr: string, stats: PruneStats): DecisionTreeNode {
	if (node.isLeaf || !node.children?.length) { return node; }
	const buckets = routeRows(node, rows);
	node.children = node.children.map((child, i) => reducedErrorPrune(child, buckets[i], targetAttr, stats));

	const subtreeCorrect = rows.reduce((a, row) => a + (predict(node, row) === String(row[targetAttr]) ? 1 : 0), 0);
	const label = majorityOf(node.distribution || {});
	const leafCorrect = rows.reduce((a, row) => a + (label === String(row[targetAttr]) ? 1 : 0), 0);
	// Hanya dipangkas bila daun benar-benar lebih akurat pada data validasi. Perbandingan ketat ini
	// mencegah pemangkasan beruntun saat seri, yang bisa meruntuhkan seluruh pohon menjadi satu daun.
	if (leafCorrect > subtreeCorrect) {
		stats.subtreesPruned += 1;
		return {
			isLeaf: true,
			label,
			samples: node.samples,
			distribution: node.distribution,
			entropy: node.entropy,
			depth: node.depth,
			errorRate: node.samples ? 1 - ((node.distribution || {})[label] || 0) / node.samples : 0,
			condition: 'hasil pemangkasan reduced-error',
		};
	}
	return node;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Ekstraksi aturan, bentuk pohon, penggunaan atribut
// ═══════════════════════════════════════════════════════════════════════════════

function edgeCondition(node: DecisionTreeNode, child: DecisionTreeNode): string {
	if (node.splitType === 'numeric' && child.threshold !== undefined) {
		return child.test === 'lte' ? `${node.attribute} <= ${round4(child.threshold)}` : `${node.attribute} > ${round4(child.threshold)}`;
	}
	return `${node.attribute} = ${child.value}`;
}

/** Aturan keputusan beserta rinciannya (support, confidence, error, coverage, distribusi kelas). */
function extractRules(node: DecisionTreeNode, targetAttr: string, trainingSize: number, path: string[] = [], out: RuleDetail[] = []): RuleDetail[] {
	if (node.isLeaf || !node.children?.length) {
		const distribution = node.distribution || distributionOf([], targetAttr);
		const label = node.label || majorityOf(distribution);
		const samples = node.samples ?? 0;
		const purity = samples ? (distribution[label] || 0) / samples : 0;
		out.push({
			index: out.length + 1,
			condition: path.length ? path.join(' AND ') : '(akar pohon)',
			prediction: label,
			samples,
			confidence: round4(purity),
			error: round4(1 - purity),
			coverage: round4(trainingSize ? samples / trainingSize : 0),
			classDistribution: distribution,
		});
		return out;
	}
	(node.children || []).forEach((child) => {
		extractRules(child, targetAttr, trainingSize, [...path, edgeCondition(node, child)], out);
	});
	return out;
}

/** Kalimat aturan dalam bentuk teks (kompatibel dengan ekspor yang sudah ada). */
function ruleText(detail: RuleDetail): string {
	const head = detail.condition === '(akar pohon)' ? '' : `IF ${detail.condition} THEN `;
	return `${head}Class = ${detail.prediction} (${detail.samples} samples)`;
}

/** Bentuk pohon: jumlah simpul/daun, kedalaman, ukuran daun, kemurnian, panjang aturan rata-rata. */
function treeShape(node: DecisionTreeNode): TreeShape {
	let nodes = 0, internal = 0, leaves = 0, depth = 0, sampledLeaf = 0, sumLeaf = 0, minLeaf = Infinity, maxLeaf = 0, impure = 0, ruleLen = 0, puritySum = 0;
	const walk = (n: DecisionTreeNode, d: number) => {
		nodes += 1;
		depth = Math.max(depth, d);
		if (n.isLeaf || !n.children?.length) {
			leaves += 1;
			const size = n.samples ?? 0;
			sumLeaf += size; sampledLeaf += 1;
			minLeaf = Math.min(minLeaf, size);
			maxLeaf = Math.max(maxLeaf, size);
			ruleLen += d;
			const purity = size ? ((n.distribution || {})[n.label || ''] || 0) / size : 0;
			puritySum += purity * size;
			if (purity < 0.999) { impure += 1; }
		} else {
			internal += 1;
			n.children.forEach((c) => walk(c, d + 1));
		}
	};
	walk(node, 0);
	return {
		nodes, internalNodes: internal, leaves, depth,
		avgLeafSamples: sampledLeaf ? Math.round(sumLeaf / sampledLeaf) : 0,
		minLeafSamples: Number.isFinite(minLeaf) ? minLeaf : 0,
		maxLeafSamples: maxLeaf,
		avgRuleLength: leaves ? round4(ruleLen / leaves) : 0,
		leafPurityAvg: sumLeaf ? round4(puritySum / sumLeaf) : 0,
		leavesWithError: impure,
	};
}

/** Atribut apa saja yang benar-benar dipakai sebagai simpul, dan pada kedalaman berapa. */
function attributeUsage(node: DecisionTreeNode, profiles: Map<string, 'categorical' | 'numeric'>, uniqueValues: Map<string, number>): AttributeUsage[] {
	const acc = new Map<string, AttributeUsage>();
	const walk = (n: DecisionTreeNode, d: number) => {
		if (!n.isLeaf && n.attribute && n.children?.length) {
			const found = acc.get(n.attribute);
			if (found) {
				found.nodes += 1;
				found.depthFirstUsed = Math.min(found.depthFirstUsed, d);
			} else {
				acc.set(n.attribute, {
					attribute: n.attribute,
					type: profiles.get(n.attribute) || 'categorical',
					nodes: 1,
					depthFirstUsed: d,
					isRoot: d === 0,
					uniqueValues: uniqueValues.get(n.attribute) ?? 0,
				});
			}
			n.children.forEach((c) => walk(c, d + 1));
		}
	};
	walk(node, 0);
	return Array.from(acc.values()).sort((a, b) => (a.depthFirstUsed - b.depthFirstUsed) || (b.nodes - a.nodes));
}

/** Daftar ambang numerik yang dipakai pohon. */
function numericSplitList(node: DecisionTreeNode, out: NumericSplitInfo[] = []): NumericSplitInfo[] {
	if (node.isLeaf || !node.children?.length || node.splitType !== 'numeric') {
		(node.children || []).forEach((c) => numericSplitList(c, out));
		return out;
	}
	const lte = node.children.find((c) => c.test === 'lte');
	const gt = node.children.find((c) => c.test === 'gt');
	out.push({
		attribute: node.attribute || '',
		threshold: round4(node.threshold ?? lte?.threshold ?? 0),
		gainRatio: round4(node.gainRatio ?? 0),
		leftSamples: lte?.samples ?? 0,
		rightSamples: gt?.samples ?? 0,
		depth: node.depth ?? 0,
	});
	node.children.forEach((c) => numericSplitList(c, out));
	return out;
}

/** Kepentingan fitur dari information gain data latih, dinormalkan agar totalnya 1. */
function calculateFeatureImportance(rows: DataRow[], attributes: string[], targetAttr: string, profiles: Map<string, 'categorical' | 'numeric'>, mergeRare: boolean): { feature: string; importance: number }[] {
	const importance = attributes.map((attr) => {
		const evaluation = evaluateAttribute(rows, attr, targetAttr, profiles.get(attr) || 'categorical', mergeRare);
		return { feature: attr, importance: evaluation ? evaluation.gain : 0 };
	});
	const total = importance.reduce((sum, item) => sum + item.importance, 0);
	if (total > 0) { importance.forEach((item) => { item.importance = item.importance / total; }); }
	return importance.sort((a, b) => b.importance - a.importance);
}

/** Pasangan salah klasifikasi terbanyak beserta pangsanya terhadap seluruh kesalahan. */
function misclassifiedPairs(matrix: number[][], labels: string[]): MisclassificationPair[] {
	const out: MisclassificationPair[] = [];
	let errors = 0;
	matrix.forEach((row, i) => row.forEach((count, j) => { if (i !== j) { errors += count; } }));
	matrix.forEach((row, i) => row.forEach((count, j) => {
		if (i !== j && count > 0) {
			out.push({ actual: labels[i] || `Kelas ${i + 1}`, predicted: labels[j] || `Kelas ${j + 1}`, count, share: round4(errors ? count / errors : 0) });
		}
	}));
	return out.sort((a, b) => b.count - a.count).slice(0, 12);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Validasi silang
// ═══════════════════════════════════════════════════════════════════════════════

/** Bagi baris menjadi k lipatan secara bertingkat (stratified) memakai pembangkit ber-seed. */
function stratifiedFolds(rows: DataRow[], targetAttr: string, folds: number, random: () => number): DataRow[][] {
	const byClass = new Map<string, DataRow[]>();
	rows.forEach((row) => {
		const cls = String(row[targetAttr]);
		const bucket = byClass.get(cls);
		if (bucket) { bucket.push(row); } else { byClass.set(cls, [row]); }
	});
	const out: DataRow[][] = Array.from({ length: folds }, () => []);
	byClass.forEach((bucket) => {
		shuffle(bucket, random).forEach((row, i) => out[i % folds].push(row));
	});
	return out;
}

/** Validasi silang k-fold bertingkat: akurasi/F1 makro per lipatan + stabilitas atribut akar. */
function crossValidate(
	rows: DataRow[],
	attributes: string[],
	targetAttr: string,
	profiles: Map<string, 'categorical' | 'numeric'>,
	build: (trainRows: DataRow[]) => DecisionTreeNode,
	folds: number,
	random: () => number,
	seed: number,
	maxRows: number,
): CrossValidationResult {
	const sampled = rows.length > maxRows;
	const used = sampled ? stratifiedFolds(rows, targetAttr, Math.max(2, Math.ceil((maxRows / rows.length) * folds)), random).flat().slice(0, maxRows) : rows;
	const buckets = stratifiedFolds(used, targetAttr, folds, random);
	const details: FoldDetail[] = [];
	buckets.forEach((testRows, i) => {
		const testSet = new Set(testRows);
		const trainRows = used.filter((row) => !testSet.has(row));
		if (!trainRows.length || !testRows.length) { return; }
		const tree = build(trainRows);
		const evaluation = evaluateModel(tree, testRows, targetAttr);
		const metrics = perClassMetrics(evaluation.confusionMatrix, evaluation.confusionLabels);
		const aggregate = aggregateMetrics(evaluation.confusionMatrix, metrics, evaluation.accuracy);
		const shape = treeShape(tree);
		details.push({
			fold: i + 1,
			trainSize: trainRows.length,
			testSize: testRows.length,
			accuracy: round4(evaluation.accuracy),
			macroF1: aggregate.macroF1,
			rootAttribute: tree.isLeaf ? '(daun)' : (tree.attribute || '-'),
			leaves: shape.leaves,
			depth: shape.depth,
		});
	});

	const accuracies = details.map((d) => d.accuracy);
	const f1s = details.map((d) => d.macroF1);
	const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
	const std = (xs: number[]) => {
		if (xs.length < 2) { return 0; }
		const m = mean(xs);
		return Math.sqrt(xs.reduce((a, x) => a + (x - m) * (x - m), 0) / (xs.length - 1));
	};
	const roots = new Map<string, number>();
	details.forEach((d) => roots.set(d.rootAttribute, (roots.get(d.rootAttribute) || 0) + 1));

	return {
		folds: details.length,
		seed,
		sampled,
		sampleSize: used.length,
		meanAccuracy: round4(mean(accuracies)),
		stdAccuracy: round4(std(accuracies)),
		minAccuracy: round4(accuracies.length ? Math.min(...accuracies) : 0),
		maxAccuracy: round4(accuracies.length ? Math.max(...accuracies) : 0),
		meanMacroF1: round4(mean(f1s)),
		stdMacroF1: round4(std(f1s)),
		meanLeaves: round4(mean(details.map((d) => d.leaves))),
		meanDepth: round4(mean(details.map((d) => d.depth))),
		foldDetails: details,
		rootStability: Array.from(roots.entries())
			.map(([attribute, count]) => ({ attribute, count, share: round4(count / Math.max(1, details.length)) }))
			.sort((a, b) => b.count - a.count),
	};
}

// ═══════════════════════════════════════════════════════════════════════════════
// Fungsi utama
// ═══════════════════════════════════════════════════════════════════════════════

/** Latih dan analisis pohon keputusan C4.5. Mengembalikan `null` bila data tidak memenuhi syarat. */
export function trainDecisionTree(
	data: DataRow[],
	targetAttribute: string,
	options: DecisionTreeOptions = {},
): DecisionTreeAnalysis | null {
	// ── Validasi masukan ───────────────────────────────────────────────────────
	if (!Array.isArray(data) || !data.length) {
		console.error('Decision Tree: dataset kosong atau tidak valid');
		return null;
	}
	if (!targetAttribute || typeof targetAttribute !== 'string') {
		console.error('Decision Tree: atribut target harus berupa string yang valid');
		return null;
	}
	const firstRow = data[0];
	// Kolom bernama "(index)"/"Index" dari pembaca Excel bukan data nyata.
	const attributeNames = Object.keys(firstRow);
	if (!attributeNames.includes(targetAttribute)) {
		console.error(`Decision Tree: atribut target "${targetAttribute}" tidak ada di dataset`);
		return null;
	}

	const validData = data.filter((row) => {
		const value = row[targetAttribute];
		return value !== null && value !== undefined && String(value).trim() !== '';
	});
	if (validData.length < 4) {
		console.error('Decision Tree: minimal 4 baris dengan target terisi diperlukan');
		return null;
	}
	const uniqueTargetValues = new Set(validData.map((row) => String(row[targetAttribute])));
	if (uniqueTargetValues.size < 2) {
		console.error(`Decision Tree: atribut target harus punya minimal 2 kelas (ditemukan ${uniqueTargetValues.size})`);
		return null;
	}

	// ── Opsi ───────────────────────────────────────────────────────────────────
	const maxDepth = Math.max(1, Math.min(20, Math.floor(options.maxDepth ?? 6)));
	const testSplit = Math.max(0, Math.min(0.5, options.testSplit ?? 0.25));
	const seed = Number.isFinite(options.seed) ? Math.floor(options.seed as number) : 42;
	const minSamplesLeaf = Math.max(1, Math.floor(options.minSamplesLeaf ?? 2));
	const minGainRatio = Math.max(0, options.minGainRatio ?? 0);
	const maxBranches = Math.max(2, Math.floor(options.maxBranches ?? 20));
	const mergeRare = options.mergeRare !== false;
	const usePruning = options.pruning !== false;
	const validationSplit = Math.max(0.05, Math.min(0.4, options.validationSplit ?? 0.2));
	const cvFolds = Math.max(0, Math.min(10, Math.floor(options.cvFolds ?? 5)));
	const cvMaxRows = Math.max(100, Math.floor(options.cvMaxRows ?? 2000));
	const excludeAttrs = new Set(options.excludeAttributes || []);

	const random = makeRandom(seed);
	const preparations: any[] = [];

	// ── Atribut prediktor ──────────────────────────────────────────────────────
	const profiles = new Map<string, 'categorical' | 'numeric'>();
	const uniqueValuesMap = new Map<string, number>();
	const excluded: string[] = [];
	const numericAttributes: string[] = [];

	const candidates = attributeNames.filter((attr) => attr !== targetAttribute && !excludeAttrs.has(attr));
	candidates.forEach((attr) => {
		const profile = attributeProfile(validData, attr);
		uniqueValuesMap.set(attr, profile.unique);
		if (profile.unique < 2) {
			// Kolom konstan tidak dapat memisahkan apa pun.
			excluded.push(attr);
			return;
		}
		if (profile.type === 'categorical') {
			// Kategorikal bernilai banyak: nilai jarang akan digabung menjadi cabang “(lainnya)”, jadi yang
			// dihitung adalah jumlah nilai yang cukup sering. Atribut tetap dibuang bila nilainya terlalu
			// banyak (biasanya kolom id).
			const counts = valueCounts(validData, attr);
			const limit = rareThreshold(validData.length, mergeRare);
			const frequent = limit > 0 ? Array.from(counts.values()).filter((c) => c >= limit).length : counts.size;
			if (frequent > maxBranches) {
				excluded.push(attr);
				return;
			}
		}
		profiles.set(attr, profile.type);
		if (profile.type === 'numeric') { numericAttributes.push(attr); }
	});
	const predictors = Array.from(profiles.keys());
	if (!predictors.length) {
		console.error('Decision Tree: tidak ada atribut prediktor yang layak setelah penyaringan');
		return null;
	}

	preparations.push({
		description: 'Inisialisasi Dataset dan Atribut',
		formula: 'N/A',
		calculation: `Total baris: ${data.length}, baris valid: ${validData.length}, kelas target: ${uniqueTargetValues.size}\nAtribut prediktor dipakai (${predictors.length}): ${predictors.slice(0, 24).join(', ')}${predictors.length > 24 ? `, … (+${predictors.length - 24})` : ''}`
			+ (numericAttributes.length ? `\nAtribut numerik (split ambang biner): ${numericAttributes.slice(0, 16).join(', ')}${numericAttributes.length > 16 ? ' …' : ''}` : '')
			+ (excluded.length ? `\nDiabaikan (konstan / nilai unik > ${maxBranches}): ${excluded.slice(0, 16).join(', ')}${excluded.length > 16 ? ' …' : ''}` : ''),
		result: `Seed = ${seed} (hasil dapat diulang), kedalaman maksimum = ${maxDepth}, minimal sampel daun = ${minSamplesLeaf}, pemangkasan = ${usePruning ? 'aktif' : 'nonaktif'}`,
	});

	// ── Pembagian data latih/uji (acak ber-seed) ───────────────────────────────
	const shuffled = shuffle(validData, random);
	const testSize = Math.floor(validData.length * testSplit);
	const trainingSize = validData.length - testSize;
	const trainingData = shuffled.slice(0, trainingSize);
	const testingData = shuffled.slice(trainingSize);

	const classDistribution = distributionOf(validData, targetAttribute);
	const baselineEntropy = calculateEntropy(validData, targetAttribute);
	const maxEntropyBits = Math.log2(Math.max(2, uniqueTargetValues.size));
	const maxShare = Math.max(...Object.values(classDistribution)) / validData.length;
	const baseline: BaselineInfo = {
		majorityClass: majorityOf(classDistribution),
		accuracy: round4(maxShare),
		noInformationRate: round4(maxShare),
		entropyBits: round4(baselineEntropy),
		maxEntropyBits: round4(maxEntropyBits),
		normalizedEntropy: round4(maxEntropyBits > 0 ? baselineEntropy / maxEntropyBits : 0),
	};

	if (!testingData.length) {
		// Dataset terlalu kecil untuk dipecah: seluruh data dipakai melatih, evaluasi memakai data latih.
		console.warn('Decision Tree: data uji kosong — seluruh data dipakai untuk melatih dan evaluasi memakai data latih');
	}

	const ctx: BuildContext = {
		targetAttr: targetAttribute,
		profiles,
		maxDepth,
		minSamplesLeaf,
		mergeRare,
		minGainRatio,
		maxBranches,
		calculations: [],
	};

	/** Latih satu pohon (dipakai juga oleh validasi silang). */
	const train = (rows: DataRow[]): DecisionTreeNode => {
		if (!usePruning) {
			return buildTree(rows, predictors, { ...ctx, calculations: [] }, 0);
		}
		// Pisahkan sebagian data latih sebagai data validasi untuk pemangkasan reduced-error.
		const shuffledTrain = shuffle(rows, random);
		const cut = Math.max(1, Math.floor(shuffledTrain.length * (1 - validationSplit)));
		const fitRows = shuffledTrain.slice(0, cut);
		const validationRows = shuffledTrain.slice(cut);
		if (!validationRows.length || fitRows.length < 2) {
			return buildTree(rows, predictors, { ...ctx, calculations: [] }, 0);
		}
		const tree = buildTree(fitRows, predictors, { ...ctx, calculations: [] }, 0);
		return reducedErrorPrune(tree, validationRows, targetAttribute, { subtreesPruned: 0 });
	};

	// ── Pohon utama (dilatih pada data latih utama, dengan validasi internal) ──
	const shuffledTrain = shuffle(trainingData, random);
	const pruneCut = usePruning ? Math.max(1, Math.floor(shuffledTrain.length * (1 - validationSplit))) : shuffledTrain.length;
	const fitRows = shuffledTrain.slice(0, pruneCut);
	const validationRows = usePruning ? shuffledTrain.slice(pruneCut) : [];
	const canPrune = usePruning && validationRows.length > 0 && fitRows.length >= 4;

	const rawTree = buildTree(canPrune ? fitRows : trainingData, predictors, ctx, 0);
	const shapeBefore = treeShape(rawTree);
	const evalBefore = canPrune ? evaluateModel(rawTree, validationRows, targetAttribute) : null;

	let tree = rawTree;
	let pruneStats: PruneStats = { subtreesPruned: 0 };
	let evalAfter: EvaluationResult | null = null;
	if (canPrune) {
		tree = reducedErrorPrune(rawTree, validationRows, targetAttribute, pruneStats);
		evalAfter = evaluateModel(tree, validationRows, targetAttribute);
	}
	const shapeAfter = treeShape(tree);

	// ── Aturan, evaluasi, dan analisis turunan ─────────────────────────────────
	const ruleDetails = extractRules(tree, targetAttribute, trainingData.length);
	const rules = ruleDetails.map(ruleText);
	const evaluation = evaluateModel(tree, testingData.length ? testingData : trainingData, targetAttribute);
	const metrics = perClassMetrics(evaluation.confusionMatrix, evaluation.confusionLabels);
	const aggregate = aggregateMetrics(evaluation.confusionMatrix, metrics, evaluation.accuracy);
	const outputDistribution = distributionOf(testingData.length ? testingData : trainingData, targetAttribute);
	const featureImportance = calculateFeatureImportance(trainingData, predictors, targetAttribute, profiles, mergeRare).map((f) => ({ ...f, importance: round4(f.importance) }));
	const usage = attributeUsage(tree, profiles, uniqueValuesMap);

	const splitMetrics: SplitMetrics[] = predictors.map((attr) => {
		const evaluationOf = evaluateAttribute(trainingData, attr, targetAttribute, profiles.get(attr) || 'categorical', mergeRare);
		const used = usage.find((u) => u.attribute === attr);
		return {
			attribute: attr,
			type: profiles.get(attr) || 'categorical',
			entropy: round4(evaluationOf ? evaluationOf.entropy : calculateEntropy(trainingData, targetAttribute)),
			informationGain: round4(evaluationOf ? evaluationOf.gain : 0),
			splitInfo: round4(evaluationOf ? evaluationOf.splitInfo : 0),
			gainRatio: round4(evaluationOf ? evaluationOf.gainRatio : 0),
			giniGain: round4(evaluationOf ? evaluationOf.giniGain : 0),
			splitPoints: evaluationOf
				? (evaluationOf.type === 'numeric' ? [round4(evaluationOf.bestThreshold ?? 0)] : Array.from(new Set(evaluationOf.branches.map((b) => b.key))).slice(0, 24))
				: [],
			uniqueValues: uniqueValuesMap.get(attr) ?? 0,
			usedAtNodes: used ? used.nodes : 0,
			usedAtRoot: !!used && used.isRoot,
			depthFirstUsed: used ? used.depthFirstUsed : -1,
		};
	}).sort((a, b) => b.gainRatio - a.gainRatio);

	const pruning: PruningReport | undefined = canPrune ? {
		applied: pruneStats.subtreesPruned > 0,
		method: 'reduced-error',
		validationSize: validationRows.length,
		nodesBefore: shapeBefore.nodes,
		leavesBefore: shapeBefore.leaves,
		nodesAfter: shapeAfter.nodes,
		leavesAfter: shapeAfter.leaves,
		subtreesPruned: pruneStats.subtreesPruned,
		accuracyValidationBefore: evalBefore ? round4(evalBefore.accuracy) : 0,
		accuracyValidationAfter: evalAfter ? round4(evalAfter.accuracy) : 0,
	} : undefined;

	// Validasi silang memakai seluruh data valid (pohon per lipatan dilatih ulang).
	const crossValidation = cvFolds >= 2 && validData.length >= cvFolds * 4
		? crossValidate(validData, predictors, targetAttribute, profiles, train, cvFolds, makeRandom(seed + 1), seed, cvMaxRows)
		: undefined;

	// ── Langkah perhitungan rinci (ditampilkan di export Excel) ────────────────
	const calculations: any[] = [];
	preparations.forEach((entry) => pushCalc(calculations, entry));
	pushCalc(calculations, {
		description: 'Pembagian Data Latih dan Data Uji',
		formula: 'testSplit = ukuran uji / seluruh data',
		calculation: `Seluruh data valid: ${validData.length} baris (acak dengan seed ${seed})\nData latih: ${trainingSize} baris (${((trainingSize / validData.length) * 100).toFixed(1)}%)${canPrune ? `, dipakai melatih ${fitRows.length} dan memvalidasi ${validationRows.length}` : ''}\nData uji: ${testSize} baris (${((testSize / validData.length) * 100).toFixed(1)}%)`,
		result: `Atribut target: ${targetAttribute}, kelas: ${uniqueTargetValues.size}, prediktor: ${predictors.length}`,
	});
	ctx.calculations.forEach((entry) => pushCalc(calculations, entry));
	pushCalc(calculations, {
		description: 'Entropi Data Latih dan Akurasi Dasar',
		formula: 'H(S) = −Σ p_i × log₂(p_i)',
		calculation: `Distribusi kelas data valid: ${Object.entries(classDistribution).map(([k, v]) => `${k} = ${v}`).join(', ')}`,
		result: `H(S) = ${baseline.entropyBits} bit (maksimum ${baseline.maxEntropyBits} bit); kelas mayoritas "${baseline.majorityClass}" = ${(baseline.noInformationRate * 100).toFixed(2)}%`,
	});
	if (pruning) {
		pushCalc(calculations, {
			description: 'Pasca-pemangkasan Reduced-Error',
			formula: 'subtree → daun bila akurasi validasi tidak menurun',
			calculation: `Data validasi: ${pruning.validationSize} baris\nSimpul ${pruning.nodesBefore} → ${pruning.nodesAfter}, daun ${pruning.leavesBefore} → ${pruning.leavesAfter} (${pruning.subtreesPruned} subtree dipangkas)`,
			result: `Akurasi validasi ${(pruning.accuracyValidationBefore * 100).toFixed(2)}% → ${(pruning.accuracyValidationAfter * 100).toFixed(2)}%`,
		});
	}
	if (crossValidation) {
		pushCalc(calculations, {
			description: `Validasi Silang ${crossValidation.folds}-Lipatan (bertingkat)`,
			formula: 'rata-rata dan simpangan baku akurasi antar-lipatan',
			calculation: crossValidation.foldDetails.map((f) => `Lipatan ${f.fold}: latih ${f.trainSize}, uji ${f.testSize}, akurasi ${(f.accuracy * 100).toFixed(2)}%, F1 makro ${(f.macroF1 * 100).toFixed(2)}%, akar "${f.rootAttribute}"`).join('\n'),
			result: `Akurasi rata-rata ${(crossValidation.meanAccuracy * 100).toFixed(2)}% ± ${(crossValidation.stdAccuracy * 100).toFixed(2)}% (min ${(crossValidation.minAccuracy * 100).toFixed(2)}%, maks ${(crossValidation.maxAccuracy * 100).toFixed(2)}%)`,
		});
	}
	pushCalc(calculations, {
		description: 'Evaluasi Akhir pada Data Uji',
		formula: 'Akurasi = prediksi benar / total data uji',
		calculation: `Data uji: ${evaluation.predictions.length} baris\nF1 makro ${(aggregate.macroF1 * 100).toFixed(2)}%, F1 tertimbang ${(aggregate.weightedF1 * 100).toFixed(2)}%, kappa ${aggregate.kappa}, MCC ${aggregate.mcc}`,
		result: `Akurasi ${(evaluation.accuracy * 100).toFixed(2)}% (akurasi dasar ${(baseline.noInformationRate * 100).toFixed(2)}%)`,
	});

	return {
		tree,
		rules,
		ruleDetails,
		accuracy: round4(evaluation.accuracy),
		confusionMatrix: evaluation.confusionMatrix,
		confusionLabels: evaluation.confusionLabels,
		featureImportance,
		splitMetrics,
		trainingSize,
		testSize,
		targetAttribute,
		predictiveAttributes: predictors,
		classDistribution,
		outputDistribution,
		detailedCalculations: calculations,
		performanceMetrics: {
			// Mikro: pada klasifikasi satu label, precision/recall/F1 mikro sama dengan akurasi.
			precision: aggregate.microF1,
			recall: aggregate.microF1,
			f1Score: aggregate.microF1,
			specificity: round4(metrics.length ? metrics.reduce((a, c) => a + c.specificity, 0) / metrics.length : 0),
			macroPrecision: aggregate.macroPrecision,
			macroRecall: aggregate.macroRecall,
			macroF1: aggregate.macroF1,
			weightedF1: aggregate.weightedF1,
			kappa: aggregate.kappa,
			mcc: aggregate.mcc,
		},
		treeShape: shapeAfter,
		perClassMetrics: metrics,
		aggregateMetrics: aggregate,
		baseline,
		attributeUsage: usage,
		numericSplits: numericSplitList(tree),
		misclassified: misclassifiedPairs(evaluation.confusionMatrix, evaluation.confusionLabels),
		predictions: evaluation.predictions,
		crossValidation,
		pruning,
		config: {
			targetAttribute,
			maxDepth,
			testSplit,
			seed,
			minSamplesLeaf,
			minGainRatio,
			maxBranches,
			mergeRare,
			pruning: usePruning,
			cvFolds,
			predictiveAttributes: predictors,
			numericAttributes,
			excludedAttributes: excluded,
		},
	};
}

/**
 * Deteksi otomatis atribut target yang paling cocok untuk klasifikasi.
 * Skor mempertimbangkan jumlah kelas (2–12), proporsi nilai unik terhadap jumlah baris (menghindari
 * kolom id), serta keberagaman kelasnya; kolom yang terlihat seperti penanda baris dihindari.
 */
export function autoDetectTargetAttribute(data: DataRow[]): string | null {
	const candidates = rankTargetAttributes(data, 3);
	return candidates.length ? candidates[0].attribute : null;
}

/** Peringkat calon atribut target (dipakai UI untuk menampilkan alternatif). */
export function rankTargetAttributes(data: DataRow[], limit = 5): { attribute: string; score: number; classes: number; reason: string }[] {
	if (!Array.isArray(data) || !data.length) { return []; }
	const attributes = Object.keys(data[0]);
	const rows = data.filter((row) => row && typeof row === 'object');
	if (!rows.length) { return []; }

	const scored = attributes.map((attr, position) => {
		const values = new Set<string>();
		let filled = 0, numeric = 0;
		rows.forEach((row) => {
			const raw = row[attr];
			if (raw === null || raw === undefined || String(raw).trim() === '') { return; }
			filled += 1;
			values.add(String(raw));
			if (numericOf(raw) !== null) { numeric += 1; }
		});
		const classes = values.size;
		const ratio = rows.length ? classes / rows.length : 1;
		const numericShare = filled ? numeric / filled : 0;
		const reasonBits: string[] = [];
		let score = 0;
		const looksLikeId = /^(id|no|nomor|kode|invoice|order|row|index|kode_)/i.test(attr);
		const tooMany = classes > 12 || ratio > 0.5;
		const tooFew = classes < 2;

		if (tooFew) { return { attribute: attr, score: -1, classes, reason: 'hanya satu nilai' }; }
		if (tooMany) { return { attribute: attr, score: -1, classes, reason: 'kelas terlalu banyak / mirip penanda baris' }; }

		// Kelas ideal untuk decision tree: 2–6 (skor tertinggi), menurun sampai 12.
		score += 3;
		if (classes >= 2 && classes <= 6) { score += 2; reasonBits.push(`${classes} kelas`); }
		else { score += Math.max(0, 1.5 - (classes - 6) * 0.25); reasonBits.push(`${classes} kelas (cukup banyak)`); }
		if (ratio <= 0.05) { score += 1.5; reasonBits.push('proporsi nilai unik rendah'); }
		else if (ratio <= 0.2) { score += 0.75; }
		else { score -= 0.5; reasonBits.push('nilai unik tinggi'); }
		if (numericShare > 0.95 && classes > 6) { score -= 1.5; reasonBits.push('numerik kontinu'); }
		if (looksLikeId) { score -= 3; reasonBits.push('nama mirip kolom id'); }
		// Target biasanya berada di kolom akhir.
		score += (position / Math.max(1, attributes.length - 1)) * 0.75;

		// Beri sedikit keunggulan bila distribusi kelasnya tidak ekstrem timpang.
		const counts = new Map<string, number>();
		rows.forEach((row) => {
			const cls = String(row[attr]);
			counts.set(cls, (counts.get(cls) || 0) + 1);
		});
		score += entropyFromMap(counts, rows.length) / 4;

		return { attribute: attr, score: Math.round(score * 100) / 100, classes, reason: reasonBits.join('; ') };
	}).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);

	return scored.slice(0, Math.max(1, limit));
}
