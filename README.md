# Mission Planner Demo

> A simulation-only ground-control case study for planning, flying, inspecting, and replaying a deterministic synthetic mission.

[Launch live demo](https://mission-planner-demo.vercel.app) · [View on GitHub](https://github.com/Goti112/Mission-Planner-Demo) · [Run locally](#run-locally)

Mission Planner brings mission planning, map and 3D inspection, a primary flight display, operational readiness, and recorded telemetry into one browser workflow. This public edition uses synthetic data only; it does not connect to an aircraft.

## Live demo

Open the [public Mission Planner Demo](https://mission-planner-demo.vercel.app) for the guided scenario or free exploration. The hosted build and browser smoke journey use restricted provider credentials that are never stored in this repository.

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

Mission Planner Demo es un caso de estudio de una estación de control terrestre ejecutada íntegramente en el navegador. Permite revisar una misión sintética preparada, validar su ruta, iniciar una simulación, observar telemetría y seguridad, inspeccionar la trayectoria en 3D y reproducir el vuelo grabado.

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

The guided browser journey has passed locally and against the production deployment with real restricted provider credentials.

## Run locally

Requirements:

- Node.js 24
- A public Mapbox token (`pk.…`) — [create one](https://account.mapbox.com/access-tokens/)
- A Cesium ion token — [create one](https://ion.cesium.com/tokens)

```powershell
git clone https://github.com/Goti112/Mission-Planner-Demo.git
Set-Location Mission-Planner-Demo
npm ci
npm run setup
npm run dev
```

`npm run setup` asks for both tokens and writes them to `.env.local` (git-ignored). Run every `npm` command from inside the `Mission-Planner-Demo` folder, then open the local URL printed by Vite.

Prefer to do it by hand? Copy `.env.example` to `.env.local` and fill in `VITE_MAPBOX_TOKEN` and `VITE_CESIUM_ION_TOKEN`. Use client-side tokens restricted to the narrowest origins, and never commit credentials.

## Project scope

This repository is a curated portfolio edition of Mission Planner. It includes the browser mission-planning experience, deterministic simulation, map and 3D visualization, HUD and telemetry surfaces, operational readiness, replay analysis, public quality gates, and original presentation assets.

It intentionally excludes live vehicle connections, hardware control, native desktop packaging, local bridge services, private operational code, deployment credentials, and provider tokens. The demo must not be used to operate an aircraft or make flight-safety decisions.

## Ownership

Copyright © 2026 Goti112. All rights reserved.

The source and assets are available only for portfolio review and technical evaluation; this is not an open-source distribution. See [NOTICE.md](NOTICE.md) for the ownership terms and [asset provenance](docs/asset-provenance.md) for the reproducible origin and permitted portfolio use of the published visual assets.
