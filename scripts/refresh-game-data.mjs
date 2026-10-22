import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// One entry point for both extension tabs. Leave publishing to the release workflow.
const root = fileURLToPath(new URL('../', import.meta.url));
const date = new Date().toISOString().slice(0, 10);
const files = ['gold-skill-map.js', 'traditional-name-map.js', 'hint-finder/data/cn.json'];
const previous = await Promise.all(files.map(file => fs.readFile(new URL('../' + file, import.meta.url))));

async function run(args) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...process.execArgv, ...args], {
      cwd: root, stdio: 'inherit', windowsHide: true
    });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${args[0]} exited ${code}`)));
  });
}

try {
  await run(['scripts/build-gold-skill-map.mjs']);
  await run(['scripts/build-traditional-name-map.mjs']);
  await run(['scripts/refresh-hint-catalog.mjs', date, `.tmp/game-data-${date}`]);
  const tests = (await fs.readdir(new URL('../tests/', import.meta.url)))
    .filter(file => /\.test\.(cjs|mjs)$/.test(file)).sort().map(file => `tests/${file}`);
  if (!tests.length) throw new Error('No regression tests found');
  await run(['--test', ...tests]);
  console.log('Both tabs refreshed and regression tests passed. Live authenticated search and store publishing are separate checks.');
} catch (error) {
  await Promise.all(files.map((file, index) => fs.writeFile(new URL('../' + file, import.meta.url), previous[index])));
  throw error;
}
