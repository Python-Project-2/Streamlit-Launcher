import * as vscode from 'vscode';
import * as path from 'path';
import { analyzeWorkbook } from './analysis';

const VIEW_TYPE = 'dateSkunder.viewer';

class SkunderDocument implements vscode.CustomDocument {
	constructor(public readonly uri: vscode.Uri) { }
	dispose(): void { }
}

class SkunderProvider implements vscode.CustomReadonlyEditorProvider<SkunderDocument> {
	constructor(private readonly ctx: vscode.ExtensionContext) { }

	openCustomDocument(uri: vscode.Uri): SkunderDocument {
		return new SkunderDocument(uri);
	}

	async resolveCustomEditor(doc: SkunderDocument, panel: vscode.WebviewPanel): Promise<void> {
		const media = vscode.Uri.joinPath(this.ctx.extensionUri, 'media');
		panel.webview.options = { enableScripts: true, localResourceRoots: [media] };
		panel.webview.html = this.getHtml(panel.webview, media);

		const fileName = path.basename(doc.uri.fsPath);
		const load = async () => {
			try {
				const bytes = await vscode.workspace.fs.readFile(doc.uri);
				const payload = analyzeWorkbook(bytes, fileName);
				panel.webview.postMessage({ type: 'data', payload });
			} catch (e) {
				panel.webview.postMessage({ type: 'error', message: `Failed to read file: ${String(e)}` });
			}
		};

		panel.webview.onDidReceiveMessage(async (m) => {
			if (m.type === 'ready' || m.type === 'reload') {
				load();
			} else if (m.type === 'openExternalOnlineProject' || m.type === 'openExternalOfflineProject') {
				const uri = vscode.Uri.parse(m.url);
				await vscode.env.openExternal(uri);
			} else if (m.type === 'exportPdfDone') {
				const action = await vscode.window.showInformationMessage(
					`📄 PDF exported: ${m.fileName}`,
					'Open Folder'
				);
				if (action === 'Open Folder') {
					const folderUri = vscode.Uri.file(m.folder);
					await vscode.commands.executeCommand('revealFileInOS', folderUri);
				}
			} else if (m.type === 'savePdf') {
				await handleSavePdf(m, doc.uri);
			}
		});

		// Auto-refresh when file changes on disk
		const watcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(vscode.Uri.joinPath(doc.uri, '..'), fileName)
		);
		watcher.onDidChange(load);
		panel.onDidDispose(() => watcher.dispose());
	}

	private getHtml(webview: vscode.Webview, media: vscode.Uri): string {
		const nonce = Array.from({ length: 32 }, () => Math.random().toString(36)[2]).join('');
		const css = webview.asWebviewUri(vscode.Uri.joinPath(media, 'main.css'));
		const js = webview.asWebviewUri(vscode.Uri.joinPath(media, 'main.js'));
		const builder = webview.asWebviewUri(vscode.Uri.joinPath(media, 'builder.js'));
		const chart = webview.asWebviewUri(vscode.Uri.joinPath(media, 'chart.umd.js'));
		return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource}; img-src ${webview.cspSource} data:;">
<link href="${css}" rel="stylesheet">
<title>Date Skunder</title>
</head>
<body>
<div id="app"><div class="loading">⏳ Reading &amp; analyzing data…</div></div>
<script nonce="${nonce}" src="${chart}"></script>
<script nonce="${nonce}" src="${builder}"></script>
<script nonce="${nonce}" src="${js}"></script>
</body>
</html>`;
	}
}

// ── PDF generation helper ────────────────────────────────────────────────────

async function handleSavePdf(m: any, sourceUri: vscode.Uri): Promise<void> {
	const defaultPath = path.join(path.dirname(sourceUri.fsPath), m.suggestedName || 'report.pdf');
	const saveUri = await vscode.window.showSaveDialog({
		defaultUri: vscode.Uri.file(defaultPath),
		filters: { 'PDF Files': ['pdf'] },
		saveLabel: 'Save PDF'
	});
	if (!saveUri) { return; }

	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const PDFDocument: any = require('pdfkit');
		const chunks: Buffer[] = [];

		await new Promise<void>((resolve, reject) => {
			const doc = new PDFDocument({
				margin: 50,
				size: 'A4',
				bufferPages: true,
				info: {
					Title: `Date Skunder – ${m.stats?.fileName || 'Report'}`,
					Author: 'Date Skunder Extension'
				}
			});
			doc.on('data', (chunk: Buffer) => chunks.push(chunk));
			doc.on('end', resolve);
			doc.on('error', reject);

			const PAGE_W = doc.page.width;
			const MARGIN = 50;
			const CONTENT_W = PAGE_W - MARGIN * 2;
			const stats = m.stats || {};

			// ── Cover ───────────────────────────────────────────────────────
			doc.rect(0, 0, PAGE_W, 160).fill('#1e2a3b');
			doc.fillColor('#ffffff')
				.fontSize(24).font('Helvetica-Bold')
				.text('Date Skunder', MARGIN, 40, { width: CONTENT_W })
				.fontSize(13).font('Helvetica')
				.text('Data Analysis Report', MARGIN, 72, { width: CONTENT_W })
				.fontSize(10)
				.text(`Generated: ${m.generatedAt || new Date().toLocaleString()}`, MARGIN, 110, { width: CONTENT_W });

			doc.rect(0, 160, PAGE_W, 36).fill('#2d3f58');
			doc.fillColor('#a8c4e0').fontSize(10).font('Helvetica')
				.text(`File: ${stats.fileName || '—'}   ·   Sheet: ${stats.sheetName || '—'}`, MARGIN, 170, { width: CONTENT_W });

			doc.fillColor('#222222');
			let y = 220;

			// ── KPI grid ────────────────────────────────────────────────────
			doc.fontSize(14).font('Helvetica-Bold').fillColor('#1e2a3b').text('Summary', MARGIN, y);
			y += 24;

			const kpis: [string, string][] = [
				['Total Rows', Number(stats.totalRows || 0).toLocaleString('en-US')],
				['Columns', String(stats.columns || 0)],
				['Numeric Cols', String(stats.numericCols || 0)],
				['Category Cols', String(stats.categoryCols || 0)],
				['Date Cols', String(stats.dateCols || 0)],
				['Missing Cells', (stats.missingPct || '0') + '%'],
				['Duplicate Rows', Number(stats.duplicates || 0).toLocaleString('en-US')],
			];
			const kpiCols = 4;
			const kpiW = CONTENT_W / kpiCols;
			kpis.forEach(([label, value], i) => {
				const c = i % kpiCols;
				const r = Math.floor(i / kpiCols);
				const kx = MARGIN + c * kpiW;
				const ky = y + r * 56;
				doc.rect(kx + 2, ky, kpiW - 8, 48).fill('#f0f4f9').stroke('#d0daea');
				doc.fillColor('#1e2a3b').fontSize(16).font('Helvetica-Bold')
					.text(value, kx + 6, ky + 6, { width: kpiW - 16, align: 'center' });
				doc.fillColor('#5a6a80').fontSize(8).font('Helvetica')
					.text(label, kx + 6, ky + 30, { width: kpiW - 16, align: 'center' });
			});
			y += Math.ceil(kpis.length / kpiCols) * 56 + 24;

			// ── Insights ────────────────────────────────────────────────────
			const insights: string[] = m.insights || [];
			if (insights.length) {
				if (y > doc.page.height - 140) { doc.addPage(); y = MARGIN; }
				doc.fontSize(14).font('Helvetica-Bold').fillColor('#1e2a3b').text('Automated Insights', MARGIN, y);
				y += 20;
				doc.rect(MARGIN, y, CONTENT_W, Math.min(insights.length, 20) * 16 + 16).fill('#f8fafb');
				y += 8;
				insights.slice(0, 20).forEach((ins) => {
					if (y > doc.page.height - 60) { doc.addPage(); y = MARGIN; }
					doc.fontSize(9).font('Helvetica').fillColor('#333333')
						.text('• ' + ins, MARGIN + 8, y, { width: CONTENT_W - 16 });
					y += 16;
				});
				y += 16;
			}

			// ── Notes ───────────────────────────────────────────────────────
			const notes: any[] = m.notes || [];
			if (notes.length) {
				if (y > doc.page.height - 120) { doc.addPage(); y = MARGIN; }
				doc.fontSize(14).font('Helvetica-Bold').fillColor('#1e2a3b').text('Notes & Observations', MARGIN, y);
				y += 20;
				notes.forEach((note: any) => {
					if (y > doc.page.height - 100) { doc.addPage(); y = MARGIN; }
					doc.rect(MARGIN, y, CONTENT_W, 20).fill('#e8f0fe');
					doc.fillColor('#1a56db').fontSize(10).font('Helvetica-Bold')
						.text(String(note.title || 'Note'), MARGIN + 6, y + 5, { width: CONTENT_W - 130 });
					doc.fillColor('#5a6a80').fontSize(8).font('Helvetica')
						.text(`[${note.category || ''}]  ${note.date || ''}`, MARGIN + CONTENT_W - 124, y + 7, { width: 116, align: 'right' });
					y += 22;
					if (note.text) {
						String(note.text).split('\n').forEach((line: string) => {
							if (y > doc.page.height - 60) { doc.addPage(); y = MARGIN; }
							doc.fillColor('#333333').fontSize(9).font('Helvetica')
								.text(line || ' ', MARGIN + 6, y, { width: CONTENT_W - 12 });
							y += 13;
						});
					}
					y += 10;
				});
				y += 8;
			}

			// ── Column Summary ──────────────────────────────────────────────
			const colSummary: any[] = m.colSummary || [];
			if (colSummary.length) {
				doc.addPage();
				y = MARGIN;
				doc.fontSize(14).font('Helvetica-Bold').fillColor('#1e2a3b').text('Column Summary', MARGIN, y);
				y += 20;
				const colHeaders = ['Column Name', 'Type', 'Missing %', 'Unique'];
				const colWidths = [CONTENT_W * 0.45, CONTENT_W * 0.2, CONTENT_W * 0.17, CONTENT_W * 0.18];
				doc.rect(MARGIN, y, CONTENT_W, 18).fill('#1e2a3b');
				let cx = MARGIN;
				colHeaders.forEach((h, i) => {
					doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
						.text(h, cx + 4, y + 5, { width: colWidths[i] - 4 });
					cx += colWidths[i];
				});
				y += 18;
				colSummary.forEach((col: any, idx: number) => {
					if (y > doc.page.height - 60) { doc.addPage(); y = MARGIN; }
					doc.rect(MARGIN, y, CONTENT_W, 16).fill(idx % 2 === 0 ? '#f7f9fc' : '#ffffff');
					cx = MARGIN;
					[col.name, col.type, col.missing, String(col.unique)].forEach((val: string, i: number) => {
						doc.fillColor('#333333').fontSize(8).font('Helvetica')
							.text(String(val || ''), cx + 4, y + 4, { width: colWidths[i] - 8 });
						cx += colWidths[i];
					});
					y += 16;
				});
			}

			// ── Charts 2-per-row ────────────────────────────────────────────
			const chartImages: any[] = m.chartImages || [];
			if (chartImages.length) {
				doc.addPage();
				y = MARGIN;
				doc.fontSize(14).font('Helvetica-Bold').fillColor('#1e2a3b').text('Charts & Visualizations', MARGIN, y);
				y += 24;
				const imgW = (CONTENT_W - 16) / 2;
				const imgH = Math.round(imgW * 0.62);
				let col = 0;
				chartImages.forEach((ch: any) => {
					if (!ch || !ch.dataUrl) { return; }
					try {
						if (y + imgH + 28 > doc.page.height - MARGIN) {
							doc.addPage(); y = MARGIN; col = 0;
						}
						const imgX = MARGIN + col * (imgW + 16);
						const b64 = ch.dataUrl.replace(/^data:image\/\w+;base64,/, '');
						const imgBuf = Buffer.from(b64, 'base64');
						doc.image(imgBuf, imgX, y, { width: imgW, height: imgH });
						if (ch.title) {
							doc.fillColor('#555555').fontSize(8).font('Helvetica')
								.text(String(ch.title).slice(0, 56), imgX, y + imgH + 2, { width: imgW, align: 'center' });
						}
						col++;
						if (col >= 2) { col = 0; y += imgH + 28; }
					} catch (_) { /* skip */ }
				});
			}

			// ── Footer on every page ────────────────────────────────────────
			const range = doc.bufferedPageRange();
			for (let i = 0; i < range.count; i++) {
				doc.switchToPage(range.start + i);
				doc.rect(0, doc.page.height - 28, PAGE_W, 28).fill('#f0f4f9');
				doc.fillColor('#888888').fontSize(8).font('Helvetica')
					.text(
						`Date Skunder  ·  ${stats.fileName || ''}  ·  Page ${i + 1} of ${range.count}`,
						MARGIN, doc.page.height - 18,
						{ width: CONTENT_W, align: 'center' }
					);
			}

			doc.end();
		});

		const pdfBuf = Buffer.concat(chunks);
		await vscode.workspace.fs.writeFile(saveUri, pdfBuf);

		const action = await vscode.window.showInformationMessage(
			`✅ PDF tersimpan: ${path.basename(saveUri.fsPath)}`,
			'Buka Folder',
			'Buka File'
		);
		if (action === 'Buka Folder') {
			await vscode.commands.executeCommand('revealFileInOS', saveUri);
		} else if (action === 'Buka File') {
			await vscode.env.openExternal(saveUri);
		}

	} catch (err) {
		vscode.window.showErrorMessage(`❌ Gagal menyimpan PDF: ${String(err)}`);
	}
}

// ── Extension lifecycle ──────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.window.registerCustomEditorProvider(VIEW_TYPE, new SkunderProvider(context), {
			webviewOptions: { retainContextWhenHidden: true },
			supportsMultipleEditorsPerDocument: false,
		}),
		vscode.commands.registerCommand('date-skunder.openPreview', async (uri?: vscode.Uri) => {
			uri = uri ?? vscode.window.activeTextEditor?.document.uri;
			if (!uri) {
				vscode.window.showWarningMessage('Please select a CSV or Excel file first.');
				return;
			}
			await vscode.commands.executeCommand('vscode.openWith', uri, VIEW_TYPE);
		})
	);
}

export function deactivate() { }