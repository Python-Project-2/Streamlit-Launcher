const fs = require('fs');
const path = require('path');
const esbuild = require("esbuild");

const srcChart = path.join(__dirname, 'node_modules', 'chart.js', 'dist', 'chart.umd.js');
const destChart = path.join(__dirname, 'media', 'chart.umd.js');
if (fs.existsSync(srcChart) && !fs.existsSync(destChart)) {
	try {
		fs.copyFileSync(srcChart, destChart);
	} catch (err) {
		console.warn('Gagal menyalin chart.umd.js ke media:', err);
	}
}

// SQLite (sql.js) memuat WebAssembly dari berkas terpisah: ikutkan ke dist saat build.
const srcWasm = path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
const destDir = path.join(__dirname, 'dist');
const destWasm = path.join(destDir, 'sql-wasm.wasm');
try {
	fs.mkdirSync(destDir, { recursive: true });
	fs.copyFileSync(srcWasm, destWasm);
} catch (err) {
	console.warn('Gagal menyalin sql-wasm.wasm ke dist:', err);
}
// Pratinjau PDF di LocalData memakai pdf.js (berkas statis di media/).
const pdfAssets = [
    ['pdf.min.js', path.join(__dirname, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.min.js')],
    ['pdf.worker.min.js', path.join(__dirname, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.min.js')],
];
for (const [name, source] of pdfAssets) {
    try {
	if (!fs.existsSync(source)) { continue; }
		fs.copyFileSync(source, path.join(__dirname, 'media', name));
    } catch (err) {
		console.warn('Gagal menyalin ' + name + ' ke media:', err);
    }
}
const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

const pdfkitStandalonePlugin = {
	name: 'pdfkit-standalone-alias',
	setup(build) {
		build.onResolve({ filter: /^pdfkit(\/.*)?$/ }, () => {
			return { path: path.join(__dirname, 'node_modules', 'pdfkit', 'js', 'pdfkit.standalone.js') };
		});
	}
};

async function main() {
	const ctx = await esbuild.context({
		entryPoints: [
			'src/extension.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [
			pdfkitStandalonePlugin,
			esbuildProblemMatcherPlugin,
		],
	});
	if (watch) {
		await ctx.watch();
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
