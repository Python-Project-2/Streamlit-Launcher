import { deflateSync } from 'zlib';
import type { Hist } from './analysis';
import type { Flowchart, FlowNode, FlowState } from './workflow';

type RGB = [number, number, number];
export interface Chart { png: Uint8Array; w: number; h: number }

const BLUE: RGB = [47, 85, 151];
const PALETTE: RGB[] = [[47, 85, 151], [237, 125, 49], [112, 173, 71], [255, 192, 0], [91, 155, 213], [165, 165, 165]];
const TXT: RGB = [40, 40, 40];
const GRID: RGB = [217, 217, 217];
const AXIS: RGB = [90, 90, 90];
const WHITE: RGB = [255, 255, 255];
const FRAME: RGB = [190, 190, 190];
export const STATUS_COLORS: RGB[] = [[192, 0, 0], [237, 125, 49], [112, 173, 71], [47, 85, 151]];

// ───────── font bitmap 5x7 (huruf kecil otomatis jadi kapital) ─────────
const FONT_SRC: Record<string, string> = {
	' ': '00 00 00 00 00 00 00',
	'?': '0E 11 01 02 04 00 04', '&': '0C 12 14 08 15 12 0D',
	'0': '0E 11 13 15 19 11 0E', '1': '04 0C 04 04 04 04 0E', '2': '0E 11 01 02 04 08 1F', '3': '1E 01 01 0E 01 01 1E',
	'4': '02 06 0A 12 1F 02 02', '5': '1F 10 1E 01 01 11 0E', '6': '06 08 10 1E 11 11 0E', '7': '1F 01 02 04 08 08 08',
	'8': '0E 11 11 0E 11 11 0E', '9': '0E 11 11 0F 01 02 0C',
	A: '0E 11 11 1F 11 11 11', B: '1E 11 11 1E 11 11 1E', C: '0E 11 10 10 10 11 0E', D: '1E 11 11 11 11 11 1E',
	E: '1F 10 10 1E 10 10 1F', F: '1F 10 10 1E 10 10 10', G: '0E 11 10 17 11 11 0F', H: '11 11 11 1F 11 11 11',
	I: '0E 04 04 04 04 04 0E', J: '07 02 02 02 02 12 0C', K: '11 12 14 18 14 12 11', L: '10 10 10 10 10 10 1F',
	M: '11 1B 15 15 11 11 11', N: '11 19 15 13 11 11 11', O: '0E 11 11 11 11 11 0E', P: '1E 11 11 1E 10 10 10',
	Q: '0E 11 11 11 15 12 0D', R: '1E 11 11 1E 14 12 11', S: '0F 10 10 0E 01 01 1E', T: '1F 04 04 04 04 04 04',
	U: '11 11 11 11 11 11 0E', V: '11 11 11 11 11 0A 04', W: '11 11 11 15 15 1B 11', X: '11 11 0A 04 0A 11 11',
	Y: '11 11 0A 04 04 04 04', Z: '1F 01 02 04 08 10 1F',
	'.': '00 00 00 00 00 0C 0C', ',': '00 00 00 00 0C 04 08', '-': '00 00 00 1F 00 00 00', '+': '00 04 04 1F 04 04 00',
	'%': '18 19 02 04 08 13 03', '/': '01 01 02 04 08 10 10', '(': '02 04 08 08 08 04 02', ')': '08 04 02 02 02 04 08',
	':': '00 0C 0C 00 0C 0C 00', '_': '00 00 00 00 00 00 1F', '=': '00 00 1F 00 1F 00 00', '<': '02 04 08 10 08 04 02',
	'>': '08 04 02 01 02 04 08', "'": '04 04 08 00 00 00 00',
	'"': '0A 0A 0A 00 00 00 00', '|': '04 04 04 04 04 04 04', ';': '00 0C 0C 00 0C 04 08', '!': '04 04 04 04 04 00 04',
	'*': '00 04 15 0E 15 04 00', '[': '0E 08 08 08 08 08 0E', ']': '0E 02 02 02 02 02 0E', '#': '0A 0A 1F 0A 1F 0A 0A',
};
const GLYPH: Record<string, number[]> = {};
for (const key of Object.keys(FONT_SRC)) { GLYPH[key] = FONT_SRC[key].split(' ').map((h) => parseInt(h, 16)); }
const BOX = [0x1f, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1f];

// ───────── PNG encoder ─────────
const CRC_T = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
	let c = n;
	for (let k = 0; k < 8; k++) { c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; }
	CRC_T[n] = c >>> 0;
}
function crc32(buf: Uint8Array): number {
	let c = 0xffffffff;
	for (let i = 0; i < buf.length; i++) { c = CRC_T[(c ^ buf[i]) & 255] ^ (c >>> 8); }
	return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
	const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
	const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
	return Buffer.concat([len, td, crc]);
}
const ZZ = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
	35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];
const DCT_C: number[][] = Array.from({ length: 8 }, (_, u) =>
	Array.from({ length: 8 }, (__, x) => (u === 0 ? Math.sqrt(1 / 8) : 0.5) * Math.cos(((2 * x + 1) * u * Math.PI) / 16)));
const DC_VALS: number[] = Array.from({ length: 12 }, (_, i) => i);
const DC_BITS: number[] = Array.from({ length: 16 }, (_, i) => (i === 1 ? 1 : i === 4 ? 11 : 0));      // 1 kode 2-bit, 11 kode 5-bit
const AC_VALS: number[] = [0x00, 0xf0];
for (let run = 0; run < 16; run++) { for (let size = 1; size <= 10; size++) { AC_VALS.push((run << 4) | size); } }
const AC_BITS: number[] = Array.from({ length: 16 }, (_, i) => (i === 1 ? 1 : i === 8 ? 161 : 0));   // EOB 2-bit, sisanya 9-bit
/** Bangun kode Huffman kanonik dari daftar jumlah-per-panjang dan simbol (sesuai spesifikasi JPEG). */
function makeCodes(bits: number[], vals: number[]) {
	const code = new Int32Array(256), len = new Int32Array(256);
	let c = 0, k = 0;
	for (let l = 1; l <= 16; l++) {
		for (let i = 0; i < bits[l - 1]; i++) { code[vals[k]] = c; len[vals[k]] = l; k++; c++; }
		c <<= 1;
	}
	return { code, len };
}
const DC_HUFF = makeCodes(DC_BITS, DC_VALS), AC_HUFF = makeCodes(AC_BITS, AC_VALS);

export function encodeJpeg(rgb: Uint8Array, W: number, H: number, quality = 92): Uint8Array {
	const q = Math.max(1, Math.round((100 - Math.min(100, Math.max(1, quality))) / 4));
	let out = new Uint8Array(1 << 17), n = 0;
	const put = (b: number) => {
		if (n >= out.length) { const t = new Uint8Array(out.length * 2); t.set(out); out = t; }
		out[n++] = b & 255;
	};
	const word = (v: number) => { put(v >> 8); put(v); };

	put(0xff); put(0xd8);                                                         // SOI
	put(0xff); put(0xe0); word(16);[0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0].forEach(put); word(1); word(1); put(0); put(0); // JFIF
	put(0xff); put(0xdb); word(67); put(0); for (let i = 0; i < 64; i++) { put(q); } // DQT
	put(0xff); put(0xc0); word(17); put(8); word(H); word(W); put(3);              // SOF0
	[1, 2, 3].forEach((id) => { put(id); put(0x11); put(0); });
	put(0xff); put(0xc4); word(31); put(0x00);                                      // DHT DC
	DC_BITS.forEach(put); DC_VALS.forEach(put);
	put(0xff); put(0xc4); word(181); put(0x10);                                     // DHT AC
	AC_BITS.forEach(put); AC_VALS.forEach(put);
	put(0xff); put(0xda); word(12); put(3);[1, 2, 3].forEach((id) => { put(id); put(0); }); put(0); put(63); put(0); // SOS

	let acc = 0, cnt = 0;
	const bits = (v: number, len: number) => {
		acc = (acc << len) | (v & ((1 << len) - 1)); cnt += len;
		while (cnt >= 8) { const b = (acc >> (cnt - 8)) & 255; put(b); if (b === 255) { put(0); } cnt -= 8; }
		acc &= (1 << cnt) - 1;
	};
	const sz = (v: number) => { v = Math.abs(v); let s = 0; while (v) { s++; v >>= 1; } return s; };

	const blk = new Float64Array(64), tmp = new Float64Array(64), qc = new Int32Array(64);
	const prev = [0, 0, 0];
	const encodeBlock = (ci: number) => {
		let flat = true;
		for (let i = 1; i < 64; i++) { if (blk[i] !== blk[0]) { flat = false; break; } }
		if (flat) {
			qc.fill(0); qc[0] = Math.round((8 * blk[0]) / q);
		} else {
			for (let y = 0; y < 8; y++) {
				for (let u = 0; u < 8; u++) {
					let s = 0;
					for (let x = 0; x < 8; x++) { s += blk[y * 8 + x] * DCT_C[u][x]; }
					tmp[y * 8 + u] = s;
				}
			}
			for (let v = 0; v < 8; v++) {
				for (let u = 0; u < 8; u++) {
					let s = 0;
					for (let y = 0; y < 8; y++) { s += DCT_C[v][y] * tmp[y * 8 + u]; }
					qc[v * 8 + u] = Math.round(s / q);
				}
			}
		}
		const dc = qc[0], diff = dc - prev[ci]; prev[ci] = dc;
		const ds = Math.min(11, sz(diff));
		bits(DC_HUFF.code[ds], DC_HUFF.len[ds]);
		if (ds) { bits(diff < 0 ? diff - 1 : diff, ds); }
		let run = 0;
		for (let k = 1; k < 64; k++) {
			let v = qc[ZZ[k]];
			if (v === 0) { run++; continue; }
			v = Math.max(-1023, Math.min(1023, v));
			while (run > 15) { bits(AC_HUFF.code[0xf0], AC_HUFF.len[0xf0]); run -= 16; }
			const s = sz(v);
			bits(AC_HUFF.code[(run << 4) | s], AC_HUFF.len[(run << 4) | s]);
			bits(v < 0 ? v - 1 : v, s);
			run = 0;
		}
		if (run > 0) { bits(AC_HUFF.code[0x00], AC_HUFF.len[0x00]); }
	};

	const planes = [new Float64Array(64), new Float64Array(64), new Float64Array(64)];
	for (let by = 0; by < H; by += 8) {
		for (let bx = 0; bx < W; bx += 8) {
			for (let y = 0; y < 8; y++) {
				const yy = Math.min(H - 1, by + y);
				for (let x = 0; x < 8; x++) {
					const o = (yy * W + Math.min(W - 1, bx + x)) * 3, r = rgb[o], g = rgb[o + 1], b = rgb[o + 2], i = y * 8 + x;
					planes[0][i] = 0.299 * r + 0.587 * g + 0.114 * b - 128;
					planes[1][i] = -0.168736 * r - 0.331264 * g + 0.5 * b;
					planes[2][i] = 0.5 * r - 0.418688 * g - 0.081312 * b;
				}
			}
			for (let ci = 0; ci < 3; ci++) { blk.set(planes[ci]); encodeBlock(ci); }
		}
	}
	if (cnt > 0) { bits((1 << (8 - cnt)) - 1, 8 - cnt); }
	put(0xff); put(0xd9);                                                          // EOI
	return out.slice(0, n);
}

// ───────── kanvas sederhana (koordinat logis, dikali k piksel) ─────────
class Img {
	readonly W: number; readonly H: number;
	private d: Uint8Array;
	constructor(readonly lw: number, readonly lh: number, readonly k = 2) {
		this.W = lw * k; this.H = lh * k;
		this.d = new Uint8Array(this.W * this.H * 3).fill(255);
	}
	private pr(x0: number, y0: number, x1: number, y1: number, c: RGB) {
		if (x1 <= x0) { x1 = x0 + 1; }
		if (y1 <= y0) { y1 = y0 + 1; }
		x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(this.W, x1); y1 = Math.min(this.H, y1);
		for (let y = y0; y < y1; y++) {
			let o = (y * this.W + x0) * 3;
			for (let x = x0; x < x1; x++) { this.d[o++] = c[0]; this.d[o++] = c[1]; this.d[o++] = c[2]; }
		}
	}
	rect(x: number, y: number, w: number, h: number, c: RGB) {
		const K = this.k;
		this.pr(Math.round(x * K), Math.round(y * K), Math.round((x + w) * K), Math.round((y + h) * K), c);
	}
	/** Salin seluruh piksel kanvas lain ke posisi (ox, oy) pada kanvas ini. */
	blit(s: Img, ox: number, oy: number) {
		const dx = Math.round(ox * this.k), dy = Math.round(oy * this.k);
		for (let y = 0; y < s.H; y++) {
			const ty = y + dy;
			if (ty < 0 || ty >= this.H) { continue; }
			for (let x = 0; x < s.W; x++) {
				const tx = x + dx;
				if (tx < 0 || tx >= this.W) { continue; }
				const so = (y * s.W + x) * 3, to = (ty * this.W + tx) * 3;
				this.d[to] = s.d[so]; this.d[to + 1] = s.d[so + 1]; this.d[to + 2] = s.d[so + 2];
			}
		}
	}
	line(x0: number, y0: number, x1: number, y1: number, c: RGB, t = 1) {
		const K = this.k, ax = x0 * K, ay = y0 * K, bx = x1 * K, by = y1 * K;
		const steps = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
		const half = Math.max(0.5, (t * K) / 2);
		for (let i = 0; i <= steps; i++) {
			const x = ax + ((bx - ax) * i) / steps, y = ay + ((by - ay) * i) / steps;
			this.pr(Math.round(x - half), Math.round(y - half), Math.round(x + half), Math.round(y + half), c);
		}
	}
	circle(cx: number, cy: number, r: number, c: RGB) {
		const K = this.k, R = r * K, X = cx * K, Y = cy * K;
		for (let y = Math.floor(Y - R); y <= Math.ceil(Y + R); y++) {
			for (let x = Math.floor(X - R); x <= Math.ceil(X + R); x++) {
				if ((x - X) ** 2 + (y - Y) ** 2 <= R * R) { this.pr(x, y, x + 1, y + 1, c); }
			}
		}
	}
	/** Isi poligon (scanline, aturan even-odd). */
	poly(pts: [number, number][], c: RGB) {
		const K = this.k, P = pts.map(([x, y]) => [x * K, y * K]);
		const yMin = Math.max(0, Math.floor(Math.min(...P.map((p) => p[1])))), yMax = Math.min(this.H - 1, Math.ceil(Math.max(...P.map((p) => p[1]))));
		for (let y = yMin; y <= yMax; y++) {
			const yc = y + 0.5, xs: number[] = [];
			for (let i = 0; i < P.length; i++) {
				const a = P[i], b = P[(i + 1) % P.length];
				if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) { xs.push(a[0] + ((yc - a[1]) * (b[0] - a[0])) / (b[1] - a[1])); }
			}
			xs.sort((p, q) => p - q);
			for (let i = 0; i + 1 < xs.length; i += 2) { this.pr(Math.round(xs[i]), y, Math.round(xs[i + 1]), y + 1, c); }
		}
	}
	/** Garis tepi poligon/garis patah; `dash` = [panjang garis, panjang jeda] untuk garis putus-putus. */
	strokePath(pts: [number, number][], c: RGB, t: number, dash: [number, number] | null = null, closed = false) {
		const P = closed ? [...pts, pts[0]] : pts;
		const period = dash ? dash[0] + dash[1] : 0;
		let phase = 0;
		for (let i = 0; i < P.length - 1; i++) {
			const [x0, y0] = P[i], [x1, y1] = P[i + 1], len = Math.hypot(x1 - x0, y1 - y0);
			if (len === 0) { continue; }
			if (!dash) { this.line(x0, y0, x1, y1, c, t); continue; }
			const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
			let s = 0;
			while (s < len) {
				const ph = phase % period, on = ph < dash[0];
				const seg = Math.min(len - s, on ? dash[0] - ph : period - ph);
				if (on) { this.line(x0 + ux * s, y0 + uy * s, x0 + ux * (s + seg), y0 + uy * (s + seg), c, t); }
				s += seg; phase += seg;
			}
		}
	}
	text(s: string, x: number, y: number, sc: number, c: RGB, anchor: 'l' | 'c' | 'r' = 'l') {
		const K = this.k, str = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
		const w = (str.length * 6 - 1) * sc;
		let cx = anchor === 'l' ? x : anchor === 'c' ? x - w / 2 : x - w;
		for (const ch of str) {
			const g = GLYPH[ch] ?? BOX;
			for (let r = 0; r < 7; r++) {
				for (let col = 0; col < 5; col++) {
					if ((g[r] >> (4 - col)) & 1) {
						this.pr(Math.round((cx + col * sc) * K), Math.round((y + r * sc) * K),
							Math.round((cx + (col + 1) * sc) * K), Math.round((y + (r + 1) * sc) * K), c);
					}
				}
			}
			cx += 6 * sc;
		}
	}
	png(): Uint8Array {
		const ihdr = Buffer.alloc(13);
		ihdr.writeUInt32BE(this.W, 0); ihdr.writeUInt32BE(this.H, 4); ihdr[8] = 8; ihdr[9] = 2;
		const stride = this.W * 3 + 1;
		const raw = Buffer.alloc(stride * this.H);
		for (let y = 0; y < this.H; y++) {
			raw[y * stride] = 0;
			Buffer.from(this.d.buffer, this.d.byteOffset + y * this.W * 3, this.W * 3).copy(raw, y * stride + 1);
		}
		const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
		return new Uint8Array(Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
	}
	jpg(quality = 92): Uint8Array { return encodeJpeg(this.d, this.W, this.H, quality); }
}

// ───────── util ─────────
const trim2 = (x: number) => String(Math.round(x * 100) / 100);
export const nfShort = (v: number): string => {
	const a = Math.abs(v);
	if (a >= 1e9) { return trim2(v / 1e9) + 'B'; }
	if (a >= 1e6) { return trim2(v / 1e6) + 'M'; }
	if (a >= 1e4) { return trim2(v / 1e3) + 'K'; }
	if (a >= 100) { return String(Math.round(v)); }
	return trim2(v);
};
const short = (s: string, n: number) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + '.' : s);
function niceMax(v: number): number {
	if (!isFinite(v) || v <= 0) { return 1; }
	const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
	return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 8 ? 8 : 10) * p;
}
const blend = (a: RGB, b: RGB, t: number): RGB => {
	const u = Math.max(0, Math.min(1, t));
	return [Math.round(a[0] + (b[0] - a[0]) * u), Math.round(a[1] + (b[1] - a[1]) * u), Math.round(a[2] + (b[2] - a[2]) * u)];
};

/** Bungkus grafik dengan bayangan lembut (drop shadow) + bingkai tipis agar tampil seperti kartu. */
const SH = 10;
const fin = (img: Img): Chart => {
	const out = new Img(img.lw + 2 * SH, img.lh + 2 * SH, img.k);
	for (let i = 8; i >= 0; i--) {
		const t = 0.3 * (1 - i / 9) ** 2 + 0.02;
		out.rect(SH + 2 - i, SH + 3 - i, img.lw + 2 * i, img.lh + 2 * i, blend(WHITE, [0, 0, 0], t));
	}
	out.blit(img, SH, SH);
	out.rect(SH, SH, img.lw, 0.5, FRAME);
	out.rect(SH, SH + img.lh - 0.5, img.lw, 0.5, FRAME);
	out.rect(SH, SH, 0.5, img.lh, FRAME);
	out.rect(SH + img.lw - 0.5, SH, 0.5, img.lh, FRAME);
	return { png: out.png(), w: out.lw, h: out.lh };
};

function yAxis(img: Img, x0: number, x1: number, yT: number, yB: number, lo: number, hi: number, fmt: (v: number) => string) {
	for (let i = 0; i <= 4; i++) {
		const v = lo + ((hi - lo) * i) / 4, y = yB - ((yB - yT) * i) / 4;
		img.line(x0, y, x1, y, i === 0 ? AXIS : GRID, i === 0 ? 1.5 : 1);
		img.text(fmt(v), x0 - 8, y - 10.5, 3, TXT, 'r');
	}
	img.line(x0, yT, x0, yB, AXIS, 1.5);
}

// ───────── FLOWCHART (PNG / JPG) ─────────
interface FlowStyle { stroke: RGB; fill: RGB; text: RGB; w: number; dash: [number, number] | null }
const FLOW_STYLE: Record<FlowState, FlowStyle> = {
	critical: { stroke: [192, 0, 0], fill: [253, 236, 234], text: [31, 31, 31], w: 2.5, dash: null },
	active: { stroke: [47, 85, 151], fill: [234, 241, 251], text: [31, 31, 31], w: 2, dash: null },
	skipped: { stroke: [166, 166, 166], fill: [242, 242, 242], text: [127, 127, 127], w: 1.5, dash: [6, 4] },
};
const FLOW_STATUS: Record<FlowState, string> = { critical: 'JALUR UTAMA', active: 'AKTIF', skipped: 'DILEWATI' };
const FLOW_SCALES = [3, 2.5, 2, 1.5, 1];
const SUB_SCALE: Record<number, number> = { 3: 2, 2.5: 2, 2: 1.5, 1.5: 1, 1: 1 };
const tw = (s: string, sc: number) => (s.length * 6 - 1) * sc;
const lineGap = (sc: number) => Math.round(sc * 1.5);

function roundRectPts(x: number, y: number, w: number, h: number, r: number): [number, number][] {
	const pts: [number, number][] = [];
	const corners: [number, number, number][] = [[x + w - r, y + r, -90], [x + w - r, y + h - r, 0], [x + r, y + h - r, 90], [x + r, y + r, 180]];
	for (const [cx, cy, a0] of corners) {
		for (let i = 0; i <= 6; i++) {
			const a = ((a0 + i * 15) * Math.PI) / 180;
			pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
		}
	}
	return pts;
}

/** Skala teks terbesar yang masih muat pada semua simpul (belah ketupat lebih sempit di bagian atas/bawah). */
function fitScale(nodes: FlowNode[]): number {
	const fits = (n: FlowNode, sc: number): boolean => {
		const sub = SUB_SCALE[sc], gap = lineGap(sc), nl = n.lines.length;
		const blockH = nl * 7 * sc + (nl - 1) * gap + (n.sub ? gap + 7 * sub : 0);
		if (blockH > n.h - 6) { return false; }
		for (let i = 0; i < nl; i++) {
			const top = -blockH / 2 + i * (7 * sc + gap), far = Math.max(Math.abs(top), Math.abs(top + 7 * sc));
			const allowed = n.kind === 'decision' ? n.w * (1 - far / (n.h / 2)) - 8 : n.w - 14;
			if (tw(n.lines[i], sc) > allowed) { return false; }
		}
		return !n.sub || tw(n.sub, sub) <= n.w - 14;
	};
	for (const sc of FLOW_SCALES) { if (nodes.every((n) => fits(n, sc))) { return sc; } }
	return 1;
}

function wrapChars(s: string, n: number, maxLines: number): string[] {
	const out: string[] = [];
	let line = '';
	for (let w of s.split(/\s+/).filter(Boolean)) {
		while (w.length > n) { if (line) { out.push(line); line = ''; } out.push(w.slice(0, n)); w = w.slice(n); }
		const t = line ? `${line} ${w}` : w;
		if (t.length <= n) { line = t; } else { out.push(line); line = w; }
	}
	if (line) { out.push(line); }
	if (out.length > maxLines) {
		const r = out.slice(0, maxLines);
		r[maxLines - 1] = r[maxLines - 1].slice(0, Math.max(1, n - 1)) + '.';
		return r;
	}
	return out;
}

function renderFlow(fc: Flowchart): Img {
	const slide = fc.mode === 'slide';
	const img = new Img(fc.W, fc.H, 2);
	const procNodes = fc.nodes.filter((n) => n.kind === 'process');
	const decNodes = fc.nodes.filter((n) => n.kind === 'decision');
	const scP = fitScale(procNodes), scD = fitScale(decNodes);
	const scL = slide ? 1.5 : 2;                       // skala label "Ya"/"Tidak"

	// ── garis penghubung ──
	for (const e of fc.edges) {
		const st = FLOW_STYLE[e.state];
		const pts = e.pts.map((p) => [p[0], p[1]] as [number, number]);
		let head: { tip: [number, number]; ux: number; uy: number } | null = null;
		if (e.arrow && pts.length >= 2) {
			const a = pts[pts.length - 2], b = pts[pts.length - 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
			const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
			head = { tip: [b[0], b[1]], ux, uy };
			pts[pts.length - 1] = [b[0] - ux * 8, b[1] - uy * 8];
		}
		img.strokePath(pts, st.stroke, st.w, st.dash);
		if (head) {
			const { tip, ux, uy } = head, bx = tip[0] - ux * 11, by = tip[1] - uy * 11;
			img.poly([tip, [bx - uy * 5.5, by + ux * 5.5], [bx + uy * 5.5, by - ux * 5.5]], st.stroke);
		}
		if (e.label) {
			const ly = (e.ly ?? 0) - 7 * scL + 1, lx = e.lx ?? 0;
			if (!slide && e.label === 'Tidak') { img.text(e.label, lx + 14, ly, scL, st.stroke, 'r'); } else { img.text(e.label, lx, ly, scL, st.stroke, 'c'); }
		}
	}

	// ── simpul ──
	for (const n of fc.nodes) {
		const st = FLOW_STYLE[n.state], x = n.cx - n.w / 2, y = n.cy - n.h / 2;
		if (n.kind === 'start' || n.kind === 'end') {
			const pts = roundRectPts(x, y, n.w, n.h, n.h / 2);
			img.poly(pts, [192, 0, 0]);
			img.strokePath(pts, [127, 0, 0], 1.5, null, true);
			const sc = 2;
			img.text(n.lines[0], n.cx, n.cy - (7 * sc) / 2, sc, WHITE, 'c');
			continue;
		}
		const pts: [number, number][] = n.kind === 'decision'
			? [[n.cx, y], [x + n.w, n.cy], [n.cx, y + n.h], [x, n.cy]]
			: roundRectPts(x, y, n.w, n.h, 8);
		img.poly(pts, st.fill);
		img.strokePath(pts, st.stroke, st.w, st.dash, true);
		const sc = n.kind === 'decision' ? scD : scP, sub = SUB_SCALE[sc], gap = lineGap(sc), nl = n.lines.length;
		const blockH = nl * 7 * sc + (nl - 1) * gap + (n.sub ? gap + 7 * sub : 0);
		let ty = n.cy - blockH / 2;
		for (const l of n.lines) { img.text(l, n.cx, ty, sc, st.text, 'c'); ty += 7 * sc + gap; }
		if (n.sub) { img.text(n.sub, n.cx, ty, sub, n.state === 'skipped' ? [140, 140, 140] : [85, 85, 85], 'c'); }
	}

	if (!slide) { return img; }

	// ── judul ──
	img.rect(0, 0, fc.W, 8, BLUE);
	img.text('Diagram Alir Analisis Data Otomatis', 40, 26, 4, [31, 31, 31]);
	img.text(short(fc.title, Math.floor((fc.W - 80) / 12)), 40, 62, 2, [85, 85, 85]);

	// ── tabel ringkasan ──
	const top = fc.tableTop, gx = [40, 660], cw = [28, 195, 265, 92], rh = 34, sc = 1.5;
	const cum = (i: number) => cw.slice(0, i).reduce((a, b) => a + b, 0);
	[fc.rows.slice(0, 5), fc.rows.slice(5)].forEach((rows, gi) => {
		const x = gx[gi];
		img.rect(x, top, 580, 24, BLUE);
		['No', 'Langkah', 'Hasil utama', 'Status'].forEach((h, i) => img.text(h, x + cum(i) + 8, top + 7, sc, WHITE));
		rows.forEach((r, ri) => {
			const y = top + 24 + ri * rh, st = FLOW_STYLE[r.state];
			img.rect(x, y, 580, rh, ri % 2 ? [243, 246, 252] : WHITE);
			img.rect(x, y + rh - 0.5, 580, 0.5, [208, 208, 208]);
			img.rect(x, y, 0.5, rh, [208, 208, 208]);
			img.rect(x + 579.5, y, 0.5, rh, [208, 208, 208]);
			img.text(String(r.no), x + 8, y + (rh - 7 * sc) / 2, sc, [40, 40, 40]);
			const put = (txt: string, col: number, width: number, color: RGB) => {
				// teks 1,5x maksimal 2 baris; bila lebih panjang, pakai 1x dengan maksimal 3 baris
				let s2 = sc, ls = wrapChars(txt, Math.floor((width - 10) / (6 * s2)), 99);
				if (ls.length > 2) { s2 = 1; ls = wrapChars(txt, Math.floor((width - 10) / (6 * s2)), 3); }
				const h = ls.length * 7 * s2 + (ls.length - 1) * 3;
				ls.forEach((l, i) => img.text(l, x + cum(col) + 8, y + (rh - h) / 2 + i * (7 * s2 + 3), s2, color));
			};
			put(r.step, 1, cw[1], st.text);
			put(r.result, 2, cw[2], r.state === 'skipped' ? [127, 127, 127] : [40, 40, 40]);
			const px = x + cum(3) + 5, pill = roundRectPts(px, y + 9, 82, 16, 8);
			img.poly(pill, st.stroke);
			img.text(FLOW_STATUS[r.state], px + 41, y + 9 + 4.5, 1, WHITE, 'c');
		});
	});
	const sy = top + 24 + 5 * rh + 14;
	img.text(`Ringkasan: ${fc.counts.critical} langkah jalur utama | ${fc.counts.active} cabang aktif dari 5 keputusan | ${fc.counts.skipped} cabang dilewati`, 40, sy, 2, [31, 31, 31]);

	// ── legenda ──
	const ly = fc.H - 30;
	let lx = 40;
	const legend = (label: string, draw: (x: number) => void) => { draw(lx); const t = lx + 32; img.text(label, t, ly - 1, 1.5, [40, 40, 40]); lx = t + tw(label, 1.5) + 26; };
	legend('Jalur utama', (x) => { const p = roundRectPts(x, ly - 3, 24, 14, 3); img.poly(p, FLOW_STYLE.critical.fill); img.strokePath(p, FLOW_STYLE.critical.stroke, 2.5, null, true); });
	legend('Cabang aktif', (x) => { const p = roundRectPts(x, ly - 3, 24, 14, 3); img.poly(p, FLOW_STYLE.active.fill); img.strokePath(p, FLOW_STYLE.active.stroke, 2, null, true); });
	legend('Cabang dilewati', (x) => { const p = roundRectPts(x, ly - 3, 24, 14, 3); img.poly(p, FLOW_STYLE.skipped.fill); img.strokePath(p, FLOW_STYLE.skipped.stroke, 1.5, [4, 3], true); });
	legend('Keputusan', (x) => { const p: [number, number][] = [[x + 12, ly - 4], [x + 26, ly + 4], [x + 12, ly + 12], [x - 2, ly + 4]]; img.poly(p, FLOW_STYLE.critical.fill); img.strokePath(p, FLOW_STYLE.critical.stroke, 1.5, null, true); });
	legend('Mulai / Selesai', (x) => { const p = roundRectPts(x, ly - 3, 30, 14, 7); img.poly(p, [192, 0, 0]); });
	return img;
}

/** Diagram alir sebagai PNG (dipakai jurnal DOCX/PDF dan lembar Excel). */
export function flowChart(fc: Flowchart): Chart {
	const im = renderFlow(fc);
	return { png: im.png(), w: im.lw, h: im.lh };
}

/** Render satu kali, hasilkan PNG dan JPG sekaligus (untuk fitur simpan gambar). */
export function flowImages(fc: Flowchart, jpgQuality = 92): { png: Uint8Array; jpg: Uint8Array; w: number; h: number } {
	const im = renderFlow(fc);
	return { png: im.png(), jpg: im.jpg(jpgQuality), w: im.lw, h: im.lh };
}

/** Diagram alur vertikal (PNG). Jalur kritis berwarna merah, cabang opsional biru. */
export function workflowChart(steps: { title: string; metric: string; critical: boolean }[]): Chart {
	const RED: RGB = [192, 0, 0], BLU: RGB = [47, 85, 151], GREY: RGB = [127, 127, 127];
	const lw = 640, top = 10, pitch = 70, bh = 56, bx = 50, bw = 560;
	const lh = top + steps.length * pitch + 44;
	const img = new Img(lw, lh);
	const arrow = (x: number, y: number, c: RGB) => { img.line(x - 5, y - 6, x, y, c, 1.5); img.line(x + 5, y - 6, x, y, c, 1.5); };
	steps.forEach((s, i) => {
		const y = top + i * pitch, col = s.critical ? RED : BLU;
		img.rect(bx, y, bw, bh, col);
		img.rect(bx + 2, y + 2, bw - 4, bh - 4, blend(WHITE, col, 0.1));
		img.rect(bx, y, 10, bh, col);
		img.text(`${i + 1}. ${short(s.title, 28)}`, bx + 22, y + 8, 3, TXT);
		img.text(short(s.metric, 44), bx + 22, y + 34, 2, AXIS);
		if (i < steps.length - 1) {
			const both = s.critical && steps[i + 1].critical, c = both ? RED : GREY;
			img.line(bx + bw / 2, y + bh, bx + bw / 2, y + pitch - 1, c, both ? 2 : 1);
			arrow(bx + bw / 2, y + pitch - 1, c);
		}
		if (s.critical) {
			const j = steps.findIndex((x, k) => k > i && x.critical);
			if (j > i + 1) {
				const ya = y + bh / 2, yb = top + j * pitch + bh / 2;
				img.line(bx, ya, 16, ya, RED, 2); img.line(16, ya, 16, yb, RED, 2); img.line(16, yb, bx - 2, yb, RED, 2);
				img.line(bx - 8, yb - 5, bx - 2, yb, RED, 2); img.line(bx - 8, yb + 5, bx - 2, yb, RED, 2);
			}
		}
	});
	const ly = lh - 30;
	img.rect(bx, ly, 18, 14, RED); img.text('JALUR KRITIS', bx + 26, ly + 1, 2, TXT);
	img.rect(bx + 220, ly, 18, 14, BLU); img.text('CABANG OPSIONAL', bx + 246, ly + 1, 2, TXT);
	return fin(img);
}

// ───────── grafik ─────────
export function hbarChart(items: { label: string; value: number }[],
	o: { fmt?: (v: number) => string; max?: number; colors?: RGB[]; labelLen?: number } = {}): Chart {
	const rows = items.length ? items : [{ label: '-', value: 0 }];
	const fmt = o.fmt ?? nfShort, ll = o.labelLen ?? 12;
	const left = ll * 18 + 18, right = 100, lw = 640, rowH = 34, top = 10;
	const plotH = rows.length * rowH, lh = top + plotH + 40;
	const img = new Img(lw, lh);
	const x0 = left, x1 = lw - right;
	const maxV = niceMax(o.max ?? Math.max(...rows.map((r) => r.value), 0));
	for (let i = 0; i <= 4; i++) {
		const x = x0 + ((x1 - x0) * i) / 4;
		img.line(x, top, x, top + plotH, i === 0 ? AXIS : GRID, i === 0 ? 1.5 : 1);
		if (i % 2 === 0) { img.text(fmt((maxV * i) / 4), x, top + plotH + 8, 3, TXT, i === 0 ? 'l' : i === 4 ? 'r' : 'c'); }
	}
	rows.forEach((r, i) => {
		const y = top + i * rowH + 6;
		const w = Math.max(0, Math.min(1, r.value / maxV)) * (x1 - x0);
		const col = o.colors ? o.colors[i % o.colors.length] : BLUE;
		img.rect(x0, y, Math.max(w, 1), 22, col);
		img.text(short(r.label, ll), x0 - 10, y + 0.5, 3, TXT, 'r');
		img.text(fmt(r.value), x0 + w + 8, y + 0.5, 3, TXT, 'l');
	});
	return fin(img);
}

export function gbarChart(cats: string[], series: { name: string; values: number[]; color?: RGB }[],
	o: { fmt?: (v: number) => string; max?: number } = {}): Chart {
	const fmt = o.fmt ?? nfShort, lw = 640, lh = 400, left = 100, right = 16;
	const showVals = cats.length * series.length <= 8;
	const legendH = series.length > 1 ? 34 : 0;
	const top = 16 + legendH + (showVals ? 24 : 0), bottom = lh - 56;
	const img = new Img(lw, lh);
	const maxV = niceMax(o.max ?? Math.max(...series.flatMap((s) => s.values), 0));
	yAxis(img, left, lw - right, top, bottom, 0, maxV, fmt);
	const slot = (lw - right - left) / Math.max(cats.length, 1), gap = slot * 0.2, bw = (slot - gap) / series.length;
	series.forEach((s, si) => {
		const col = s.color ?? PALETTE[si % PALETTE.length];
		s.values.forEach((v, ci) => {
			const h = (Math.max(0, v) / maxV) * (bottom - top), x = left + ci * slot + gap / 2 + si * bw;
			img.rect(x, bottom - h, bw - 2, h, col);
			const t = fmt(v);
			if (showVals && t.length * 18 - 3 <= bw + 14) { img.text(t, x + (bw - 2) / 2, bottom - h - 24, 3, TXT, 'c'); }
		});
	});
	const chars = Math.max(2, Math.floor((slot - 4) / 18));
	cats.forEach((c, ci) => img.text(short(c, chars), left + ci * slot + slot / 2, bottom + 10, 3, TXT, 'c'));
	if (series.length > 1) {
		series.forEach((s, si) => {
			const x = left + si * 200;
			img.rect(x, 12, 18, 18, s.color ?? PALETTE[si % PALETTE.length]);
			img.text(short(s.name, 9), x + 26, 12.5, 3, TXT, 'l');
		});
	}
	return fin(img);
}

export function histChart(h: Hist): Chart {
	const lw = 640, lh = 400, x0 = 100, x1 = lw - 16, yT = 16, yB = lh - 60;
	const img = new Img(lw, lh);
	const maxV = niceMax(Math.max(...h.counts, 0));
	yAxis(img, x0, x1, yT, yB, 0, maxV, nfShort);
	const n = h.counts.length, bw = (x1 - x0) / n;
	h.counts.forEach((c, i) => img.rect(x0 + i * bw + 1, yB - (c / maxV) * (yB - yT), Math.max(bw - 2, 1), (c / maxV) * (yB - yT), BLUE));
	const parts = (s: string) => s.split(' – ');
	const first = parts(h.labels[0])[0], last = parts(h.labels[n - 1]).pop() ?? '';
	img.text(first, x0, yB + 10, 3, TXT, 'l');
	img.text(last, x1, yB + 10, 3, TXT, 'r');
	if (n >= 3) { img.text(parts(h.labels[Math.floor(n / 2)])[0], x0 + (Math.floor(n / 2) + 0.5) * bw, yB + 10, 3, TXT, 'c'); }
	return fin(img);
}

export function scatterChart(pts: [number, number][], xl: string, yl: string): Chart {
	const lw = 640, lh = 420, x0 = 100, x1 = lw - 20, yT = 40, yB = lh - 70;
	const img = new Img(lw, lh);
	let minX = Math.min(...pts.map((p) => p[0])), maxX = Math.max(...pts.map((p) => p[0]));
	let minY = Math.min(...pts.map((p) => p[1])), maxY = Math.max(...pts.map((p) => p[1]));
	if (minX === maxX) { minX -= 1; maxX += 1; }
	if (minY === maxY) { minY -= 1; maxY += 1; }
	yAxis(img, x0, x1, yT, yB, minY, maxY, nfShort);
	img.line(x0, yB, x1, yB, AXIS, 1.5);
	const px = (x: number) => x0 + ((x - minX) / (maxX - minX)) * (x1 - x0);
	const py = (y: number) => yB - ((y - minY) / (maxY - minY)) * (yB - yT);
	pts.forEach(([x, y]) => img.circle(px(x), py(y), 2.6, BLUE));
	const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
	const sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0), sxy = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0);
	if (sxx > 0) {
		const b = sxy / sxx, a = my - b * mx;
		const cl = (v: number) => Math.max(minY, Math.min(maxY, v));
		img.line(px(minX), py(cl(a + b * minX)), px(maxX), py(cl(a + b * maxX)), PALETTE[1], 2.5);
	}
	img.text(nfShort(minX), x0, yB + 10, 3, TXT, 'l');
	img.text(nfShort(maxX), x1, yB + 10, 3, TXT, 'r');
	img.text(short(xl, 28), (x0 + x1) / 2, lh - 30, 3, TXT, 'c');
	img.text(short(yl, 30), x0, 8, 3, TXT, 'l');
	return fin(img);
}

export function lineChart(labels: string[], values: number[], yTitle: string): Chart {
	const lw = 640, lh = 400, x0 = 100, x1 = lw - 24, yT = 44, yB = lh - 60;
	const img = new Img(lw, lh);
	let lo = Math.min(...values), hi = Math.max(...values);
	if (lo === hi) { lo -= 1; hi += 1; }
	const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
	yAxis(img, x0, x1, yT, yB, lo, hi, nfShort);
	const n = values.length;
	const px = (i: number) => x0 + (n === 1 ? 0 : (i / (n - 1)) * (x1 - x0));
	const py = (v: number) => yB - ((v - lo) / (hi - lo)) * (yB - yT);
	for (let i = 1; i < n; i++) { img.line(px(i - 1), py(values[i - 1]), px(i), py(values[i]), BLUE, 2.5); }
	if (n <= 40) { values.forEach((v, i) => img.circle(px(i), py(v), 3.5, BLUE)); }
	const idx = n < 3 ? [0, n - 1] : [0, Math.floor((n - 1) / 2), n - 1];
	idx.forEach((i, k) => img.text(labels[i], px(i), yB + 10, 3, TXT, k === 0 ? 'l' : k === idx.length - 1 ? 'r' : 'c'));
	img.text(short(yTitle, 32), x0, 10, 3, TXT, 'l');
	return fin(img);
}

export function matrixChart(rowLabels: string[], colLabels: string[], m: (number | null)[][],
	o: { kind: 'corr' | 'count'; fmt?: (v: number) => string }): Chart {
	const n = rowLabels.length, mc = colLabels.length, left = 158, lw = 640, top = 34;
	const cell = Math.min(80, (lw - left - 16) / Math.max(n, mc));
	const lh = Math.ceil(top + n * cell + 16);
	const img = new Img(lw, lh);
	const maxC = Math.max(1, ...m.flat().map((v) => (v ?? 0)));
	const hs = o.kind === 'corr' ? 3 : 2;
	colLabels.forEach((l, j) => img.text(short(l, Math.max(1, Math.floor((cell - 2) / (6 * hs)))), left + j * cell + cell / 2, 6, hs, TXT, 'c'));
	const fmt = o.fmt ?? ((v: number) => (o.kind === 'corr' ? v.toFixed(2) : String(v)));
	for (let i = 0; i < n; i++) {
		img.text(short(rowLabels[i], 8), left - 8, top + i * cell + (cell - 21) / 2, 3, TXT, 'r');
		for (let j = 0; j < mc; j++) {
			const v = m[i]?.[j] ?? null;
			let col: RGB, inten: number;
			if (v === null) { col = [230, 230, 230]; inten = 0; }
			else if (o.kind === 'corr') { inten = Math.abs(v); col = v >= 0 ? blend(WHITE, [192, 80, 77], v) : blend(WHITE, [68, 114, 196], -v); }
			else { inten = v / maxC; col = blend(WHITE, BLUE, inten); }
			img.rect(left + j * cell, top + i * cell, cell - 1.5, cell - 1.5, col);
			const s = v === null ? '-' : fmt(v);
			const sc = (s.length * 6 - 1) * 3 <= cell - 6 ? 3 : 2;
			img.text(s, left + j * cell + (cell - 1.5) / 2, top + i * cell + (cell - 1.5 - 7 * sc) / 2, sc, inten > 0.55 ? WHITE : TXT, 'c');
		}
	}
	return fin(img);
}