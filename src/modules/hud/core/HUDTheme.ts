/**
 * HUDTheme.ts
 *
 * Tokens de diseño del HUD aeronáutico.
 * Paleta inspirada en aviónica moderna: Garmin G1000, Dynon SkyView, Aspen EFD.
 *
 * Los instrumentos canvas leen colores desde aquí.
 * Los indicadores HTML/CSS usan las variables CSS equivalentes en hud-tokens.css.
 *
 * Regla: ningún instrumento tiene colores hardcodeados.
 */

export interface HUDTheme {
  // --- Horizonte artificial ---
  sky:              string;
  ground:           string;
  horizonLine:      string;
  pitchLadder:      string;
  rollArc:          string;

  // --- Cintas (altitud, velocidad, heading) ---
  tapeBg:           string;
  tapeBorder:       string;
  tapeText:         string;
  tapeMajorTick:    string;
  tapeMinorTick:    string;
  tapeCenterBug:    string;

  // --- Estados semafóricos ---
  safe:             string;   // Verde operacional
  warning:          string;   // Naranja — atención
  critical:         string;   // Rojo — emergencia

  // --- Acento aeronáutico ---
  accent:           string;   // Cian — heading, waypoint
  navigation:       string;   // Magenta — active waypoint / navigation

  // --- Batería ---
  batteryHigh:      string;
  batteryMedium:    string;
  batteryLow:       string;
  batteryCritical:  string;

  // --- Panel general ---
  background:       string;
  panelBorder:      string;
  textPrimary:      string;
  textSecondary:    string;
  textDim:          string;

  // --- Tipografía ---
  fontMono:         string;
  fontHUD:          string;

  // --- Tamaños base (px lógicos) ---
  fontSize:         number;
  lineWidth:        number;
}

/**
 * Tema oscuro por defecto.
 * Optimizado para uso en exteriores con pantalla brillante y en interiores.
 */
export const DEFAULT_HUD_THEME: HUDTheme = {
  // Horizonte
  sky:              '#1565a8',   // aviation blue (gradient stop near horizon)
  ground:           '#5a3010',   // earthy brown (gradient stop near horizon)
  horizonLine:      '#e0eaf4',
  pitchLadder:      '#d8e8f4',
  rollArc:          '#9ab0c4',

  // Cintas
  tapeBg:           'rgba(5, 8, 14, 0.97)',
  tapeBorder:       'rgba(28, 53, 80, 0.85)',
  tapeText:         '#c8d6e2',
  tapeMajorTick:    '#bccad6',
  tapeMinorTick:    '#3a5870',
  tapeCenterBug:    '#ffc820',

  // Acento
  accent:           '#00d4ff',
  navigation:       '#ff3eb5',

  // Estado
  safe:             '#00cc66',
  warning:          '#ff8c00',
  critical:         '#ff2d2d',

  // Batería
  batteryHigh:      '#00cc66',
  batteryMedium:    '#ffcc00',
  batteryLow:       '#ff8c00',
  batteryCritical:  '#ff2d2d',

  // Panel
  background:       '#070b12',
  panelBorder:      '#1c3550',
  textPrimary:      '#dde5ed',
  textSecondary:    '#6a7f92',
  textDim:          '#324558',

  // Tipografía
  fontMono:         "'JetBrains Mono', 'Courier New', monospace",
  fontHUD:          "'Roboto Condensed', 'Arial Narrow', sans-serif",

  // Tamaños
  fontSize:         13.2,
  lineWidth:        1.5,
};
