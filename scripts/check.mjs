import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : /\.(mjs|js|ts)$/.test(path) ? [path] : [];
  });
}
const sources = ['apps', 'server', 'domain', 'scripts', 'shared', 'cloud', 'services'].flatMap(files);
for (const file of sources) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(file, result.stderr);
    process.exit(1);
  }
}
console.log(`Syntax checked: ${sources.length} JavaScript modules.`);
