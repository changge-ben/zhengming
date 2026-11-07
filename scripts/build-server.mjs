import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function buildServer(output) {
  await mkdir(path.dirname(output), { recursive: true });
  return build({
    entryPoints: ['server/index.ts'],
    outfile: output,
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    legalComments: 'linked',
    metafile: true,
    logLevel: 'warning',
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await buildServer(path.resolve(process.argv[2] || '.local/server-build/server.mjs'));
}
