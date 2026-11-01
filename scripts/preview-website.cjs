/**
 * Menyalakan hanya server token (tanpa VS Code) untuk melihat website `api/token.html`:
 *
 *   npm run preview:website          → http://127.0.0.1:47832/token.html
 *   $env:PORT=5000; npm run preview:website
 *
 * Token yang dibuat di sini disimpan di .tmp-check/preview-tokens.json supaya sisa
 * percobaannya tetap sama saat halaman dimuat ulang.
 */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const tmp = path.join(root, '.tmp-check');

async function loadLib() {
    fs.mkdirSync(tmp, { recursive: true });
    const outfile = path.join(tmp, `preview-${process.pid}.cjs`);
    await esbuild.build({
        stdin: {
            contents: [
                "export { TokenServer, DEFAULT_TOKEN_PORT } from './src/tokenServer';",
                "export { MsiTokens } from './src/msiToken';",
            ].join('\n'),
            resolveDir: root,
            loader: 'ts',
        },
        bundle: true,
        format: 'cjs',
        platform: 'node',
        outfile,
        logLevel: 'warning',
    });
    const lib = require(outfile);
    fs.rmSync(outfile, { force: true });
    return lib;
}

(async () => {
    const lib = await loadLib();
    const storeFile = path.join(tmp, 'preview-tokens.json');
    let data = {};
    try { data = JSON.parse(fs.readFileSync(storeFile, 'utf8')); } catch { data = {}; }

    const store = {
        get: (key, fallback) => (key in data ? data[key] : fallback),
        update: (key, value) => {
            if (value === undefined) { delete data[key]; } else { data[key] = value; }
            fs.mkdirSync(path.dirname(storeFile), { recursive: true });
            fs.writeFileSync(storeFile, JSON.stringify(data, null, 1), 'utf8');
        },
    };

    const tokens = new lib.MsiTokens(store, () => ({ attempts: 5, minutes: 1440, cooldownHours: 5 }));
    const server = new lib.TokenServer({
        apiRoot: path.join(root, 'api'),
        tokens,
        product: 'Date Skunder',
        version: require(path.join(root, 'package.json')).version,
        log: (line) => console.log(`  ${line}`),
    });

    const port = Number(process.env.PORT) || lib.DEFAULT_TOKEN_PORT;
    const actual = await server.start(port);
    console.log(`\n  Website token siap: http://127.0.0.1:${actual}/token.html`);
    console.log('  Tekan Ctrl+C untuk berhenti.\n');

    const shutdown = async () => {
        await server.stop();
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
})().catch((e) => {
    console.error('Gagal menyalakan pratinjau website:', e);
    process.exit(1);
});
