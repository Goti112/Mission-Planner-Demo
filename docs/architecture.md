# Mission Planner Demo Architecture

Mission Planner Demo composes the public mission-planning product around a synthetic telemetry boundary. The same mission, telemetry, stores, transforms, and UI surfaces used throughout the public code path participate in the guided scenario; there is no parallel mock interface.

```text
Synthetic scenario
        ↓
SimulationTelemetrySource
        ↓
TelemetryManager → transforms → Zustand stores
        ↓
Mission · Map · HUD · Replay · Operational UI
```

## Demo composition boundary

`src/demo/` is the public demo composition layer. Its responsibilities are deliberately narrow:

- `config/` validates the two public provider settings before the application renders.
- `scenario/demoMission.ts` creates the fixed **Synthetic Range Alpha** mission with a home position and six typed mission items.
- `scenario/resetDemoScenario.ts` restores the prepared mission, demo aircraft, UI mode, replay state, recordings, progress, and flight events.
- `guide/` owns the five-step tour state machine and presentation content.
- `components/` presents the simulation banner, environment failure boundary, and guided interactions.
- `useInitializeDemo.ts` performs the one-time scenario initialization at the application boundary.

The demo layer composes existing modules; it does not redefine their domain models. The browser application remains explicit about its simulation-only status and refuses to render the operational surface when required client configuration is absent.

## Typed telemetry pipeline

`SimulationTelemetrySource` implements the telemetry-source contract and emits typed `TelemetryRawData` packets. Values use MAVLink-style raw units, so the downstream path still exercises normalization rather than bypassing it with display-ready values.

During mission execution, `DroneMissionController` pushes a typed mission override into the simulation source. The source emits the resulting aircraft state through the same raw packet boundary:

```text
Mission runtime
  → mission override
  → SimulationTelemetrySource
  → raw MAVLink-shaped telemetry
  → TelemetryManager
  → normalized telemetry and derived state
  → Zustand stores
```

`TelemetryManager` owns source lifecycle, packet handling, normalization, readiness, and status propagation. The drone, mission, replay, layout, and operational stores then expose one coherent state to React. The map, 3D scene, HUD, telemetry panels, readiness indicators, and recorder therefore observe the same simulated flight instead of independently generated values.

## Mission-domain separation

The mission module separates durable mission meaning from planning interaction and runtime execution:

- `src/modules/mission/domain/` defines mission types, command metadata, item factories, selectors, metrics, validation, and vehicle profiles.
- `src/modules/mission/planner/` adapts those domain values to the planning workbench, JSON import/export, map placement, advanced layers, and planner stores.
- `src/modules/mission/core/` executes accepted plans through navigation, progress, flight dynamics, and simulation integration.
- `src/modules/mission/services/` and `store/` record events, metrics, and state consumed by replay and operational surfaces.

This boundary lets readiness checks reject an invalid plan before runtime execution while keeping visual editing concerns out of the domain model.

## Prepared reset baseline

`resetDemoScenario()` restores the prepared mission, runtime, and replay baseline used by the tour. It returns the active mission controller to idle; clears recorder, replay import, replay trajectory, mission-progress, and flight-event state; recreates the prepared mission and aircraft; restores the PLAN view with 3D disabled; and synchronizes runtime entities with that scoped state.

The **Restart tour** handler then calls the guide store's `restart()` action to return the tour to its welcome state. These reset steps are sequential and limited to the listed state. The prepared mission uses a fixed `updatedAtIso` value, so the reset restores the same route, selection, primary UI mode, replay baseline, and idle runtime baseline. A scenario-reset failure is wrapped in `DemoScenarioResetError` with the original cause rather than being ignored.

## Provider boundary

Mapbox supplies the 2D basemap and Cesium ion supports the 3D scene. `src/demo/config/demoEnvironment.ts` requires both client values and rejects blank configuration with an actionable message. Provider credentials are deployment inputs, not repository data; `.env.local` remains ignored and `.env.example` contains names only.

The simulation, mission, telemetry, replay, and reset paths do not depend on live vehicle infrastructure. No bridge, autopilot connection, or hardware command path is part of this public edition.
