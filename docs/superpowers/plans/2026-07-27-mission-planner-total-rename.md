# Mission Planner Demo Total Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the previous product identity everywhere in the tracked portfolio, GitHub publication and Vercel deployment with Mission Planner Demo.

**Architecture:** Treat naming as a cross-cutting contract protected by the public-surface audit. Perform deterministic textual namespace migration first, regenerate owned assets from their renamed source, then rename external publication surfaces and verify their final URLs.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Playwright, GitHub Actions, GitHub, Vercel

## Global Constraints

- Product name: `Mission Planner Demo`.
- Short constrained label: `Mission Planner`.
- Package and Vercel slug: `mission-planner-demo`.
- GitHub repository: `Mission-Planner-Demo`.
- CSS namespace: `--mission-*`.
- Generated media stem: `mission-planner-demo`.
- Do not retain compatibility aliases containing the previous identity.
- Do not expose or commit provider tokens.
- Historical commit messages remain unchanged.

---

### Task 1: Make the public audit enforce the removed identity

**Files:**
- Modify: `scripts/assert-public-surface.mjs`

**Interfaces:**
- Consumes: the existing tracked-file scan in `scripts/assert-public-surface.mjs`.
- Produces: a case-insensitive forbidden-pattern rule covering tracked file contents and paths.

- [ ] **Step 1: Add a forbidden identity pattern**

Build the removed fragment without writing it contiguously in the source:

```js
const removedIdentityPattern = new RegExp(['ro', 'hu'].join(''), 'i');
```

Raise an explicit audit error containing the offending tracked path when either the path or content matches.

- [ ] **Step 2: Verify the audit fails before migration**

Run: `npm run audit:surface`

Expected: FAIL listing current files that still contain the removed identity.

- [ ] **Step 3: Commit the guard with the rename work**

Do not commit a deliberately failing intermediate state. Stage this file together with Task 2.

### Task 2: Rename tracked source and internal namespaces

**Files:**
- Modify: all tracked text files returned by the audit failure
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `index.html`
- Modify: `src/index.css`
- Modify: CSS and TypeScript consumers of the old CSS namespace
- Modify: `src/demo/guide/demoGuideContent.ts`

**Interfaces:**
- Consumes: the naming rules in Global Constraints.
- Produces: `mission-planner-demo` package metadata, `Mission Planner Demo` interface copy and `--mission-*` CSS variables.

- [ ] **Step 1: Perform deterministic case-preserving replacements**

Apply these exact mappings to tracked UTF-8 text files only. The removed source values are assembled to keep this plan compliant with the final scan:

```powershell
$renamePairs = @(
  @(('Ro' + 'huPlanner-Demo'), 'Mission-Planner-Demo'),
  @(('ro' + 'huplanner-demo'), 'mission-planner-demo'),
  @(('Ro' + 'huPlanner'), 'Mission Planner'),
  @(('RO' + 'HU'), 'MISSION'),
  @(('ro' + 'hu'), 'mission')
)
```

Apply the pairs in the listed longest-first order so URLs, display names and slugs cannot become partially transformed.

- [ ] **Step 2: Rename tracked paths**

Rename any tracked filename containing the removed identity to the `mission-planner-demo` stem using `git mv`.

- [ ] **Step 3: Verify the guard passes**

Run: `npm run audit:surface`

Expected: PASS with no matching tracked path or content.

- [ ] **Step 4: Run focused behavior checks**

Run: `npm run lint`

Run: `npm run test`

Expected: 82 files and 389 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "Rename product to Mission Planner"
```

### Task 3: Regenerate and verify owned presentation assets

**Files:**
- Modify: `scripts/generate-original-assets.ts`
- Regenerate: `public/Logo.svg`
- Regenerate: `public/assets/drone.glb`
- Modify: `docs/asset-provenance.md`
- Modify: `docs/assets/README.md`

**Interfaces:**
- Consumes: `Mission Planner Demo` naming and the existing deterministic asset generator.
- Produces: a Mission Planner wordmark and provenance metadata containing no previous identity.

- [ ] **Step 1: Run the owned asset generator**

Run: `npx tsx scripts/generate-original-assets.ts`

Expected: `public/Logo.svg` visibly contains `Mission Planner` and generated metadata uses the new product identity.

- [ ] **Step 2: Verify asset and documentation text**

Run the public-surface audit and inspect the SVG title, description, metadata and wordmark.

- [ ] **Step 3: Commit**

Stage the regenerated assets and their provenance updates with the rename commit. If the rename work has already been committed, use a second scoped commit for the remaining generated-asset cleanup.

### Task 4: Validate the complete local portfolio

**Files:**
- Verify: all tracked source and documentation
- Verify: `tests/demo-smoke.spec.ts`
- Read only: ignored `.env.local`

**Interfaces:**
- Consumes: the fully renamed source tree and locally configured public Mapbox and Cesium client values.
- Produces: a successful public-surface audit, lint run, test suite, production build and guided local browser journey.

- [ ] **Step 1: Run the complete validation command**

Load the two required provider values into the current process without printing them, then run:

```powershell
npm run validate
```

Expected:

- public-surface audit passes;
- ESLint passes;
- all Vitest files and tests pass;
- TypeScript and the Vite production build pass.

- [ ] **Step 2: Run the guided browser journey locally**

With the same process-only provider loading, run:

```powershell
npm run test:e2e
```

Expected: Playwright completes the guided plan, simulation, 3D inspection and replay path with no browser errors.

- [ ] **Step 3: Preserve redacted validation evidence**

Record only command names, provider-variable names, pass summaries and exit codes. Do not record provider values or authentication credentials.

### Task 5: Rename and publish GitHub and Vercel surfaces

**External systems:**
- Rename: existing GitHub repository to `Goti112/Mission-Planner-Demo`
- Update: GitHub homepage, README links, topic and pinned repository
- Rename or replace: Vercel project with `mission-planner-demo`
- Deploy: stable production URL `https://mission-planner-demo.vercel.app`
- Update: local `origin`

**Interfaces:**
- Consumes: the validated rename commits and the user-authorized public browser-provider values.
- Produces: a public GitHub repository and production Vercel deployment using only the new identity.

- [ ] **Step 1: Publish the verified commits**

Push the rename branch, rename the existing public GitHub repository, update the local remote, and integrate the verified commit into the default `main` branch.

Expected:

- repository remains public;
- default branch remains `main`;
- `origin` targets `https://github.com/Goti112/Mission-Planner-Demo.git`;
- remote branch and `main` resolve to the verified release commit.

- [ ] **Step 2: Update GitHub presentation metadata**

Set the homepage to `https://mission-planner-demo.vercel.app`, retain the portfolio topic, verify the repository remains pinned, and confirm the public `main` README uses the current repository and demo links.

- [ ] **Step 3: Publish the Vercel project**

Create or rename the project to `mission-planner-demo`, configure the approved Mapbox and Cesium client variables as encrypted Preview and Production values, deploy the verified source, and assign:

```text
https://mission-planner-demo.vercel.app
```

Ensure the portfolio deployment is publicly accessible and remove superseded aliases or deployments that expose the removed identity.

- [ ] **Step 4: Verify production behavior**

Run the guided Playwright journey against the stable production URL using process-only provider loading.

Expected: one complete guided simulation journey passes without browser errors.

- [ ] **Step 5: Preserve redacted publication evidence**

Record repository visibility, default-branch SHA, homepage, README checks, pinned state, project identity, public protection state, encrypted variable names, aliases, deployment state and the production Playwright result. Never record provider values or access credentials.

### Task 6: Perform final release verification

**Surfaces:**
- Verify: tracked paths and tracked file content
- Verify: Git remote and current configuration
- Verify: GitHub repository metadata, `main`, README, topics and Actions
- Verify: Vercel project metadata, aliases, encrypted variable names and deployment state
- Verify: production HTML, JavaScript and CSS

**Interfaces:**
- Consumes: the published GitHub and Vercel release.
- Produces: immutable redacted evidence proving that current public surfaces contain no case-insensitive occurrence of the removed identity.

- [ ] **Step 1: Re-run the local release gate**

Run:

```powershell
npm run validate
```

Expected: audit, lint, tests and production build all pass from the exact published commit.

- [ ] **Step 2: Scan every current public surface**

Confirm zero case-insensitive matches in:

- tracked paths and tracked file content;
- current Git remote and publication configuration;
- GitHub repository name, description, homepage, topics and `main` README;
- Vercel project, active deployment and aliases;
- production HTML and all referenced JavaScript and CSS assets.

The local parent folder and historical commit messages are explicit exclusions because neither is a current tracked or published surface.

- [ ] **Step 3: Re-run production Playwright**

Run `npm run test:e2e` with `PLAYWRIGHT_BASE_URL` set to `https://mission-planner-demo.vercel.app`. Load provider values only into the test process and clear them when the command exits.

Expected: the guided production journey passes.

- [ ] **Step 4: Verify CI and synchronization**

Confirm:

- the latest GitHub Actions run for final `main` completed successfully;
- `HEAD`, the published feature branch and `origin/main` resolve to the same commit;
- the tracked worktree is clean.

- [ ] **Step 5: Capture immutable redacted evidence**

Write a final evidence record containing the release commit and tree hashes, exact pass counts, zero-match counts, current publication identifiers, CI result and Git synchronization state. Calculate its SHA-256 hash and ensure it contains no provider value, access credential or authentication token.
