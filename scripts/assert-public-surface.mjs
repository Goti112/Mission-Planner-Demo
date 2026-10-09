import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { extname, resolve } from 'node:path';

const root = resolve('.');
const auditScriptPath = resolve('scripts/assert-public-surface.mjs');
const executeFile = promisify(execFile);
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
  'MISSION_LICENSE_',
  'ws://',
  'serialPort',
];
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.md', '.mjs', '.ts', '.tsx', '.yml', '.yaml']);
const removedIdentityPattern = new RegExp(['ro', 'hu'].join(''), 'i');
const expectedCspSources = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-eval'"],
  'connect-src': ["'self'", 'https://api.cesium.com', 'https://assets.cesium.com', 'https://assets.ion.cesium.com', 'https://tile.googleapis.com', 'https://*.mapbox.com'],
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

const collectTrackedFiles = async () => {
  const { stdout } = await executeFile('git', ['ls-files', '-z'], { cwd: root });
  return stdout
    .split('\0')
    .filter((repositoryPath) => repositoryPath.length > 0)
    .map((repositoryPath) => ({
      absolutePath: resolve(root, repositoryPath),
      repositoryPath,
    }));
};

const files = await collectTrackedFiles();
const violations = await collectCspViolations();
for (const { absolutePath, repositoryPath } of files) {
  if (removedIdentityPattern.test(repositoryPath)) {
    violations.push({ repositoryPath, marker: 'removed identity', kind: 'path' });
  }
  for (const fragment of forbiddenPathFragments) {
    if (`/${repositoryPath}`.includes(fragment)) {
      violations.push({ repositoryPath, marker: fragment, kind: 'path' });
    }
  }
  const content = await readFile(absolutePath, 'utf8');
  if (removedIdentityPattern.test(content)) {
    violations.push({ repositoryPath, marker: 'removed identity', kind: 'content' });
  }
  if (absolutePath === auditScriptPath || !textExtensions.has(extname(repositoryPath))) continue;
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
