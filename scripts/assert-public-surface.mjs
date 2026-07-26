import { readFile, readdir } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';

const root = resolve('.');
const auditScriptPath = resolve('scripts/assert-public-surface.mjs');
const ignoredDirectories = new Set(['.git', 'dist', 'node_modules', 'playwright-report', 'test-results']);
const forbiddenPathFragments = [
  'src/integrations/',
  'src/modules/connection/',
  '/electron/',
  '/bridge/',
  '/license-service/',
];
const forbiddenContent = [
  'mavlinkBridge',
  'MavlinkTelemetrySource',
  'bridgeHttpUrl',
  'ConnectionSettingsModal',
  'ROHU_LICENSE_',
  'ws://',
  'serialPort',
];
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.md', '.mjs', '.ts', '.tsx', '.yml', '.yaml']);
const expectedCspSources = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-eval'"],
  'connect-src': ["'self'", 'https://api.cesium.com', 'https://assets.cesium.com', 'https://*.mapbox.com'],
};

const parseCspDirectives = (policy) => new Map(policy
  .split(';')
  .map((directive) => directive.trim())
  .filter((directive) => directive.length > 0)
  .map((directive) => {
    const [name, ...sources] = directive.split(/\s+/);
    return [name, sources];
  }));

const collectCspViolations = async () => {
  const indexPath = resolve('index.html');
  const indexContent = await readFile(indexPath, 'utf8');
  const policyMatch = indexContent.match(
    /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i,
  );

  if (policyMatch === null) {
    return [{ repositoryPath: 'index.html', marker: 'Content-Security-Policy', kind: 'missing-csp' }];
  }

  const directives = parseCspDirectives(policyMatch[1]);
  return Object.entries(expectedCspSources).flatMap(([name, expectedSources]) => {
    const actualSources = directives.get(name);
    const matches = actualSources !== undefined
      && actualSources.length === expectedSources.length
      && actualSources.every((source, index) => source === expectedSources[index]);

    return matches
      ? []
      : [{
          repositoryPath: 'index.html',
          marker: `${name}: expected ${expectedSources.join(' ')}`,
          kind: 'csp',
        }];
  });
};

const collectFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries
    .filter((entry) => !ignoredDirectories.has(entry.name))
    .map(async (entry) => {
      const absolutePath = resolve(directory, entry.name);
      return entry.isDirectory() ? collectFiles(absolutePath) : [absolutePath];
    }));
  return nested.flat();
};

const files = await collectFiles(root);
const violations = await collectCspViolations();
for (const absolutePath of files) {
  const repositoryPath = relative(root, absolutePath).replaceAll('\\', '/');
  for (const fragment of forbiddenPathFragments) {
    if (`/${repositoryPath}`.includes(fragment)) {
      violations.push({ repositoryPath, marker: fragment, kind: 'path' });
    }
  }
  if (absolutePath === auditScriptPath || !textExtensions.has(extname(repositoryPath))) continue;
  const content = await readFile(absolutePath, 'utf8');
  for (const marker of forbiddenContent) {
    if (content.includes(marker)) {
      violations.push({ repositoryPath, marker, kind: 'content' });
    }
  }
}
if (violations.length > 0) {
  console.error('Public surface audit failed', { violations });
  process.exitCode = 1;
} else {
  console.info('Public surface audit passed', { scannedFileCount: files.length });
}
