import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import type { Align, Block, Journal } from './Journal';

const PW = 595.28;
const PH = 841.89;
const M = 56;
const CW = PW - 2 * M;
const BLUE = rgb(0.18, 0.33, 0.59);

/** Font standar PDF hanya mendukung WinAnsi; karakter lain diganti/dibuang agar tidak error. */
const clean = (s: string): string => s
	.replace(/Σ/g, 'Sum').replace(/√/g, 'sqrt')
	.replace(/[\u2080-\u2089]/g, (m) => String(m.charCodeAt(0) - 0x2080))
	.replace(/[−‐‑]/g, '-').replace(/→/g, '->').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/≈/g, '~')
	.replace(/[\u00A0\u2009\u202F]/g, ' ').replace(/\t/g, ' ')
	.replace(/[^\n\x20-\x7E\xA1-\xFF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g, '');

interface ParaOpts {
	font?: PDFFont; size?: number; align?: 'left' | 'center' | 'justify';
	indent?: number; bullet?: boolean; hang?: number; before?: number; after?: number; lh?: number;
	/** Awalan tebal pada baris pertama, mis. "Abstrak -" atau "Kata Kunci:". */
	lead?: string; leadFont?: PDFFont; color?: ReturnType<typeof rgb>;
}
interface BoxOpts { title?: string; size?: number; font?: PDFFont; fill?: [number, number, number] }

export async function renderPdf(j: Journal): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	doc.setTitle(clean(j.title));
	doc.setAuthor(clean(j.author));
	doc.setCreator('Date Skunder');
	const reg = await doc.embedFont(StandardFonts.TimesRoman);
	const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
	const ital = await doc.embedFont(StandardFonts.TimesRomanItalic);
	const boldItal = await doc.embedFont(StandardFonts.TimesRomanBoldItalic);

	let page: PDFPage = doc.addPage([PW, PH]);
	let y = PH - M - 6;
	const newPage = () => { page = doc.addPage([PW, PH]); y = PH - M - 6; };
	const need = (h: number) => { if (y - h < M) { newPage(); } };

	const wrap = (text: string, font: PDFFont, size: number, width: number): string[] => {
		const out: string[] = [];
		for (const paraText of clean(text).split('\n')) {
			let line = '';
			for (let w of paraText.split(/\s+/).filter(Boolean)) {
				while (font.widthOfTextAtSize(w, size) > width) {
					let k = w.length - 1;
					while (k > 1 && font.widthOfTextAtSize(w.slice(0, k), size) > width) { k--; }
					if (line) { out.push(line); line = ''; }
					out.push(w.slice(0, k));
					w = w.slice(k);
				}
				const t = line ? `${line} ${w}` : w;
				if (font.widthOfTextAtSize(t, size) <= width) { line = t; } else { out.push(line); line = w; }
			}
			out.push(line);
		}
		return out;
	};

	const para = (text: string, o: ParaOpts = {}) => {
		const font = o.font ?? reg;
		const size = o.size ?? 11.5;
		const lh = (o.lh ?? 1.45) * size;
		const left = M + (o.indent ?? 0);
		const offset = o.bullet ? 14 : (o.hang ?? 0);
		const lead = o.lead ? clean(o.lead) : '';
		const lines = wrap(lead ? `${lead} ${text}` : text, font, size, CW - (o.indent ?? 0) - offset);
		y -= o.before ?? 0;
		lines.forEach((ln, i) => {
			need(lh);
			y -= lh;
			let x = i === 0 && o.hang ? left : left + offset;
			if (i === 0 && o.bullet) { page.drawText('\u2022', { x, y: y, size, font }); }
			let body = ln;
			if (i === 0 && lead && ln.startsWith(lead)) {
				const lf = o.leadFont ?? bold;
				page.drawText(lead, { x, y, size, font: lf, color: o.color });
				x += lf.widthOfTextAtSize(lead + ' ', size);
				body = ln.slice(lead.length).trimStart();
			}
			const w = font.widthOfTextAtSize(body, size);
			if (o.align === 'center') {
				page.drawText(body, { x: M + (CW - font.widthOfTextAtSize(ln, size)) / 2, y, size, font, color: o.color });
			} else if (o.align === 'justify' && i < lines.length - 1 && body.includes(' ')) {
				const words = body.split(' ');
				const tw = words.reduce((a, s) => a + font.widthOfTextAtSize(s, size), 0);
				const gap = (M + CW - x - tw) / (words.length - 1);
				if (gap > size) {
					page.drawText(body, { x, y, size, font, color: o.color });
				} else {
					let cx = x;
					for (const wd of words) { page.drawText(wd, { x: cx, y, size, font, color: o.color }); cx += font.widthOfTextAtSize(wd, size) + gap; }
				}
			} else {
				void w;
				page.drawText(body, { x, y, size, font, color: o.color });
			}
		});
		y -= o.after ?? 6;
	};

	/** Kotak sorotan (Temuan Utama) berbayangan. */
	const box = (text: string, o: BoxOpts = {}) => {
		const size = o.size ?? 10, lh = size * 1.4, pad = 8;
		const font = o.font ?? reg;
		const fill = o.fill ?? [0.93, 0.96, 1];
		const lines = wrap(text, font, size, CW - 2 * pad - 6);
		const th = o.title ? lh + 2 : 0;
		const h = pad * 2 + th + lines.length * lh;
		need(Math.min(h, PH - 2 * M) + 12);
		y -= 6;
		const top = y;
		page.drawRectangle({ x: M + 3, y: top - h - 3, width: CW, height: h, color: rgb(0.35, 0.35, 0.35), opacity: 0.3 });
		page.drawRectangle({ x: M + 1.5, y: top - h - 1.5, width: CW, height: h, color: rgb(0.35, 0.35, 0.35), opacity: 0.2 });
		page.drawRectangle({ x: M, y: top - h, width: CW, height: h, color: rgb(fill[0], fill[1], fill[2]), borderColor: BLUE, borderWidth: 0.8 });
		page.drawRectangle({ x: M, y: top - h, width: 4, height: h, color: BLUE });
		let cur = top - pad;
		if (o.title) {
			cur -= lh;
			page.drawText(clean(o.title), { x: M + pad + 4, y: cur + lh * 0.25, size, font: bold, color: BLUE });
			cur -= 2;
		}
		for (const ln of lines) {
			cur -= lh;
			page.drawText(ln, { x: M + pad + 4, y: cur + lh * 0.25, size, font });
		}
		y = top - h - 12;
	};

	const table = (caption: string, head: string[], rows: string[][], align: Align[]) => {
		const size = 9.5, pad = 3, lh = size * 1.3;
		need(60);
		para(caption, { font: bold, size: 10.5, align: 'center', before: 6, after: 4 });
		const wts = head.map((h, i) => Math.min(40, Math.max(6, h.length, ...rows.map((r) => (r[i] ?? '').length))));
		const sum = wts.reduce((a, b) => a + b, 0);
		const cw = wts.map((x) => (CW * x) / sum);

		const drawRow = (r: string[], header: boolean, zebra: boolean) => {
			const f = header ? bold : reg;
			const cl = head.map((_, i) => wrap(r[i] ?? '', f, size, cw[i] - 2 * pad));
			const h = Math.max(...cl.map((l) => l.length)) * lh + 2 * pad;
			if (y - h < M) { newPage(); if (!header) { drawRow(head, true, false); } }
			page.drawRectangle({ x: M + 2.5, y: y - h - 2.5, width: CW, height: h, color: rgb(0.4, 0.4, 0.4), opacity: 0.3 });
			let x = M;
			cl.forEach((lines, i) => {
				page.drawRectangle({
					x, y: y - h, width: cw[i], height: h,
					borderColor: rgb(0.5, 0.5, 0.5), borderWidth: 0.5,
					color: header ? rgb(0.85, 0.89, 0.95) : zebra ? rgb(0.955, 0.965, 0.985) : rgb(1, 1, 1),
				});
				lines.forEach((ln, k) => {
					const tw = f.widthOfTextAtSize(ln, size);
					const a = header ? 'c' : align[i];
					const tx = a === 'r' ? x + cw[i] - pad - tw : a === 'c' ? x + (cw[i] - tw) / 2 : x + pad;
					page.drawText(ln, { x: tx, y: y - pad - k * lh - size, size, font: f });
				});
				x += cw[i];
			});
			y -= h;
		};

		drawRow(head, true, false);
		rows.forEach((r, i) => drawRow(r, false, i % 2 === 1));
		y -= 14;
	};

	/** Judul bab (I., II., ...) rata kiri huruf kapital tebal; sub-bab (A., B., ...) tebal; sub-sub miring. */
	const heading = (level: 'h1' | 'h2' | 'h3', text: string) => {
		const cfg = { h1: { s: 11.5, b: 12, a: 4, f: bold }, h2: { s: 11.5, b: 8, a: 3, f: bold }, h3: { s: 11.5, b: 6, a: 3, f: boldItal } }[level];
		need(cfg.s * 1.45 + cfg.b + 50);
		para(level === 'h1' ? text.toUpperCase() : text, { font: cfg.f, size: cfg.s, before: cfg.b, after: cfg.a, align: 'left' });
	};

	// muat semua gambar sekali di awal
	const images = new Map<Uint8Array, PDFImage>();
	const allBlocks: Block[] = [...j.blocks, ...j.appendix];
	for (const b of allBlocks) {
		if (b.t === 'figure' && !images.has(b.png)) { images.set(b.png, await doc.embedPng(b.png)); }
	}

	const render = (blocks: Block[]) => {
		for (const b of blocks) {
			switch (b.t) {
				case 'h1': case 'h2': case 'h3': heading(b.t, b.text); break;
				case 'p': para(b.text, { align: 'justify' }); break;
				case 'formula': para(b.text, { font: ital, size: 11, align: 'center', before: 2, after: 4 }); break;
				case 'bullets': b.items.forEach((it) => para(it, { bullet: true, indent: 8, size: 11, after: 3, align: 'justify' })); break;
				case 'callout': box(b.text, { title: b.title, size: 10.5 }); break;
				case 'table': {
					const align = b.head.map((_, i) => b.align?.[i] ?? (i === 0 ? 'l' : 'c')) as Align[];
					table(`Tabel ${b.no}. ${b.caption}`, b.head, b.rows, align);
					break;
				}
				case 'figure': {
					const im = images.get(b.png)!;
					const w = Math.min(CW * 0.85, 400), h = (w * b.h) / b.w;
					need(h + 40);
					y -= h;
					page.drawImage(im, { x: M + (CW - w) / 2, y, width: w, height: h });
					y -= 2;
					para(`Gambar ${b.no}. ${b.caption}`, { size: 10, align: 'center', after: 10 });
					break;
				}
				case 'pagebreak': newPage(); break;
			}
		}
	};

	// judul, penulis, afiliasi, surel
	para(j.title, { font: bold, size: 16, align: 'center', after: 6, lh: 1.3 });
	para(j.author, { size: 12, align: 'center', after: 2 });
	if (j.affiliation) { para(j.affiliation, { font: ital, size: 10, align: 'center', after: 2 }); }
	if (j.email) { para(j.email, { size: 10, align: 'center', after: 8, color: rgb(0, 0, 0.9) }); }

	// abstrak gaya jurnal: "Abstrak - ..." dan "Kata Kunci: ..." (label tebal)
	const abs = { size: 9, lh: 1.3, align: 'justify' as const };
	para(j.abstractId, { ...abs, lead: 'Abstrak -', after: 3 });
	para(j.keywordsId, { ...abs, lead: 'Kata Kunci:', after: 5 });
	para(j.abstractEn, { ...abs, font: ital, leadFont: boldItal, lead: 'Abstract -', after: 3 });
	para(j.keywordsEn, { ...abs, font: ital, leadFont: boldItal, lead: 'Keywords:', after: 8 });

	render(j.blocks);
	heading('h1', 'Daftar Pustaka');
	j.references.forEach((r) => para(r, { hang: 28, size: 10.5, after: 5 }));
	render(j.appendix);

	// header di semua halaman: judul di kiri, "Halaman N" di kanan (seperti contoh)
	const shortTitle = clean(j.title.length > 80 ? j.title.slice(0, 79) + '...' : j.title);
	doc.getPages().forEach((pg, i) => {
		const t = `Halaman ${i + 1}`;
		pg.drawText(shortTitle, { x: M, y: PH - 34, size: 8, font: reg });
		pg.drawText(t, { x: PW - M - reg.widthOfTextAtSize(t, 8), y: PH - 34, size: 8, font: reg });
		pg.drawLine({ start: { x: M, y: PH - 38 }, end: { x: PW - M, y: PH - 38 }, thickness: 0.8, color: rgb(0.5, 0.5, 0.5) });
	});

	return doc.save();
}