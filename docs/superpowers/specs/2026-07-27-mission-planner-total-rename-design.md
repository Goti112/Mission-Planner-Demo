# Mission Planner Demo total rename

## Objective

Remove every case-insensitive occurrence of the previous product name from the public portfolio repository and all user-facing publication surfaces. The replacement identity is **Mission Planner Demo**, with the machine-readable form `mission-planner-demo`.

## Scope

The rename covers:

- visible product copy, browser title, guide text, README, architecture and provenance;
- the generated SVG wordmark and its source generator;
- package metadata and lockfile metadata;
- CSS custom properties, comments and internal identifiers;
- public asset names that contain the old identity;
- GitHub repository name, clone URLs, metadata and pinned profile entry;
- Vercel project, stable deployment URL and GitHub homepage link;
- local repository remote configuration.

The local folder may retain its current filesystem name because it is not published, but its tracked contents and Git metadata must not contain the removed term.

## Naming rules

- Product: `Mission Planner Demo`
- Short interface label when space is constrained: `Mission Planner`
- Package and Vercel slug: `mission-planner-demo`
- GitHub repository: `Mission-Planner-Demo`
- CSS namespace: `--mission-*`
- Generated media stem: `mission-planner-demo`

No compatibility aliases containing the removed term will be retained.

## Publication flow

First rename and validate the tracked repository. Then rename the existing GitHub repository so stars, history and settings remain attached. Update `origin`, repository metadata, pinned profile entry and README links. Create or rename the Vercel project to the approved slug, deploy the verified source and update the stable production URL.

## Safety and error handling

Provider tokens remain local or in the already authorized Vercel build environment. No token is committed. External renames are verified immediately through their resulting URLs. Any failed external rename stops publication until the exact remote state is known.

## Verification

Completion requires:

