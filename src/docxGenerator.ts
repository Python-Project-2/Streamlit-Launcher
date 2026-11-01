import {
	AlignmentType, BorderStyle, Document, Header, HeadingLevel, ImageRun, LevelFormat, Packer, PageBreak,
	PageNumber, Paragraph, SectionType, ShadingType, Tab, TabStopType, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx';
import type { Align, Block, Journal } from './Journal';

const FONT = 'Times New Roman';
const PAGE_W = 11906, PAGE_H = 16838, MARGIN = 1134;             // A4, margin 2 cm
const TEXT_W = PAGE_W - 2 * MARGIN;                              // 9638 DXA
const COL_GAP = 360;
const COL_W = Math.floor((TEXT_W - COL_GAP) / 2);                // lebar satu kolom (DXA)
const FIG_PX = 305;                                              // lebar gambar dalam satu kolom (px)
const BLUE = '2F5597';

const ALIGN = { l: AlignmentType.LEFT, r: AlignmentType.RIGHT, c: AlignmentType.CENTER } as const;
const HEADING = { h1: HeadingLevel.HEADING_1, h2: HeadingLevel.HEADING_2, h3: HeadingLevel.HEADING_3 } as const;

function columnWidths(head: string[], rows: string[][]): number[] {
	const w = head.map((h, i) => Math.min(30, Math.max(5, h.length, ...rows.map((r) => (r[i] ?? '').length))));
	const sum = w.reduce((a, b) => a + b, 0);
	const out = w.map((x) => Math.floor((COL_W * x) / sum));
	out[out.length - 1] += COL_W - out.reduce((a, b) => a + b, 0);
	return out;
}

// Garis tabel: sisi kanan & bawah dibuat lebih tebal/gelap agar tampak berbayangan (shadow).
const line = { style: BorderStyle.SINGLE, size: 4, color: '808080' };
const shade = { style: BorderStyle.SINGLE, size: 16, color: '6E6E6E' };
const borders = { top: line, bottom: shade, left: line, right: shade, insideHorizontal: line, insideVertical: line };

function cell(text: string, width: number, align: Align, header: boolean, zebra: boolean): TableCell {
	const fill = header ? 'D9E2F3' : zebra ? 'F3F6FC' : undefined;
	return new TableCell({
		width: { size: width, type: WidthType.DXA },
		shading: fill ? { type: ShadingType.CLEAR, fill, color: 'auto' } : undefined,
		margins: { top: 30, bottom: 30, left: 60, right: 60 },
		children: [new Paragraph({
			alignment: ALIGN[align],
			children: [new TextRun({ text, bold: header, size: 16, font: FONT })],
		})],
	});
}

/** Kompatibel dengan docx 7.x (tanpa "type") maupun 8.x/9.x (dengan "type"). */
function makeImage(b: { png: Uint8Array; w: number; h: number; no: number; caption: string }): ImageRun {
	const opts: any = {
		type: 'png',
		data: b.png,
		transformation: { width: FIG_PX, height: Math.round((FIG_PX * b.h) / b.w) },
		altText: { title: `Gambar ${b.no}`, description: b.caption, name: `gambar-${b.no}` },
	};
	return new ImageRun(opts);
}

/** Kotak sorotan (Temuan Utama) tetap berbayangan. */
const boxBorder = {
	top: { style: BorderStyle.SINGLE, size: 4, color: 'B4C6E7', space: 4 },
	left: { style: BorderStyle.SINGLE, size: 24, color: BLUE, space: 6 },
	bottom: { style: BorderStyle.SINGLE, size: 16, color: '6E6E6E', space: 4 },
	right: { style: BorderStyle.SINGLE, size: 16, color: '6E6E6E', space: 6 },
};

function boxParas(title: string, text: string, size: number): Paragraph[] {
	const shading = { type: ShadingType.CLEAR, fill: 'EAF1FB', color: 'auto' } as const;
	return [
		new Paragraph({
			shading, border: boxBorder, alignment: AlignmentType.LEFT,
			spacing: { before: 100, after: 0, line: 252 }, indent: { left: 120, right: 120 },
			children: [new TextRun({ text: title, bold: true, size, color: BLUE })],
		}),
		new Paragraph({
			shading, border: boxBorder, alignment: AlignmentType.JUSTIFIED,
			spacing: { before: 0, after: 160, line: 252 }, indent: { left: 120, right: 120 },
			children: [new TextRun({ text, size })],
		}),
	];
}

/** Abstrak gaya jurnal: "Abstrak - isi..." (label tebal, satu paragraf rata kiri-kanan). */
function abstractParas(label: string, text: string, kwLabel: string, kw: string, italic: boolean): Paragraph[] {
	const size = 18;
	return [
		new Paragraph({
			alignment: AlignmentType.JUSTIFIED, spacing: { before: 60, after: 40, line: 240 },
			children: [
				new TextRun({ text: label, bold: true, italics: italic, size }),
				new TextRun({ text: ` - ${text}`, italics: italic, size }),
			],
		}),
		new Paragraph({
			alignment: AlignmentType.JUSTIFIED, spacing: { after: 100, line: 240 },
			children: [
				new TextRun({ text: kwLabel, bold: true, italics: italic, size }),
				new TextRun({ text: `: ${kw}`, italics: italic, size }),
			],
		}),
	];
}

function toChildren(blocks: Block[]): (Paragraph | Table)[] {
	const out: (Paragraph | Table)[] = [];
	for (const b of blocks) {
		switch (b.t) {
			case 'h1':
				// Gaya contoh: judul bab rata kiri, huruf kapital tebal, tanpa garis bawah.
				out.push(new Paragraph({
					heading: HEADING.h1, alignment: AlignmentType.LEFT, keepNext: true,
					children: [new TextRun({ text: b.text.toUpperCase() })],
				}));
				break;
			case 'h2': case 'h3':
				out.push(new Paragraph({
					heading: HEADING[b.t], keepNext: true,
					children: [new TextRun({ text: b.text, italics: b.t === 'h3' })],
				}));
				break;
			case 'p':
				out.push(new Paragraph({
					alignment: AlignmentType.JUSTIFIED,
					spacing: { line: 264, after: 80 },
					indent: { firstLine: 360 },
					children: [new TextRun({ text: b.text })],
				}));
				break;
			case 'formula':
				out.push(new Paragraph({
					alignment: AlignmentType.CENTER,
					spacing: { before: 40, after: 80 },
					children: [new TextRun({ text: b.text, italics: true, size: 19 })],
				}));
				break;
			case 'bullets':
				for (const it of b.items) {
					out.push(new Paragraph({
						numbering: { reference: 'bul', level: 0 },
						alignment: AlignmentType.JUSTIFIED,
						spacing: { after: 40 },
						children: [new TextRun({ text: it })],
					}));
				}
				break;
			case 'callout':
				out.push(...boxParas(b.title, b.text, 19));
				break;
			case 'table': {
				const cw = columnWidths(b.head, b.rows);
				const align = b.head.map((_, i) => b.align?.[i] ?? (i === 0 ? 'l' : 'c'));
				out.push(new Paragraph({
					alignment: AlignmentType.CENTER, keepNext: true,
					spacing: { before: 120, after: 60 },
					children: [
						new TextRun({ text: `Tabel ${b.no}. `, bold: true, size: 18 }),
						new TextRun({ text: b.caption, size: 18 }),
					],
				}));
				out.push(new Table({
					width: { size: COL_W, type: WidthType.DXA },
					columnWidths: cw,
					borders,
					rows: [
						new TableRow({ tableHeader: true, cantSplit: true, children: b.head.map((h, i) => cell(h, cw[i], 'c', true, false)) }),
						...b.rows.map((r, ri) => new TableRow({
							cantSplit: true,
							children: b.head.map((_, i) => cell(r[i] ?? '', cw[i], align[i], false, ri % 2 === 1)),
						})),
					],
				}));
				out.push(new Paragraph({ spacing: { after: 100 }, children: [] }));
				break;
			}
			case 'figure':
				out.push(new Paragraph({
					alignment: AlignmentType.CENTER, keepNext: true,
					spacing: { before: 100, after: 40 },
					children: [makeImage(b)],
				}));
				out.push(new Paragraph({
					alignment: AlignmentType.CENTER,
					spacing: { after: 140 },
					children: [
						new TextRun({ text: `Gambar ${b.no}. `, bold: true, size: 18 }),
						new TextRun({ text: b.caption, size: 18 }),
					],
				}));
				break;
			case 'pagebreak':
				out.push(new Paragraph({ children: [new PageBreak()] }));
				break;
		}
	}
	return out;
}

export async function renderDocx(j: Journal): Promise<Uint8Array> {
	const shortTitle = j.title.length > 85 ? j.title.slice(0, 84) + '…' : j.title;

	// Header di semua halaman: judul di kiri, "Halaman N" di kanan (seperti contoh).
	const makeHeader = () => new Header({
		children: [new Paragraph({
			tabStops: [{ type: TabStopType.RIGHT, position: TEXT_W }],
			border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: '808080', space: 2 } },
			children: [
				new TextRun({ text: shortTitle, size: 16, font: FONT }),
				new TextRun({ children: [new Tab(), 'Halaman ', PageNumber.CURRENT], size: 16, font: FONT }),
			],
		})],
	});

	// Judul rata tengah, penulis, afiliasi (miring), surel (biru bergaris bawah), lalu abstrak.
	const front: Paragraph[] = [
		new Paragraph({
			alignment: AlignmentType.CENTER, spacing: { after: 160 },
			children: [new TextRun({ text: j.title, bold: true, size: 30 })],
		}),
		new Paragraph({
			alignment: AlignmentType.CENTER, spacing: { after: 40 },
			children: [new TextRun({ text: j.author, size: 22 })],
		}),
		...(j.affiliation ? [new Paragraph({
			alignment: AlignmentType.CENTER, spacing: { after: 20 },
			children: [new TextRun({ text: j.affiliation, size: 18, italics: true })],
		})] : []),
		...(j.email ? [new Paragraph({
			alignment: AlignmentType.CENTER, spacing: { after: 140 },
			children: [new TextRun({ text: j.email, size: 18, color: '0000FF', underline: {} })],
		})] : []),
		...abstractParas('Abstrak', j.abstractId, 'Kata Kunci', j.keywordsId, false),
		...abstractParas('Abstract', j.abstractEn, 'Keywords', j.keywordsEn, true),
		new Paragraph({ spacing: { after: 80 }, children: [] }),
	];

	const body: (Paragraph | Table)[] = [
		...toChildren(j.blocks),
		new Paragraph({
			heading: HeadingLevel.HEADING_1, alignment: AlignmentType.LEFT, keepNext: true,
			children: [new TextRun({ text: 'DAFTAR PUSTAKA' })],
		}),
		...j.refRuns.map((runs) => new Paragraph({
			alignment: AlignmentType.LEFT,
			indent: { left: 360, hanging: 360 },
			spacing: { after: 60 },
			children: runs.map((r) => new TextRun({ text: r.text, italics: r.i, size: 18 })),
		})),
		...toChildren(j.appendix),
	];

	const heading = (id: string, size: number, name: string, level: number) => ({
		id, name, basedOn: 'Normal', next: 'Normal', quickFormat: true,
		run: { font: FONT, size, bold: true, color: '000000' },
		paragraph: { spacing: { before: level === 0 ? 200 : 140, after: 80 }, outlineLevel: level },
	});

	const page = { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN + 200, right: MARGIN, bottom: MARGIN, left: MARGIN, header: 560 } };

	const doc = new Document({
		creator: j.author,
		title: j.title,
		styles: {
			default: { document: { run: { font: FONT, size: 20 } } },
			paragraphStyles: [
				heading('Heading1', 20, 'Heading 1', 0),
				heading('Heading2', 20, 'Heading 2', 1),
				heading('Heading3', 20, 'Heading 3', 2),
			],
		},
		numbering: {
			config: [{
				reference: 'bul',
				levels: [{
					level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
					style: { paragraph: { indent: { left: 360, hanging: 240 } } },
				}],
			}],
		},
		sections: [
			{ properties: { page }, headers: { default: makeHeader() }, children: front },
			{
				properties: { type: SectionType.CONTINUOUS, page, column: { count: 2, space: COL_GAP, equalWidth: true } },
				headers: { default: makeHeader() },
				children: body,
			},
		],
	});

	return new Uint8Array(await Packer.toBuffer(doc));
}