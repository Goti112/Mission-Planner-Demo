// Guided local setup: creates .env.local with the two client tokens the demo needs.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import process, { stdin, stdout } from 'node:process';

const ENV_FILE = '.env.local';

const TOKENS = [
  {
    key: 'VITE_MAPBOX_TOKEN',
    label: 'Mapbox public token',
    help: 'Create one at https://account.mapbox.com/access-tokens/ (public scopes only, starts with pk.)',
    validate: (value) => (value.startsWith('pk.') ? null : 'Must be a public token starting with pk.'),
  },
  {
    key: 'VITE_CESIUM_ION_TOKEN',
    label: 'Cesium ion token',
    help: 'Create one at https://ion.cesium.com/tokens (default assets:read scope is enough)',
    validate: () => null,
  },
];

const readExisting = () => {
  if (!existsSync(ENV_FILE)) return {};
  return Object.fromEntries(
    readFileSync(ENV_FILE, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
      .filter(Boolean)
      .map(([, key, value]) => [key, value.trim()]),
  );
};

const existing = readExisting();
const values = { ...existing };
const rl = createInterface({ input: stdin, output: stdout });
const lines = rl[Symbol.asyncIterator]();
const ask = async (prompt) => {
  stdout.write(prompt);
  const { value, done } = await lines.next();
  if (done) {
    console.error('\nSetup cancelled: no input received.');
    process.exit(1);
  }
  return value;
};

console.log('\nMission Planner Demo - local setup\n');

for (const token of TOKENS) {
  const current = existing[token.key] ?? '';
  if (current && token.validate(current) === null) {
    console.log(`✔ ${token.label} already set in ${ENV_FILE}`);
    continue;
  }

  console.log(`\n${token.label}\n  ${token.help}`);
  for (;;) {
    const answer = (await ask(`  ${token.key}= `)).trim();
    const error = answer ? token.validate(answer) : 'A value is required.';
    if (error === null) {
      values[token.key] = answer;
      break;
    }
    console.log(`  ✖ ${error}`);
  }
}

rl.close();

writeFileSync(
  ENV_FILE,
  Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n',
);

console.log(`\n✔ ${ENV_FILE} is ready (it is git-ignored). Start the demo with: npm run dev\n`);
