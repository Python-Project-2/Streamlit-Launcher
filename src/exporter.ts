import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { analyzeWorkbook, WorkbookResult } from './analysis';
import { treeOptionsFromSettings } from './treeConfig';
import { globalAnalysisStore } from './analysisStore';
import { buildJournal } from './Journal';
import { renderDocx } from './docxGenerator';
import { renderPdf } from './pdfgenerator';
import { renderXlsx } from './excelGenerator';
import { renderPptx } from './pptgenerator';
import { layoutFlow, workflowSvg } from './workflow';
import { flowImages } from './chartImages';
import { buildEasyCastHtml } from './Easycasthtml';
import { renderEasyCastPdf } from './easycastPdf';
import { tr, uiLang } from './i18n';

export type ExportFormat = 'docx' | 'pdf' | 'xlsx' | 'pptx' | 'workflow' | 'json' | 'html' | 'easycastPdf';

const LABEL: Record<ExportFormat, string> = {
	docx: 'jurnal DOCX', pdf: 'jurnal PDF', xlsx: 'laporan Excel', pptx: 'presentasi PowerPoint (PPTX)',
	workflow: 'gambar workflow (PNG, JPG, SVG)', json: 'data JSON (seluruh analisis)',
	html: 'dasbor EasyCast (.html)', easycastPdf: 'dasbor EasyCast (PDF)',
};

const LABEL_ZH: Record<ExportFormat, string> = {
	docx: '论文 DOCX', pdf: '论文 PDF', xlsx: 'Excel 报告', pptx: 'PowerPoint 演示文稿（PPTX）',
	workflow: '流程图（PNG、JPG、SVG）', json: 'JSON 数据（全部分析）',
	html: 'EasyCast 仪表板（.html）', easycastPdf: 'EasyCast 仪表板（PDF）',
};

const labelOf = (format: ExportFormat) => tr(LABEL[format], LABEL_ZH[format]);

interface OutFile { suffix: string; ext: string; data: Uint8Array }

/** Detik per slide EasyCast mengikuti pengaturan yang sama dengan siaran TV. */
function slideSeconds(): number {
	return Math.min(60, Math.max(5, Math.round(vscode.workspace.getConfiguration('dateSkunder').get<number>('easycast.slideSeconds') ?? 12)));
}

/** Baca + analisis berkas sumber; dipakai bersama oleh ekspor dan pencetakan EasyCast. */
async function analyzeSource(source: vscode.Uri): Promise<{ wb: WorkbookResult; fileName: string }> {
	const fileName = path.posix.basename(source.path);
	const bytes = await vscode.workspace.fs.readFile(source);
	const wb = analyzeWorkbook(bytes, fileName, treeOptionsFromSettings());
	globalAnalysisStore.set(source.toString(), wb, fileName);
	return { wb, fileName };
}

/**
 * Membuat jurnal DOCX/PDF, laporan Excel (.xlsx), presentasi PowerPoint (.pptx), gambar workflow
 * (PNG + JPG + SVG), data JSON, atau dasbor EasyCast (HTML mandiri + PDF slide)
 * langsung dari file sumber. File disimpan di folder sumber (atau dateSkunder.exportFolder).
 */
export async function exportReport(format: ExportFormat, source: vscode.Uri, sheetName?: string): Promise<vscode.Uri | undefined> {
	const title = tr(`Membuat ${LABEL[format]}…`, `正在生成${LABEL_ZH[format]}…`);
	return vscode.window.withProgress(
		{ location: vscode.ProgressLocation.Notification, title },
		async () => {
			try {
				const cfg = vscode.workspace.getConfiguration('dateSkunder');
				const { wb, fileName } = await analyzeSource(source);
				const sheet =
					(sheetName && wb.sheets.find((s) => s.name === sheetName)) ||
					[...wb.sheets].sort((a, b) => b.totalRows - a.totalRows)[0];

				const author = cfg.get<string>('authorName') || 'Penulis';
				const affiliation = cfg.get<string>('affiliation') || '';
				const files: OutFile[] = [];
				if (format === 'docx' || format === 'pdf') {
					const journal = buildJournal(sheet, fileName, { author, affiliation, email: cfg.get<string>('email') || '' });
					files.push({ suffix: '-jurnal', ext: format, data: format === 'docx' ? await renderDocx(journal) : await renderPdf(journal) });
				} else if (format === 'xlsx') {
					files.push({ suffix: '-analisis', ext: 'xlsx', data: await renderXlsx(sheet, fileName) });
				} else if (format === 'pptx') {
					files.push({ suffix: '-presentasi', ext: 'pptx', data: await renderPptx(sheet, fileName, { author, affiliation }) });
				} else if (format === 'json') {
					// Seluruh hasil analisis berkas ini (semua lembar) sebagai .json yang bisa dibaca mesin.
					const isi = {
						exportedAt: new Date().toISOString(),
						sourceFileName: fileName,
						sheets: wb.sheets.map((s) => s.name),
						analysis: wb,
					};
					files.push({ suffix: '-data', ext: 'json', data: new TextEncoder().encode(JSON.stringify(isi)) });
				} else if (format === 'html') {
					// Dasbor EasyCast mandiri: seluruh ringkasan, grafik, dan data tertanam di satu file.
					files.push({ suffix: '-easycast', ext: 'html', data: new TextEncoder().encode(buildEasyCastHtml(wb, { seconds: slideSeconds(), lang: uiLang() })) });
				} else if (format === 'easycastPdf') {
					files.push({
						suffix: '-easycast', ext: 'pdf',
						data: await renderEasyCastPdf(wb, { footer: `${fileName} · Date Skunder`, maxTableRows: 12 }),
					});
				} else {
					// Gambar dirender satu kali, lalu disimpan sebagai PNG (utama), JPG, dan SVG (vektor).
					const fc = layoutFlow(sheet, 'slide', `Dataset ${fileName}, lembar ${sheet.name}`);
					const img = flowImages(fc, cfg.get<number>('workflowJpgQuality') ?? 92);
					files.push({ suffix: '-workflow', ext: 'png', data: img.png });
					files.push({ suffix: '-workflow', ext: 'jpg', data: img.jpg });
					files.push({ suffix: '-workflow', ext: 'svg', data: new TextEncoder().encode(workflowSvg(fc)) });
				}

				const folder = (cfg.get<string>('exportFolder') ?? '').trim();
				const dir = folder ? vscode.Uri.file(folder) : vscode.Uri.joinPath(source, '..');
				await vscode.workspace.fs.createDirectory(dir);
				const base = fileName.replace(/\.[^.]+$/, '');

				const targets: vscode.Uri[] = [];
				for (const f of files) {
					let target = vscode.Uri.joinPath(dir, `${base}${f.suffix}.${f.ext}`);
					try {
						await vscode.workspace.fs.writeFile(target, f.data);
					} catch {
						// file lama sedang terbuka/terkunci (mis. di Excel/Word/PowerPoint) -> simpan dengan nama baru
						const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
						target = vscode.Uri.joinPath(dir, `${base}${f.suffix}-${stamp}.${f.ext}`);
						await vscode.workspace.fs.writeFile(target, f.data);
					}
					targets.push(target);
				}

				await vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
				if (cfg.get<boolean>('autoRevealInFileManager', true)) {
					await vscode.commands.executeCommand('revealFileInOS', targets[0]);
				}
				const names = targets.map((t) => path.posix.basename(t.path)).join(', ');
				// Dasbor EasyCast ditawari “Cetak di browser” karena hasil cetak browser 100% sama
				// dengan tampilan (termasuk teks Mandarin), sedangkan PDF dari extension memakai font standar.
				const actions = format === 'easycastPdf'
					? [tr('Buka File', '打开文件'), tr('Cetak di browser', '在浏览器中打印')]
					: [tr('Buka File', '打开文件')];
				vscode.window.showInformationMessage(tr(`Tersimpan: ${names}`, `已保存：${names}`), ...actions).then((a) => {
					if (!a) { return; }
					if (a === actions[1] && format === 'easycastPdf') { void printEasyCast(source); return; }
					// Gambar workflow dibuka langsung di editor VS Code (PNG); format lain dibuka dengan aplikasi bawaan.
					if (format === 'workflow') { void vscode.commands.executeCommand('vscode.open', targets[0]); }
					else { void vscode.env.openExternal(targets[0]); }
				});
				return targets[0];
			} catch (e) {
				console.error('Export gagal:', e);
				vscode.window.showErrorMessage(tr(
					`Gagal membuat ${LABEL[format]}: ${e instanceof Error ? e.message : String(e)}`,
					`生成${LABEL_ZH[format]}失败：${e instanceof Error ? e.message : String(e)}`,
				));
				return undefined;
			}
		}
	);
}

/**
 * Cetak dasbor EasyCast lewat browser bawaan.
 * Webview VS Code tidak punya dialog cetak (window.print() diabaikan), jadi file .html mandiri
 * ditulis ke folder sementara lalu dibuka dengan `#print`: skrip EasyCast mencetaknya sendiri
 * setelah data selesai digambar. Dari dialog cetak browser pengguna bisa memilih “Save as PDF”.
 */
export async function printEasyCast(source: vscode.Uri): Promise<vscode.Uri | undefined> {
	try {
		const { wb, fileName } = await analyzeSource(source);
		const dir = vscode.Uri.file(path.join(os.tmpdir(), 'date-skunder-easycast'));
		await vscode.workspace.fs.createDirectory(dir);
		const base = fileName.replace(/\.[^.]+$/, '');
		const target = vscode.Uri.joinPath(dir, `${base}-easycast.html`);
		const html = buildEasyCastHtml(wb, { seconds: slideSeconds(), lang: uiLang() });
		await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(html));
		await vscode.env.openExternal(vscode.Uri.parse(`${target.toString()}#print`));
		vscode.window.showInformationMessage(tr(
			'Dasbor EasyCast dibuka di browser. Gunakan Ctrl+P → “Save as PDF” untuk menyimpan hasil cetak.',
			'已在浏览器中打开 EasyCast 仪表板。使用 Ctrl+P → “另存为 PDF” 保存打印结果。',
		));
		return target;
	} catch (e) {
		vscode.window.showErrorMessage(tr(
			`Gagal membuka cetak EasyCast: ${e instanceof Error ? e.message : String(e)}`,
			`打开 EasyCast 打印失败：${e instanceof Error ? e.message : String(e)}`,
		));
		return undefined;
	}
}
