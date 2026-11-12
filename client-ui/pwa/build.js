import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const shell = [
  'index.html', 'favicon.png', 'manifest.webmanifest',
  'icons/chess-trace-192.png', 'icons/chess-trace-512.png',
  'icons/chess-trace-maskable-512.png',
];
const engine = ['stockfish/stockfish-worker.js', 'stockfish/stockfish.js', 'stockfish/stockfish.wasm'];

export function chessTracePwa() {
  return {
    name: 'chesstrace-pwa',
    apply: 'build',
    async writeBundle(options) {
      const output = resolve(options.dir);
      const assets = (await readdir(resolve(output, 'assets'), { recursive: true, withFileTypes: true }))
        .filter(entry => entry.isFile())
        .map(entry => resolve(entry.parentPath, entry.name).slice(output.length + 1));
      const paths = [...shell, ...assets].sort();
      const worker = await readFile(new URL('./service-worker.js', import.meta.url), 'utf8');
      const hash = createHash('sha256').update(worker);
      const engineHash = createHash('sha256');
      for (const path of engine) engineHash.update(path).update(await readFile(resolve(output, path)));
      const engineVersion = engineHash.digest('hex').slice(0, 16);
      hash.update(engineVersion);
      for (const path of paths) hash.update(path).update(await readFile(resolve(output, path)));
      const config = JSON.stringify({
        version: hash.digest('hex').slice(0, 16),
        engineVersion,
        shell: paths.map(path => '/' + path),
        engine: engine.map(path => '/' + path),
      });
      await writeFile(resolve(output, 'sw.js'), 'const config = ' + config + ';\n' + worker);
    },
  };
}
