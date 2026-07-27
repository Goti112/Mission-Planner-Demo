# Production Media Capture Manifest

The four final portfolio media files are release-gated. They must be captured from a verified production build using newly issued, domain-restricted Mapbox and Cesium ion tokens. No provider-backed run was available during Task 8, so this repository does not substitute staged, fabricated, or credential-free images.

## Required output paths

| File | Required content | Limit | Current status |
| --- | --- | --- | --- |
| `docs/assets/mission-planning.webp` | Selected Synthetic Range Alpha mission with route, mission items, metrics, and readiness or validation visible | 1600×900 source; below 500 KB | Awaiting restricted-token capture |
| `docs/assets/flight-3d.webp` | Simulated aircraft, route, and altitude trajectory in the Cesium 3D view | 1600×900 source; below 500 KB | Awaiting restricted-token capture |
| `docs/assets/telemetry-safety.webp` | Primary flight display, live telemetry, and operational readiness or safety signals | 1600×900 source; below 500 KB | Awaiting restricted-token capture |
| `docs/assets/mission-planner-demo.webp` | 20–30 second plan → simulate → 3D → replay animation | 1600×900 source; below 8 MB | Awaiting restricted-token capture |

Do not add these paths to the README as image embeds until every file exists, the real-provider browser smoke test passes, and the checks below are complete.

## Capture environment

1. Supply both newly issued restricted values only to the current PowerShell process:

   ```powershell
   $env:VITE_MAPBOX_TOKEN = '<restricted Mapbox token>'
   $env:VITE_CESIUM_ION_TOKEN = '<restricted Cesium ion token>'
   ```

2. Run the quality gate and the real browser journey:

   ```powershell
   npm run validate
   npm run test:e2e
   ```

3. Build and serve the production output:

   ```powershell
   npm run build
   npm run preview -- --host 127.0.0.1 --port 4173
   ```

4. Use a 1600×900 browser viewport at 100% zoom. Capture only the application content: exclude browser chrome, developer tools, desktop notifications, token values, terminal windows, and personal data.

## Capture sequence

### Mission planning

Select **Review mission**. Keep **Synthetic Range Alpha** selected and frame the home point, six route items, mission metrics, and readiness or validation surface together. Ensure labels are legible and no guide dialog obscures the evidence.

### Telemetry and safety

Start the highlighted simulated mission. Wait until the aircraft is in flight and telemetry is stable, then frame the primary flight display with telemetry and readiness or safety information visible. Keep the **SIMULATION DEMO · Synthetic data only** status visible.

### Flight in 3D

Select **Continue to 3D inspection**, then **Switch to 3D**. Wait for the Cesium scene, aircraft model, route, and recorded altitude trajectory to render. Choose a camera angle that separates the route from the terrain and keeps the aircraft recognizable.

### Guided animation

Restart the tour immediately before recording. In one 20–30 second sequence, show:

1. the selected mission plan;
2. the simulation starting and telemetry changing;
3. the switch to the 3D trajectory;
4. the replay surface opening with recorded data.

Use direct cuts or short transitions only. Do not accelerate the interface so much that labels become unreadable.

## Acceptance checks

- The source viewport is exactly 1600×900 and browser chrome is absent.
- Static files are WebP images below 500 KB each.
- The animated WebP is 20–30 seconds and below 8 MB.
- Map and terrain tiles are fully loaded; no attribution, watermark, or provider notice is cropped or removed.
- The synthetic-data banner is visible where practical and no screen implies a live aircraft connection.
- No credential, `.env.local` content, console, account name, or private repository path appears.
- The asset-provenance originals are present in the UI where applicable.
- `npm run test:e2e` and `npm run validate` pass with the same restricted provider configuration used for capture.
