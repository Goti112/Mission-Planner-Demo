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
