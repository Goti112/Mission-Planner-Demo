# Flight HUD — Arquitectura del Sistema de Instrumentos

**Versión:** 1.0  
**Contexto:** Ground Control Station · RohuPlanner  
**Estado:** Diseño — Pre-implementación

---

## 1. Visión General

El HUD es el panel de instrumentos aeronáuticos del GCS. Su misión es presentar el estado completo del vehículo en tiempo real con la menor latencia perceptible posible, leyendo desde el modelo normalizado `FlightTelemetry` y sin ningún acoplamiento con el protocolo de transporte (MAVLink, SITL, etc.).

### Principios de diseño no negociables

| Principio | Justificación |
|---|---|
| **Decoupled from transport** | El HUD no sabe si los datos vienen de MAVLink o simulación |
| **Decoupled from Cesium** | El HUD puede funcionar sin mapa/globo activo |
| **Immutable props** | Los instrumentos no mutan estado; solo renderizan |
| **Single source of truth** | `FlightTelemetry` es el único modelo que alimenta el HUD |
| **Smooth at 60fps** | El suavizado ocurre fuera del render, antes de pasar props |
| **Canvas para instrumentos dinámicos** | Solo lo que necesita redibujarse cada frame usa canvas |
| **CSS para estado e indicadores** | Lo que cambia esporádicamente se maneja con CSS/HTML |

---

## 2. Flujo de Datos Completo

```
┌─────────────────────────────────────────────────────────────────┐
│                         FUENTES DE DATOS                        │
│                                                                 │
│   MAVLink Serial/UDP          SITL / Simulación interna         │
│   (ArduPilot / PX4)           (datos sintéticos)                │
└──────────────┬──────────────────────────┬───────────────────────┘
               │                          │
               ▼                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    TelemetryRawData (snapshot)                  │
│  MAVAttitude · MAVVFRHUD · MAVGPSRaw · MAVHeartbeat · ...       │
│  (campo por campo, asíncrono, sin normalizar)                   │
└──────────────────────────────┬──────────────────────────────────┘
                               │  normalización (parser)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                       FlightTelemetry                           │
│  AttitudeTelemetry · VelocityTelemetry · AltitudeTelemetry      │
│  NavigationTelemetry · BatteryTelemetry · EKFTelemetry · ...    │
│  (grados, m/s, metros — unidades UI, valores no-NaN)            │
└──────────────────────────────┬──────────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
┌──────────────────────┐         ┌──────────────────────────────┐
│ SmoothingEngine      │         │ FlightDerivedData calculator  │
│ (EMA filters)        │         │ (Haversine, bearing, ETA)     │
│ Corre en rAF loop    │         │ Corre fora del render         │
└──────────┬───────────┘         └──────────────┬───────────────┘
           │                                    │
           └───────────────┬────────────────────┘
                           ▼
              ┌────────────────────────┐
              │      FlightHUD.tsx     │
              │  (React shell, rAF)    │
              └────────┬───────────────┘
                       │  props inmutables
         ┌─────────────┼──────────────────────────┐
         ▼             ▼                          ▼
  ArtificialHorizon  AltitudeTape         HeadingTape
  SpeedTape          VerticalSpeed        WaypointDirector
  FlightModeIndicator  BatteryIndicator   GPSStatus · ArmStatus
```

---

## 3. Estructura de Carpetas

```
src/components/HUD/
│
├── FlightHUD.tsx                  ← Shell principal del HUD, gestiona el rAF
│
├── instruments/                   ← Un archivo por instrumento
│   ├── ArtificialHorizon.ts       ← Canvas 2D. El más crítico. rAF.
│   ├── AltitudeTape.ts            ← Canvas 2D. rAF.
│   ├── SpeedTape.ts               ← Canvas 2D. rAF.
│   ├── HeadingTape.ts             ← Canvas 2D. rAF.
│   ├── VerticalSpeedIndicator.ts  ← Canvas 2D. rAF.
│   ├── WaypointDirector.ts        ← Canvas 2D (aguja + distancia). rAF.
│   ├── FlightModeIndicator.tsx    ← HTML/CSS. Solo cambia en modo change.
│   ├── ArmStatusIndicator.tsx     ← HTML/CSS. Solo 2 estados.
│   ├── GPSStatusIndicator.tsx     ← HTML/CSS. Indicador discreto.
│   └── BatteryIndicator.tsx       ← HTML/CSS. Solo cambia en threshold.
│
├── hooks/
│   ├── useHUDLoop.ts              ← rAF loop global. Llama draw() de todos los canvas.
│   ├── useSmoothing.ts            ← EMA filters por campo. Devuelve FlightTelemetry suavizada.
│   └── useHUDResize.ts            ← ResizeObserver. Notifica cambio de DPI / tamaño.
│
├── core/
│   ├── SmoothingEngine.ts         ← Clase pura. Aplica EMA. Sin React. Testeable.
│   ├── CanvasInstrument.ts        ← Clase base abstracta para instrumentos canvas.
│   ├── DerivedDataEngine.ts       ← Calcula FlightDerivedData dado FlightTelemetry.
│   └── HUDTheme.ts                ← Tokens de color y fuentes. Sin CSS directo.
│
├── styles/
│   ├── hud-tokens.css             ← Variables CSS (colores, fuentes, tamaños)
│   ├── hud-layout.css             ← Grid/flex del panel HUD
│   └── hud-components.css         ← Estilos de indicadores HTML/CSS
│
└── HUDArchitecture.md             ← Este documento
```

---

## 4. Catálogo de Instrumentos

### 4.1 Instrumentos Canvas 2D — Alta frecuencia de redibujado

Estos instrumentos contienen geometría en movimiento continuo (horizonte artificial, cintas de velocidad/altitud). Usar canvas evita el overhead de reconciliación de React y permite 60fps reales.

#### ArtificialHorizon (ADI — Attitude Direction Indicator)

| Atributo | Valor |
|---|---|
| **Render** | Canvas 2D |
| **Frecuencia** | rAF (60fps) |
| **Inputs** | `pitch: number`, `roll: number` |
| **Técnica** | Rotación de canvas ctx + clip circular |
| **Extensiones futuras** | Flight path vector, velocity vector, pitch ladder completo |

El horizonte artificial es el instrumento más crítico del HUD. Utiliza `ctx.save()` / `ctx.rotate()` / `ctx.restore()` para rotar el plano de tierra alrededor del centro del canvas. El pitch se mueve verticalmente (píxeles por grado configurable). Clip circular para el borde del instrumento.

**Decisión técnica:** Canvas puro sin SVG, porque SVG con transform en 60fps genera reflows costosos en navegadores con muchos elementos.

---

#### AltitudeTape

| Atributo | Valor |
|---|---|
| **Render** | Canvas 2D |
| **Frecuencia** | rAF (60fps) |
| **Inputs** | `altitudeMSL: number`, `altitudeAGL: number \| null` |
| **Técnica** | Cinta vertical desplazable. Marcas cada 10m, texto cada 50m. |
| **Extensiones futuras** | Preselect altitude, glide slope deviation |

La cinta se dibuja como un segmento de una cinta infinita vertical. Solo se dibujan las marcas visibles en el viewport del canvas. El centro de la cinta es siempre la altitud actual. El offset de scroll es `altitudeMSL % (alturaEnPx)`.

---

#### SpeedTape

| Atributo | Valor |
|---|---|
| **Render** | Canvas 2D |
| **Frecuencia** | rAF (60fps) |
| **Inputs** | `groundSpeedMs: number`, `airSpeedMs: number \| null` |
| **Técnica** | Cinta vertical igual que altitud pero invertida dirección |
| **Extensiones futuras** | Vspeed bugs, stall speed, Vne, IAS vs GS overlay |

---

#### HeadingTape

| Atributo | Valor |
|---|---|
| **Render** | Canvas 2D |
| **Frecuencia** | rAF (60fps) |
| **Inputs** | `headingDeg: number`, `courseOverGroundDeg: number \| null` |
| **Técnica** | Cinta horizontal. Marcas cada 5°, texto cada 10°. |
| **Extensiones futuras** | Bug de heading, CDI, alineación de pista |

El heading se normaliza siempre a [0,360) antes de calcular offset. La cinta es circular (los 360° se repiten), lo que requiere dibujar duplicados en los extremos para evitar discontinuidades.

---

#### VerticalSpeedIndicator (VSI)

| Atributo | Valor |
|---|---|
| **Render** | Canvas 2D |
| **Frecuencia** | rAF (60fps) |
| **Inputs** | `verticalSpeedMs: number` (suavizado con EMA) |
| **Técnica** | Aguja giratoria sobre escala. Escala no lineal (log o cuadrática). |
| **Extensiones futuras** | Integrador de altitud, energy rate |

Escala no lineal justificada: la mayoría del tiempo el VSI opera en rangos bajos (±2 m/s). Una escala lineal desperdiciaría espacio. Escala cuadrática o logarítmica da más resolución en rangos operacionales.

---

#### WaypointDirector

| Atributo | Valor |
|---|---|
| **Render** | Canvas 2D (aguja) + HTML (cifras) |
| **Frecuencia** | rAF para la aguja, React para cifras |
| **Inputs** | `bearingDeg: number`, `distanceM: number`, `etaSec: number \| null` |
| **Técnica** | Rosa de dirección + aguja giratoria señalando al WP |
| **Extensiones futuras** | CDI lateral, deviation bars, RMI |

---

### 4.2 Instrumentos HTML/CSS — Baja frecuencia de actualización

Estos instrumentos no cambian en cada frame. Un cambio de modo de vuelo ocurre cada varios minutos. Usar React + CSS transitions es correcto y más mantenible que canvas para información discreta.

#### FlightModeIndicator

- **Render:** `<div>` con clase CSS que cambia según modo
- **Input:** `flightMode: FlightMode`, `flightModeLabel: string`
- **Estado visual:** Color de fondo codificado por categoría (MANUAL=naranja, AUTO=verde, RTL=rojo, etc.)
- **Animación:** CSS transition en color

#### ArmStatusIndicator

- **Render:** `<div>` simple
- **Input:** `armState: ArmState`
- **Estado visual:** ARMED = rojo pulsante (CSS animation), DISARMED = gris
- **Crítico:** El parpadeo de ARMED usa CSS `@keyframes` — no JS — para no impactar el rAF

#### GPSStatusIndicator

- **Render:** `<div>` con iconos y texto
- **Input:** `fixType: GPSFixType`, `satellitesVisible: number`, `hdop: number \| null`
- **Estado visual:** Color por calidad de fix. Íconos de satélite.

#### BatteryIndicator

- **Render:** `<div>` con barra de progreso CSS
- **Input:** `voltageV: number`, `remainingPercent: number \| null`, `warningLevel: BatteryWarningLevel`
- **Animación:** CSS transition en fill. Parpadeo CSS cuando CRITICAL.

---

## 5. Sistema de Actualización — rAF Loop

### Problema a resolver

React re-renderiza cuando el estado cambia. Si actualizamos el store de telemetría a 50Hz, React haría 50 renders/segundo, lo que es prohibitivo para el árbol completo de la aplicación.

### Solución: Ref-based draw loop

```
┌─────────────────────────────────────────────────────┐
│                  FlightHUD.tsx                      │
│                                                     │
│  telemetryRef = useRef(telemetry)  ← no causa render│
│                                                     │
│  useEffect(() => {                                  │
│    function loop() {                                │
│      const t = telemetryRef.current                 │
│      const smoothed = smoother.update(t)            │
│      horizonInstrument.draw(smoothed.attitude)      │
│      altitudeTape.draw(smoothed.altitude)           │
│      speedTape.draw(smoothed.velocity)              │
│      headingTape.draw(smoothed.navigation)          │
│      vsiInstrument.draw(smoothed.velocity)          │
│      rafId = requestAnimationFrame(loop)            │
│    }                                                │
│    rafId = requestAnimationFrame(loop)              │
│    return () => cancelAnimationFrame(rafId)         │
│  }, [])                                             │
│                                                     │
│  // React solo re-renderiza en cambios discretos:   │
│  // armState, flightMode, gpsFixType, batteryLevel  │
└─────────────────────────────────────────────────────┘
```

**Por qué un solo rAF global:**
- Evita múltiples timers compitiendo
- El loop puede ser pausado/acelerado desde un punto central
- Permite medir el frame budget total (debug de performance)
- Compatible con `visibilitychange` para pausar cuando la pestaña no es visible

**Por qué `useRef` para la telemetría en el loop:**
- `useRef` no causa re-render cuando cambia
- El callback del rAF cierra sobre el ref, siempre lee el valor más reciente
- Los updates de telemetría (a 50Hz) van al ref. Solo los cambios discretos van al state de React.

---

## 6. Sistema de Suavizado

### Arquitectura

```
FlightTelemetry (raw, 50Hz)
        │
        ▼
SmoothingEngine.update(raw): SmoothedTelemetry
        │
        ├── pitch    → EMA(α=0.3)   ← más suave, el horizonte no debe vibrar
        ├── roll     → EMA(α=0.3)
        ├── yaw      → EMA circular (α=0.4)  ← ver nota yaw especial
        ├── climbRate→ EMA(α=0.15)  ← VSI muy suave
        ├── speed    → EMA(α=0.4)
        ├── altitude → SIN suavizado ← la altitud real no debe tener lag
        └── heading  → EMA circular (α=0.5)
```

### EMA circular para yaw/heading

El yaw circular requiere tratamiento especial porque el promedio de 355° y 5° debe dar 0°, no 180°. Se usa la técnica de promediado circular:

```
Δ = ángulo_nuevo - ángulo_prev
Δ = normalizar a [-180, 180]
nuevoCírculo = ángulo_prev + α × Δ
```

### Separación del suavizado del render

`SmoothingEngine` es una clase pura en `/core/SmoothingEngine.ts`. No depende de React. Tiene su propio estado interno (los valores EMA previos). El rAF loop la llama en cada frame con el valor raw del ref y obtiene el valor suavizado para pasar a los instrumentos.

Esta separación permite:
- Testear el suavizado de forma aislada
- Cambiar el algoritmo (Kalman, interpolación Bézier) sin tocar los instrumentos
- Ajustar `α` por instrumento desde configuración

---

## 7. Arquitectura del Canvas Instruments

La clase base `CanvasInstrument` encapsula el patrón común de todos los instrumentos canvas:

```
abstract class CanvasInstrument {
  protected canvas: HTMLCanvasElement
  protected ctx:    CanvasRenderingContext2D
  protected theme:  HUDTheme
  protected dpr:    number   ← devicePixelRatio

  // Llama al subclase para redibujar
  abstract draw(data: unknown): void

  // Gestiona resize DPI-aware
  resize(width: number, height: number): void {
    this.dpr = window.devicePixelRatio || 1
    canvas.width  = width  * this.dpr
    canvas.height = height * this.dpr
    canvas.style.width  = width  + 'px'
    canvas.style.height = height + 'px'
    ctx.scale(this.dpr, this.dpr)
  }

  protected clear(): void {
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)
  }
}
```

**DPI awareness explicado:**

En pantallas Retina / HiDPI, `devicePixelRatio` es 2 o 3. Si el canvas tiene el mismo tamaño en CSS que en pixels físicos, el texto y líneas del canvas aparecen borrosos. La solución es multiplicar las dimensiones físicas del canvas por `dpr` y escalar el contexto inversamente. Así el código de dibujo usa coordenadas CSS y la imagen final es nítida en HiDPI.

---

## 8. DPI y Escalabilidad de Tamaño

### Problema

El HUD está en un sidebar izquierdo de ancho variable. Los instrumentos deben adaptarse al espacio disponible sin rediseño manual.

### Solución: Coordenadas normalizadas

Cada instrumento recibe las dimensiones reales del canvas en `draw()` y calcula todas las posiciones como porcentaje de esas dimensiones. No existen coordenadas hardcodeadas.

```
// Ejemplo en ArtificialHorizon.draw()
const cx = width  / 2
const cy = height / 2
const r  = Math.min(width, height) * 0.45  // radio = 45% del menor lado
```

### ResizeObserver en `useHUDResize`

```
useEffect(() => {
  const ro = new ResizeObserver(entries => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect
      instruments.forEach(i => i.resize(width, height))
    }
  })
  ro.observe(containerRef.current)
  return () => ro.disconnect()
}, [])
```

El ResizeObserver notifica solo cuando el tamaño del contenedor cambia, no en cada frame.

---

## 9. Sistema de Tematización

### HUDTheme — Tokens de diseño en TypeScript

`HUDTheme.ts` define la paleta como objeto tipado. Los instrumentos canvas leen colores desde el tema, nunca hardcodeados.

```
// Paleta aeronáutica moderna (inspirada en Garmin G1000, Dynon, Aspen)
interface HUDTheme {
  sky:             string  // '#1a6ba0' — azul cielo
  ground:          string  // '#7a5c28' — tierra marrón
  horizon:         string  // '#e8e8e8' — línea horizonte
  pitchLadder:     string  // '#ffffff'
  heading:         string  // '#00d4ff' — cian aeronáutico
  altitude:        string  // '#00ff88' — verde altitud
  speed:           string  // '#ffffff'
  warning:         string  // '#ff8c00' — naranja advertencia
  critical:        string  // '#ff2d2d' — rojo crítico
  safe:            string  // '#00cc66' — verde operacional
  background:      string  // '#0d0d0d' — fondo panel
  panelBorder:     string  // '#1e2a3a'
  textPrimary:     string  // '#ffffff'
  textSecondary:   string  // '#8899aa'
  fontMono:        string  // 'JetBrains Mono, monospace'
  fontHUD:         string  // 'Roboto Condensed, sans-serif'
}
```

### Variables CSS para instrumentos HTML/CSS

```css
/* hud-tokens.css */
:root {
  --hud-bg:           #0d0d0d;
  --hud-border:       #1e2a3a;
  --hud-text:         #ffffff;
  --hud-text-dim:     #8899aa;
  --hud-sky:          #1a6ba0;
  --hud-ground:       #7a5c28;
  --hud-safe:         #00cc66;
  --hud-warning:      #ff8c00;
  --hud-critical:     #ff2d2d;
  --hud-accent:       #00d4ff;
  --hud-font-mono:    'JetBrains Mono', 'Courier New', monospace;
  --hud-font-ui:      'Roboto Condensed', 'Arial Narrow', sans-serif;
}
```

Los instrumentos canvas leen del objeto `HUDTheme` (TypeScript). Los indicadores HTML leen las variables CSS. Ambos referencian los mismos valores conceptuales. Si se añade dark/light mode, solo cambia el objeto y las variables.

---

## 10. Patrón de Datos en FlightHUD

```tsx
// FlightHUD.tsx — Estructura conceptual

function FlightHUD({ telemetry }: { telemetry: FlightTelemetry }) {
  // 1. Ref para el loop — no causa re-render
  const telemetryRef = useRef(telemetry)
  useEffect(() => { telemetryRef.current = telemetry }, [telemetry])

  // 2. Derived data — calculado fuera del render
  const derived = useMemo(() => computeDerivedData(telemetry), [telemetry])

  // 3. Estado discreto — SÍ causa re-render, pero raramente
  const armState   = telemetry.vehicleStatus.armState
  const flightMode = telemetry.vehicleStatus.flightMode
  const gpsStatus  = telemetry.gpsStatus
  const battery    = telemetry.battery

  // 4. Canvas loop — no toca React
  useHUDLoop(telemetryRef, canvasRefs, smoother)

  return (
    <div className="hud-panel">
      {/* Instrumentos canvas — solo refs, sin props que causen render */}
      <canvas ref={horizonCanvasRef} />
      <canvas ref={altitudeCanvasRef} />
      <canvas ref={speedCanvasRef} />
      <canvas ref={headingCanvasRef} />
      <canvas ref={vsiCanvasRef} />
      <canvas ref={waypointCanvasRef} />

      {/* Indicadores HTML — reciben props, React gestiona */}
      <FlightModeIndicator mode={flightMode} label={telemetry.vehicleStatus.flightModeLabel} />
      <ArmStatusIndicator  armState={armState} />
      <GPSStatusIndicator  gpsStatus={gpsStatus} />
      <BatteryIndicator    battery={battery} />
    </div>
  )
}
```

**Por qué este split:**

- Los canvas reciben datos a través del rAF ref, no como props de React. Esto evita que React re-renderice el DOM del canvas en cada tick de telemetría.
- Los indicadores HTML sí reciben props de React, pero como `armState`, `flightMode` y `battery.warningLevel` cambian raramente, el re-render es aceptable y necesario (necesitan participar en el ciclo de React para CSS transitions, accesibilidad, etc.).

---

## 11. Extensibilidad Futura

El diseño actual deja puertas abiertas para:

### Synthetic Vision (SVS)

`ArtificialHorizon` puede reemplazar su fondo azul/marrón plano por un render de terreno proyectado en perspectiva. Esto solo requiere añadir un `TerrainRenderer` interno que reciba `altitude`, `pitch`, `roll`, `heading`, `lat`, `lon` y un DTM cacheado. La interfaz pública del instrumento no cambia.

### Flight Path Vector (FPV)

El punto donde el avión realmente va (no donde apunta). Se calcula desde velocidad NED y actitud. Se dibuja como un círculo en el `ArtificialHorizon` con offset en pitch/roll. Solo requiere añadir `velNorthMs`, `velEastMs`, `velDownMs` a los inputs del instrumento.

### Wind Vector

Diferencia entre heading y COG, combinada con airspeed vs groundspeed. Se puede añadir como overlay en el `HeadingTape` o como instrumento independiente.

### RTL Director / Glide Path

Bearing + distancia al home. El `WaypointDirector` ya tiene la arquitectura para mostrar diferentes targets (WP activo, home, base RTL). Solo se añade una fuente de datos adicional.

### Multi-vehicle

El HUD es un componente puro que recibe `FlightTelemetry`. Para multi-vehículo, se instancian múltiples `FlightHUD` con diferentes datos. No hay estado global en el HUD.

---

## 12. Decisiones Técnicas Resumidas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| Canvas 2D para instrumentos continuos | SVG animado | SVG genera reflows en 60fps con muchos elementos |
| Canvas 2D para instrumentos continuos | WebGL | Overkill. Canvas 2D es suficiente para el HUD actual |
| Un solo rAF global | rAF por instrumento | Evita competencia de timers. Budget de frame centralizado |
| `useRef` para telemetría en loop | Estado React | Evita 50 re-renders/segundo desde el store |
| Props inmutables hacia instrumentos | Mutación interna | Testabilidad, razonamiento local, sin bugs de estado |
| EMA en `SmoothingEngine` pura | EMA en el instrumento | Testeable sin DOM. Reemplazable sin tocar render |
| `CanvasInstrument` clase base | Hooks de React | Los canvas no necesitan React runtime. Menos overhead |
| Coordenadas normalizadas | Tamaños fijos | El HUD funciona en cualquier viewport sin rediseño |
| DPR scaling en resize | Sin DPR | Texto y líneas nítidas en pantallas Retina |
| `computeDerivedData` en `useMemo` | En el store | Se recalcula solo cuando cambia la telemetría |
| HTML/CSS para indicadores discretos | Canvas para todo | Menos código. Accesibilidad. CSS transitions nativas |
