// Measures the gzipped size of the core SDK bundle (NFR: < 25 KB, no 3D assets).
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const LIMIT_KB = 25;

async function measure(entry, external = []) {
  const result = await build({
    entryPoints: [entry],
    absWorkingDir: root,
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
    external,
    loader: { '.css': 'empty' },
  });
  const code = result.outputFiles[0].contents;
  return { raw: code.length / 1024, gz: gzipSync(code, { level: 9 }).length / 1024 };
}

const core = await measure('src/index.ts');
const react = await measure('src/react/index.ts', ['react', 'react/jsx-runtime']);

const fmt = ({ raw, gz }) => `${raw.toFixed(1)} KB min / ${gz.toFixed(1)} KB gzip`;
console.log(`tetherkit-core          ${fmt(core)}  (limit ${LIMIT_KB} KB gzip)`);
console.log(`tetherkit-core/react    ${fmt(react)}  (includes core + QR encoder, React external)`);

if (core.gz > LIMIT_KB) {
  console.error(`Core bundle exceeds ${LIMIT_KB} KB gzip.`);
  process.exit(1);
}
