# RohuPlanner Demo

> A simulation-only ground-control case study for planning, flying, inspecting, and replaying a deterministic synthetic mission.

[Launch live demo](#live-demo) · [Run locally](#run-locally)

RohuPlanner brings mission planning, map and 3D inspection, a primary flight display, operational readiness, and recorded telemetry into one browser workflow. This public edition uses synthetic data only; it does not connect to an aircraft.

## Live demo

A public deployment is intentionally not linked yet. Release requires a successful provider-backed browser smoke run and fresh production media using new domain-restricted Mapbox and Cesium ion tokens. Those tokens are not stored in this repository.

Until that release gate passes, the complete demo can be reviewed locally using the setup below. The final [media capture manifest](docs/assets/README.md) records the approved screenshots, animation path, limits, and capture sequence without substituting fabricated media.

## What you can explore

- Review the prepared **Synthetic Range Alpha** mission: home position, six mission items, altitude profile, route metrics, and execution readiness.
- Plan on an interactive 2D map, edit mission geometry, and inspect the route against home and vehicle reference frames.
- Run the mission through a MAVLink-shaped synthetic telemetry source and watch aircraft state, mission progress, battery, GPS, and flight data update together.
- Switch to the Cesium 3D view to inspect the aircraft, route, and altitude trajectory.
- Open the primary flight display and operational panels to examine flight state and safety signals.
- Replay the recorded mission with trajectory, events, telemetry plots, and analysis controls.
- Select **Restart tour** at any point to restore the prepared mission, runtime and replay baseline, primary PLAN view, and guided-tour state.

## Two-minute guided scenario

1. Select **Review mission** in the welcome dialog.
2. Inspect the selected mission, its six items, route metrics, and readiness information.
3. Use the highlighted **Start simulated mission** control and observe the live synthetic flight.
4. Select **Continue to 3D inspection**, then use the highlighted **Switch to 3D** control.
5. Inspect the aircraft and trajectory, then use the highlighted **Open replay** control.
6. Review the recorded route and telemetry. Select **Restart tour** to restore the prepared mission, runtime and replay baseline, primary PLAN view, and guided-tour state.

No hardware, autopilot, local bridge, or live vehicle data is involved.

## Resumen en español

RohuPlanner Demo es un caso de estudio de una estación de control terrestre ejecutada íntegramente en el navegador. Permite revisar una misión sintética preparada, validar su ruta, iniciar una simulación, observar telemetría y seguridad, inspeccionar la trayectoria en 3D y reproducir el vuelo grabado.

La edición pública utiliza exclusivamente datos sintéticos y no se conecta a aeronaves. **Restart tour** restaura la misión preparada y el estado base de ejecución, reproducción, vista principal y recorrido guiado. Para ejecutarla en local se necesitan Node.js 24 y tokens de cliente restringidos de Mapbox y Cesium ion.

## How it is engineered

- **Simulation-only composition:** `src/demo/` owns environment validation, the prepared scenario, guided-tour state, startup composition, and the prepared reset baseline.
- **Typed telemetry path:** `SimulationTelemetrySource` emits MAVLink-shaped raw packets; `TelemetryManager` normalizes them before typed state reaches the application stores and UI.
- **Separated mission model:** mission types, commands, factories, selectors, metrics, vehicle profiles, and validation live in the domain layer; planning interaction and runtime execution remain separate.
- **One visible state:** mission, telemetry, drone, replay, layout, and operational surfaces consume shared Zustand stores rather than parallel demo-only UI state.
- **Explicit failures:** missing provider configuration and reset failures surface actionable errors instead of silently falling back.

## Architecture

```text
Synthetic scenario
        ↓
SimulationTelemetrySource
        ↓
TelemetryManager → transforms → Zustand stores
        ↓
Mission · Map · HUD · Replay · Operational UI
```

See [Architecture](docs/architecture.md) for the composition boundary, telemetry flow, mission-domain separation, and reset lifecycle.

## Quality

The public repository currently tracks **367 TypeScript/JavaScript source files** and **83 test files**, measured from tracked files after the private-product exclusions.

`npm run validate` runs the public-surface audit, ESLint, the Vitest behavior suite, and a production build. A separate Playwright smoke journey covers plan → simulate → 3D → replay and deliberately refuses to start without both restricted provider tokens.

The browser smoke run with real restricted provider credentials and the resulting portfolio media remain release gates; neither is represented as complete here.

## Run locally

Requirements:

- Node.js 24
- A domain-restricted Mapbox client token
- A domain-restricted Cesium ion client token

```powershell
git clone <your-public-repository-url>
Set-Location RohuPlanner
npm ci
Copy-Item .env.example .env.local
```

Add both client tokens to `.env.local`:

```dotenv
VITE_MAPBOX_TOKEN=your_restricted_mapbox_token
VITE_CESIUM_ION_TOKEN=your_restricted_cesium_ion_token
```

Then start the demo:

```powershell
npm run dev
```

Open the local URL printed by Vite. Keep `.env.local` untracked, use client-side tokens with the narrowest permitted origins, and never commit credentials.

## Project scope

This repository is a curated portfolio edition of RohuPlanner. It includes the browser mission-planning experience, deterministic simulation, map and 3D visualization, HUD and telemetry surfaces, operational readiness, replay analysis, public quality gates, and original presentation assets.

It intentionally excludes live vehicle connections, hardware control, native desktop packaging, local bridge services, private operational code, deployment credentials, and provider tokens. The demo must not be used to operate an aircraft or make flight-safety decisions.

## Ownership

Copyright © 2026 Goti112. All rights reserved.

The source and assets are available only for portfolio review and technical evaluation; this is not an open-source distribution. See [NOTICE.md](NOTICE.md) for the ownership terms and [asset provenance](docs/asset-provenance.md) for the reproducible origin and permitted portfolio use of the published visual assets.
