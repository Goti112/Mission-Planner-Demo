/**
 * FlightTelemetryModel.ts
 *
 * Capa de datos de telemetría para Ground Control Station (GCS).
 * Diseñada para ser la fuente de verdad del HUD profesional.
 *
 * Compatibilidad:
 *   - MAVLink v2 (ArduPilot / PX4)
 *   - Simulación interna (SITL / datos sintéticos)
 *   - Futuras fuentes (ROS2, propietario, etc.)
 *
 * Principios de diseño:
 *   - Sin dependencias de React, Cesium, DOM o cualquier framework UI.
 *   - Sin efectos secundarios. Solo modelos puros y helpers matemáticos.
 *   - Separación de capas: RAW → NORMALIZED → DERIVED
 *   - Todos los valores en unidades SI salvo excepción documentada.
 *
 * @author  GCS Engineering
 * @version 1.0.0
 */

// ============================================================
// SECTION 1 — ENUMS PROFESIONALES
// ============================================================

/**
 * Tipo de vehículo MAVLink.
 * Fuente: HEARTBEAT.type (MAV_TYPE)
 * Ref: https://mavlink.io/en/messages/common.html#MAV_TYPE
 */
export const VehicleType = {
  GENERIC: 0,
  FIXED_WING: 1,
  QUADROTOR: 2,
  HEXAROTOR: 13,
  OCTOROTOR: 14,
  TRICOPTER: 15,
  HELICOPTER: 4,
  GROUND_ROVER: 10,
  SUBMARINE: 12,
  VTOL_TAILSITTER: 19,
  VTOL_TILTROTOR: 20,
} as const;
export type VehicleType = typeof VehicleType[keyof typeof VehicleType];

/**
 * Estado de armado del vehículo.
 * Fuente: HEARTBEAT.base_mode — bit 7 (MAV_MODE_FLAG_SAFETY_ARMED)
 * Un vehículo armado tiene motores habilitados y puede volar.
 */
export const ArmState = {
  DISARMED: "DISARMED",
  ARMED: "ARMED",
} as const;
export type ArmState = typeof ArmState[keyof typeof ArmState];

/**
 * Modos de vuelo unificados.
 *
 * ArduPilot y PX4 tienen esquemas de modos diferentes.
 * Este enum normaliza los modos más comunes para la UI.
 *
 * Fuente: HEARTBEAT.custom_mode + HEARTBEAT.autopilot
 *
 * ArduCopter: https://ardupilot.org/copter/docs/flight-modes.html
 * PX4:        https://docs.px4.io/main/en/flight_modes/
 */
export const FlightMode = {
  // --- Modos ArduCopter ---
  STABILIZE:    "STABILIZE",    // Asistencia básica de actitud. Throttle manual.
  ACRO:         "ACRO",         // Vuelo de acrobacias. Sin asistencia de nivel.
  ALT_HOLD:     "ALT_HOLD",     // Mantiene altitud con barómetro.
  AUTO:         "AUTO",         // Sigue misión cargada.
  GUIDED:       "GUIDED",       // Sigue órdenes GCS en tiempo real.
  LOITER:       "LOITER",       // Mantiene posición GPS + altitud.
  RTL:          "RTL",          // Return To Launch.
  CIRCLE:       "CIRCLE",       // Orbita alrededor de un punto.
  LAND:         "LAND",         // Aterrizaje autónomo.
  DRIFT:        "DRIFT",        // Semi-auto posición con throttle libre.
  SPORT:        "SPORT",        // Similar a ACRO con autoleveling.
  FLIP:         "FLIP",         // Flip automático sobre eje roll.
  AUTOTUNE:     "AUTOTUNE",     // Sintonización automática de PID.
  POSHOLD:      "POSHOLD",      // Position Hold + rate control.
  BRAKE:        "BRAKE",        // Frena y mantiene posición.
  THROW:        "THROW",        // Lanzamiento a mano.
  AVOID_ADSB:   "AVOID_ADSB",   // Evasión automática de tráfico ADS-B.
  GUIDED_NOGPS: "GUIDED_NOGPS", // GUIDED sólo actitud/altitud (sin GPS).
  SMART_RTL:    "SMART_RTL",    // RTL siguiendo la ruta inversa de vuelo.
  FLOWHOLD:     "FLOWHOLD",     // Mantiene posición con optical flow.
  FOLLOW:       "FOLLOW",       // Sigue a otro vehículo o GCS.
  ZIGZAG:       "ZIGZAG",       // Vuelo en zigzag para cobertura.
  SYSTEMID:     "SYSTEMID",     // Modo de identificación de sistema.
  AUTOROTATE:   "AUTOROTATE",   // Auto-rotación (helicopteros).
  AUTO_RTL:     "AUTO_RTL",     // RTL dentro de modo AUTO.
  TURTLE:       "TURTLE",       // Recuperación desde posición invertida.
  RATE_ACRO:    "RATE_ACRO",    // Acro rate-only mode.
  // --- Modos PX4 ---
  MANUAL:   "MANUAL",
  POSITION: "POSITION",   // Equivalente a POSHOLD en PX4.
  MISSION:  "MISSION",    // Equivalente a AUTO en PX4.
  HOLD:     "HOLD",
  OFFBOARD: "OFFBOARD",   // Control externo (ROS2, companion computer).
  TAKEOFF:  "TAKEOFF",
  // --- Modos ArduPlane ---
  FBWA:     "FBWA",
  FBWB:     "FBWB",
  CRUISE:   "CRUISE",
  TRAINING: "TRAINING",
  INITIALISING: "INITIALISING",
  QSTABILIZE: "QSTABILIZE",
  QHOVER: "QHOVER",
  QLOITER: "QLOITER",
  QLAND: "QLAND",
  QRTL: "QRTL",
  QAUTOTUNE: "QAUTOTUNE",
  QACRO: "QACRO",
  THERMAL: "THERMAL",
  LOITER2QLAND: "LOITER2QLAND",
  AUTOLAND: "AUTOLAND",
  // --- Estado desconocido ---
  UNKNOWN: "UNKNOWN",
} as const;
export type FlightMode = typeof FlightMode[keyof typeof FlightMode];

/**
 * Tipo de fix GPS.
 * Fuente: GPS_RAW_INT.fix_type (GPS_FIX_TYPE)
 * Ref: https://mavlink.io/en/messages/common.html#GPS_FIX_TYPE
 */
export const GPSFixType = {
  NO_GPS: 0, // Sin hardware GPS detectado.
  NO_FIX: 1, // GPS detectado pero sin fix.
  FIX_2D: 2, // Fix 2D (lat/lon, sin altitud confiable).
  FIX_3D: 3, // Fix 3D completo. Mínimo operacional.
  DGPS: 4, // DGPS diferencial.
  RTK_FLOAT: 5, // RTK con solución flotante. Alta precisión.
  RTK_FIXED: 6, // RTK fijo. Precisión centimétrica.
  STATIC: 7, // GPS estático (referencia base RTK).
  PPP: 8, // Point Precise Positioning.
} as const;
export type GPSFixType = typeof GPSFixType[keyof typeof GPSFixType];

/**
 * Flags de estado EKF (Extended Kalman Filter).
 *
 * Fuente: EKF_STATUS_REPORT (ArduPilot)
 *   - flags (uint16): bitmask de estado del EKF
 * Ref: https://mavlink.io/en/messages/ardupilotmega.html#EKF_STATUS_REPORT
 *
 * Nota: PX4 usa ESTIMATOR_STATUS con campos float de varianza directamente.
 * Este enum cubre el modelo ArduPilot. Para PX4 se recomiendan thresholds
 * sobre los campos de varianza de ESTIMATOR_STATUS.
 */
export const EKFStatusFlag = {
  ATTITUDE: 1 << 0,  // Actitud estimada correctamente.
  VELOCITY_HORIZ: 1 << 1,  // Velocidad horizontal estimada.
  VELOCITY_VERT: 1 << 2,  // Velocidad vertical estimada.
  POS_HORIZ_REL: 1 << 3,  // Posición horizontal relativa (ej. óptico).
  POS_HORIZ_ABS: 1 << 4,  // Posición horizontal absoluta (GPS).
  POS_VERT_ABS: 1 << 5,  // Posición vertical absoluta (baro/GPS).
  POS_VERT_AGL: 1 << 6,  // Posición AGL estimada (sonar/lidar).
  CONST_POS_MODE: 1 << 7,  // En modo posición constante (GPS perdido).
  PRED_POS_HORIZ_REL: 1 << 8,  // Predicción posición horizontal relativa OK.
  PRED_POS_HORIZ_ABS: 1 << 9,  // Predicción posición horizontal absoluta OK.
} as const;
export type EKFStatusFlag = typeof EKFStatusFlag[keyof typeof EKFStatusFlag];

/**
 * Estado de salud general del EKF normalizado para el HUD.
 * Derivado de la combinación de EKFStatusFlag bits críticos.
 */
export const EKFHealthStatus = {
  GOOD: "GOOD",     // Todos los estimadores críticos OK.
  DEGRADED: "DEGRADED", // Algunos estimadores fallando (no crítico).
  BAD: "BAD",      // Estimadores críticos perdidos. No volar.
  UNKNOWN: "UNKNOWN",  // Sin datos EKF todavía.
} as const;
export type EKFHealthStatus = typeof EKFHealthStatus[keyof typeof EKFHealthStatus];

/**
 * Estado MAVLink del autopiloto.
 * Fuente: HEARTBEAT.system_status (MAV_STATE)
 */
export const MAVState = {
  UNINIT: 0, // Sin inicializar.
  BOOT: 1, // Inicializando.
  CALIBRATING: 2, // Calibrando sensores.
  STANDBY: 3, // Listo para armar.
  ACTIVE: 4, // Activo / volando.
  CRITICAL: 5, // Modo de emergencia activo (fallo sensor).
  EMERGENCY: 6, // Emergencia — puede estar cayendo.
  POWEROFF: 7, // Apagando.
  FLIGHT_TERMINATION: 8,
} as const;
export type MAVState = typeof MAVState[keyof typeof MAVState];

// ============================================================
// SECTION 2 — TELEMETRIA RAW (datos MAVLink sin procesar)
// ============================================================

/**
 * Datos crudos del mensaje ATTITUDE.
 * Frecuencia típica: 10–50 Hz.
 * Ref: https://mavlink.io/en/messages/common.html#ATTITUDE
 *
 * Unidades: radianes y rad/s (SI nativo MAVLink).
 * Conversión a grados se hace en la capa de normalización.
 */
export interface MAVAttitude {
  /** Tiempo de boot del autopiloto en ms al momento del mensaje. */
  timeBootMs: number;

  /** Ángulo de cabeceo (nose up = positivo). Unidad: rad. Rango: [-π, π] */
  pitch: number;

  /** Ángulo de alabeo (derecha abajo = positivo). Unidad: rad. Rango: [-π, π] */
  roll: number;

  /** Ángulo de guiñada (CW desde norte = positivo). Unidad: rad. Rango: [-π, π] */
  yaw: number;

  /** Velocidad angular en pitch. Unidad: rad/s */
  pitchSpeed: number;

  /** Velocidad angular en roll. Unidad: rad/s */
  rollSpeed: number;

  /** Velocidad angular en yaw. Unidad: rad/s */
  yawSpeed: number;
}

/**
 * Datos crudos del mensaje VFR_HUD.
 * Visualización básica tipo cabina. 4 Hz típico.
 * Ref: https://mavlink.io/en/messages/common.html#VFR_HUD
 */
export interface MAVVFRHUD {
  /** Velocidad respecto al suelo. Unidad: m/s */
  groundspeed: number;

  /** Velocidad respecto al aire (IAS). Unidad: m/s. Puede ser 0 si no hay pitot. */
  airspeed: number;

  /** Heading respecto al norte magnético. Unidad: grados. Rango: [0, 360) */
  heading: number;

  /** Porcentaje de throttle. Rango: [0, 100] */
  throttle: number;

  /** Altitud MSL (barómetro fusionado). Unidad: metros. */
  alt: number;

  /** Velocidad vertical (positivo = subiendo). Unidad: m/s */
  climbRate: number;
}

/**
 * Datos crudos del mensaje GPS_RAW_INT.
 * Ref: https://mavlink.io/en/messages/common.html#GPS_RAW_INT
 *
 * Nota: lat/lon en 1e7 (entero × 10^-7 = grados decimales).
 * alt en mm. eph/epv en cm (UINT16_MAX = desconocido).
 */
export interface MAVGPSRaw {
  timeUsec: number;

  /** Ver enum GPSFixType */
  fixType: GPSFixType;

  /** Latitud × 1e7. Dividir entre 1e7 para obtener grados. */
  lat: number;

  /** Longitud × 1e7. Dividir entre 1e7 para obtener grados. */
  lon: number;

  /** Altitud MSL en mm. Dividir entre 1000 para metros. */
  alt: number;

  /** Error posición horizontal (HDOP × 100). UINT16_MAX = inválido. */
  eph: number;

  /** Error posición vertical (VDOP × 100). UINT16_MAX = inválido. */
  epv: number;

  /** Velocidad sobre tierra en cm/s. */
  vel: number;

  /** Curso sobre tierra en cdo (centidegrees). UINT16_MAX = inválido. */
  cog: number;

  /** Número de satélites visibles. UINT8_MAX = desconocido. */
  satellitesVisible: number;
}

/**
 * Datos crudos del mensaje GLOBAL_POSITION_INT.
 * Posición global fusionada por el EKF. Más estable que GPS_RAW_INT.
 * Ref: https://mavlink.io/en/messages/common.html#GLOBAL_POSITION_INT
 */
export interface MAVGlobalPosition {
  timeBootMs: number;

  /** Latitud × 1e7. */
  lat: number;

  /** Longitud × 1e7. */
  lon: number;

  /** Altitud MSL en mm. */
  alt: number;

  /** Altitud sobre terreno estimada en mm. */
  relativeAlt: number;

  /** Velocidad Norte en cm/s. */
  vx: number;

  /** Velocidad Este en cm/s. */
  vy: number;

  /** Velocidad vertical en cm/s (positivo = subiendo). */
  vz: number;

  /** Heading en cdo (centidegrees). UINT16_MAX = desconocido. */
  hdg: number;
}

/**
 * Datos crudos del mensaje HEARTBEAT.
 * El latido del autopiloto. Frecuencia obligatoria: 1 Hz.
 * Ref: https://mavlink.io/en/messages/common.html#HEARTBEAT
 */
export interface MAVHeartbeat {
  /** Ver enum VehicleType. */
  type: VehicleType;

  /** ID string del autopiloto (ArduPilot = 3, PX4 = 12). */
  autopilot: number;

  /** Bitmask de modo base. Bit 7 = armado. */
  baseMode: number;

  /** Modo personalizado específico del firmware. */
  customMode: number;

  /** Ver enum MAVState. */
  systemStatus: MAVState;

  /** Versión del protocolo MAVLink. */
  mavlinkVersion: number;
}

/**
 * Raw STATUSTEXT message data.
 * Source: autopilot status messages, including PreArm and Arm denial reasons.
 */
export interface MAVStatusText {
  /** MAV_SEVERITY numeric value. 0 is most severe, 7 is debug. */
  severity: number;

  /** Human-readable autopilot status text. */
  text: string;

  /** Unix timestamp in ms when the message was received by the GCS. */
  receivedAtMs: number;

  /** MAVLink v2 chunk id, null when absent. */
  id: number | null;

  /** MAVLink v2 chunk sequence, null when absent. */
  chunkSeq: number | null;
}

/**
 * Datos crudos del mensaje SYS_STATUS.
 * Estado de sensores y batería principal.
 * Ref: https://mavlink.io/en/messages/common.html#SYS_STATUS
 */
export interface MAVSysStatus {
  /** Voltaje batería en mV. Dividir entre 1000 para voltios. */
  voltageBattery: number;

  /** Corriente batería en cA (10 mA). Dividir entre 100 para amperios. UINT16_MAX = no medido. */
  currentBattery: number;

  /** Porcentaje batería. -1 = no disponible. Rango: [0, 100] */
  batteryRemaining: number;

  /** CPU load en permil. 1000 = 100%. */
  load: number;

  /** Errores en comm 1 (UART). */
  errorsComm: number;

  /** Bitmask de sensores presentes (MAV_SYS_STATUS_SENSOR). */
  onboardControlSensorsPresent: number;

  /** Bitmask de sensores habilitados. */
  onboardControlSensorsEnabled: number;

  /** Bitmask de sensores en buen estado. */
  onboardControlSensorsHealth: number;
}

/**
 * Datos crudos del mensaje BATTERY_STATUS.
 * Más detallado que SYS_STATUS para baterías.
 * Ref: https://mavlink.io/en/messages/common.html#BATTERY_STATUS
 */
export interface MAVBatteryStatus {
  /** ID de la batería (sistemas multi-batería). */
  id: number;

  /** Consumo acumulado en mAh. -1 = no disponible. */
  currentConsumed: number;

  /** Energía consumida en hJ. -1 = no disponible. */
  energyConsumed: number;

  /** Temperatura de la batería en cdK (centidegrees Kelvin). INT16_MAX = desconocido. */
  temperature: number;

  /** Array de tensiones por celda en mV. UINT16_MAX = no disponible. Máx 10 celdas. */
  voltages: number[];

  /** Corriente actual en cA. -1 = no disponible. */
  currentBattery: number;

  /** Porcentaje restante. -1 = no disponible. */
  batteryRemaining: number;
}

/**
 * Datos crudos del mensaje EKF_STATUS_REPORT (ArduPilot).
 * Ref: https://mavlink.io/en/messages/ardupilotmega.html#EKF_STATUS_REPORT
 *
 * Nota PX4: usar ESTIMATOR_STATUS. Los campos de varianza son float [0,1].
 * Un threshold de 0.5 en pos_horiz_ratio es señal de degradación.
 */
export interface MAVEKFStatus {
  /** Bitmask de flags. Ver enum EKFStatusFlag. */
  flags: number;

  /** Varianza de velocidad. 0 = perfecto, >1 = malo. */
  velocityVariance: number;

  /** Varianza de posición horizontal. */
  posHorizVariance: number;

  /** Varianza de posición vertical. */
  posVertVariance: number;

  /** Varianza de compás. */
  compassVariance: number;

  /** Varianza de velocidad de terreno. */
  terrainAltVariance: number;
}

/**
 * Datos crudos del mensaje NAV_CONTROLLER_OUTPUT.
 * Estado del controlador de navegación durante una misión.
 * Ref: https://mavlink.io/en/messages/common.html#NAV_CONTROLLER_OUTPUT
 */
export interface MAVNavControllerOutput {
  /** Distancia horizontal al waypoint activo en metros. */
  wp_dist: number;
  /** Bearing deseado hacia el waypoint activo en grados. Rango [0, 360). */
  nav_bearing: number;
  /** Error de seguimiento lateral en metros (positivo = derecha). */
  crosstrack_error: number;
  /** Altitud deseada en metros MSL. */
  alt_error: number;
  /** Velocidad aérea deseada en m/s. */
  aspd_error: number;
  /** Aceleración deseada en m/s². */
  xtrack_error: number;
}

/**
 * Datos crudos del mensaje HOME_POSITION.
 * Posición home registrada cuando el vehículo se armó.
 * Ref: https://mavlink.io/en/messages/common.html#HOME_POSITION
 */
export interface MAVHomePosition {
  /** Latitud × 1e7. Dividir entre 1e7 para obtener grados decimales. */
  latitude: number;
  /** Longitud × 1e7. Dividir entre 1e7 para obtener grados decimales. */
  longitude: number;
  /** Altitud MSL en mm. Dividir entre 1000 para metros. */
  altitude: number;
}

/** MAVLink SERVO_OUTPUT_RAW — actual PWM outputs to servos (µs).
 *  ArduPlane defaults: ch1=AIL, ch2=ELV, ch3=THR, ch4=RDR, ch5=FLAPS.
 *  Range: 1000–2000 µs. 0 = channel not connected.
 */
export interface MAVServoOutputRaw {
  timeUsec:  number;
  port: number;
  servo1Raw: number;   // ch1 — Aileron
  servo2Raw: number;   // ch2 — Elevator
  servo3Raw: number;   // ch3 — Throttle
  servo4Raw: number;   // ch4 — Rudder
  servo5Raw: number;   // ch5 — Flaps
  servo6Raw: number;
  servo7Raw: number;
  servo8Raw: number;
  servo9Raw: number;
  servo10Raw: number;
  servo11Raw: number;
  servo12Raw: number;
  servo13Raw: number;
  servo14Raw: number;
  servo15Raw: number;
  servo16Raw: number;
}

/** MAVLink ACTUATOR_OUTPUT_STATUS — supersedes SERVO_OUTPUT_RAW on newer stacks.
 *  `actuator` is a 32-slot array. Values may be normalized [-1, 1] or PWM-like.
 */
export interface MAVActuatorOutputStatus {
  timeUsec: number;
  active: number;
  actuator: number[];
}

/** MAVLink RC_CHANNELS — pilot RC input channels in PWM (µs). */
export interface MAVRCChannels {
  timeBootMs: number;
  chancount: number;
  chan1Raw: number;
  chan2Raw: number;
  chan3Raw: number;
  chan4Raw: number;
  chan5Raw: number;
  chan6Raw: number;
  chan7Raw: number;
  chan8Raw: number;
  chan9Raw: number;
  chan10Raw: number;
  chan11Raw: number;
  chan12Raw: number;
  chan13Raw: number;
  chan14Raw: number;
  chan15Raw: number;
  chan16Raw: number;
  chan17Raw: number;
  chan18Raw: number;
  rssi: number;
}

/** Normalized control surface positions derived from SERVO_OUTPUT_RAW.
 *  Bidirectional surfaces (AIL/ELV/RDR): [-100, +100].
 *  Unipolar surfaces (THR/FLAPS): [0, 100].
 */
export interface ControlSurfacesTelemetry {
  aileronPct:  number;   // [-100, +100]
  elevatorPct: number;   // [-100, +100]
  rudderPct:   number;   // [-100, +100]
  throttlePct: number;   // [0, 100]
  flapsPct:    number;   // [0, 100]
}

export type ControlSurfacesSource =
  | 'SERVO_OUTPUT_RAW'
  | 'ACTUATOR_OUTPUT_STATUS'
  | 'RC_CHANNELS'
  | 'ATTITUDE_PROXY'
  | 'PREV_HOLD';

/**
 * Snapshot completo de datos MAVLink crudos en un instante t.
 * Es la entrada de datos al sistema de normalización.
 * Todos los campos son opcionales porque los mensajes MAVLink
 * llegan de forma asíncrona e independiente.
 */
export interface TelemetryRawData {
  /** Timestamp Unix en ms del momento de captura en el GCS. */
  capturedAt: number;

  /** System ID del vehículo MAVLink (1–255). */
  sysId: number;

  /** Component ID (generalmente 1 para autopiloto). */
  compId: number;

  attitude?: MAVAttitude;
  vfrHud?: MAVVFRHUD;
  gpsRaw?: MAVGPSRaw;
  globalPosition?: MAVGlobalPosition;
  heartbeat?: MAVHeartbeat;
  sysStatus?: MAVSysStatus;
  batteryStatus?: MAVBatteryStatus;
  ekfStatus?: MAVEKFStatus;
  /** NAV_CONTROLLER_OUTPUT — real-time waypoint navigation data. */
  navController?: MAVNavControllerOutput;
  /** HOME_POSITION — set when vehicle arms, used for distToMAV. */
  homePosition?: MAVHomePosition;
  /** SERVO_OUTPUT_RAW — actual PWM servo outputs for control surface visualization. */
  servoOutput?: MAVServoOutputRaw;
  /** ACTUATOR_OUTPUT_STATUS — modern actuator stream for control surfaces. */
  actuatorOutput?: MAVActuatorOutputStatus;
  /** RC_CHANNELS — pilot input fallback for control indications. */
  rcChannels?: MAVRCChannels;
  /** STATUSTEXT — autopilot messages such as PreArm and Arm denial reasons. */
  statusText?: MAVStatusText;
}

// ============================================================
// SECTION 3 — FLIGHT TELEMETRY (modelo normalizado para UI)
// ============================================================

/**
 * Actitud del vehículo normalizada.
 * Fuente: MAVAttitude (ATTITUDE)
 * Todas las unidades convertidas a grados para la UI.
 */
export interface AttitudeTelemetry {
  /** Pitch nose-up positivo. Unidad: grados. Rango: [-90, 90] */
  pitchDeg: number;

  /** Roll derecha positivo. Unidad: grados. Rango: [-180, 180] */
  rollDeg: number;

  /**
   * Yaw normalizado norte-magnético CW.
   * Unidad: grados. Rango: [0, 360)
   * Normalización: rawYawRad → radToDeg → normalizeYaw
   */
  yawDeg: number;

  /** Velocidad angular pitch. Unidad: deg/s. Para indicadores de tasa. */
  pitchRateDegS: number;

  /** Velocidad angular roll. Unidad: deg/s. */
  rollRateDegS: number;

  /** Velocidad angular yaw. Unidad: deg/s. */
  yawRateDegS: number;
}

/**
 * Velocidades del vehículo normalizadas.
 * Fuente primaria: VFR_HUD / GLOBAL_POSITION_INT
 */
export interface VelocityTelemetry {
  /**
   * Velocidad sobre tierra (Ground Speed).
   * Fuente: VFR_HUD.groundspeed o sqrt(vx²+vy²) de GLOBAL_POSITION_INT.
   * Unidad: m/s.
   */
  groundSpeedMs: number;

  /**
   * Velocidad respecto al aire (Indicated Air Speed).
   * Fuente: VFR_HUD.airspeed.
   * Unidad: m/s. Puede ser null si no hay sensor pitot.
   */
  airSpeedMs: number | null;

  /**
   * Velocidad vertical (climb rate). Positivo = subiendo.
   * Fuente: VFR_HUD.climbRate o -vz de GLOBAL_POSITION_INT.
   * Unidad: m/s.
   */
  verticalSpeedMs: number;

  /**
   * Porcentaje de throttle reportado por VFR_HUD.
   * Rango: [0, 100].
   */
  throttlePercent: number;

  /**
   * Componentes velocidad NED (North-East-Down).
   * Fuente: GLOBAL_POSITION_INT.vx/vy/vz (cm/s → m/s).
   * Útiles para synthetic vision y vector de velocidad en mapa.
   */
  velNorthMs: number;
  velEastMs: number;
  velDownMs: number;
}

/**
 * Altitudes normalizadas.
 * Fuente: VFR_HUD, GLOBAL_POSITION_INT, GPS_RAW_INT
 */
export interface AltitudeTelemetry {
  /**
   * Altitud MSL (Mean Sea Level). Referencia: geoide EGM96.
   * Fuente: VFR_HUD.alt (barómetro fusionado) o GLOBAL_POSITION_INT.alt (mm→m).
   * Unidad: metros.
   */
  altitudeMSLm: number;

  /**
   * Altitud AGL (Above Ground Level).
   * Fuente: GLOBAL_POSITION_INT.relative_alt (mm→m).
   * En ArduPilot esta es relativa al punto de arm/home, no al terreno.
   * Para AGL real sobre terreno, combinar con datos DTM/SRTM.
   * Unidad: metros. Puede ser null si no disponible.
   */
  altitudeAGLm: number | null;

  /**
   * Altitud de home/origen de misión.
   * Usada para calcular altitud relativa a home.
   * Unidad: metros MSL.
   */
  homeAltitudeMSLm: number | null;
}

/**
 * Datos de navegación.
 * Fuente: GLOBAL_POSITION_INT, VFR_HUD, MISSION_CURRENT + MISSION_ITEM_INT
 */
export interface NavigationTelemetry {
  /** Latitud decimal. Fuente: GLOBAL_POSITION_INT.lat / 1e7. */
  latitude: number;

  /** Longitud decimal. Fuente: GLOBAL_POSITION_INT.lon / 1e7. */
  longitude: number;

  /**
   * Heading magnético (dirección de nariz del vehículo).
   * Fuente: VFR_HUD.heading o GLOBAL_POSITION_INT.hdg / 100.
   * Unidad: grados. Rango: [0, 360).
   */
  headingDeg: number;

  /**
   * Curso sobre tierra (Course Over Ground).
   * Calculado desde velocidad NED o GPS_RAW_INT.cog.
   * Puede diferir del heading si hay viento lateral.
   * Unidad: grados. Rango: [0, 360).
   */
  courseOverGroundDeg: number | null;

  /** Número de secuencia del waypoint activo en la misión (MISSION_CURRENT.seq). */
  currentWaypointIndex: number | null;

  /**
   * Distancia al waypoint activo.
   * Calculada en FlightDerivedData. Null si no hay misión activa.
   * Unidad: metros.
   */
  distanceToWaypointM: number | null;

  /**
   * Bearing hacia el waypoint activo.
   * Calculado en FlightDerivedData.
   * Unidad: grados. Rango: [0, 360).
   */
  bearingToWaypointDeg: number | null;
}

/**
 * Estado del vehículo (modo, armado, etc.).
 * Fuente: HEARTBEAT
 */
export interface VehicleStatusTelemetry {
  /** Estado de armado derivado de HEARTBEAT.base_mode bit 7. */
  armState: ArmState;

  /**
   * Modo de vuelo normalizado.
   * Derivado de HEARTBEAT.custom_mode + HEARTBEAT.autopilot.
   * La normalización específica por autopiloto se hace en el parser MAVLink.
   */
  flightMode: FlightMode;

  /** String del modo tal como reporta el firmware (para display). */
  flightModeLabel: string;

  /** Tipo de vehículo (multicóptero, fixed wing, etc.). */
  vehicleType: VehicleType;

  /** Estado del sistema MAVLink. */
  mavState: MAVState;

  /** Tiempo desde último heartbeat en ms. Usar para detectar pérdida de enlace. */
  lastHeartbeatMs: number;

  /** true si el enlace MAVLink está activo (heartbeat recibido en últimos 3s). */
  isConnected: boolean;

  /**
   * Porcentaje de carga de CPU del autopiloto.
   * Fuente: SYS_STATUS.load / 10. Rango: [0, 100].
   */
  cpuLoadPercent: number | null;
}

/**
 * Estado del receptor GPS.
 * Fuente: GPS_RAW_INT
 */
export interface GPSStatusTelemetry {
  /** Tipo de fix. Ver enum GPSFixType. */
  fixType: GPSFixType;

  /** Número de satélites usados en la solución. */
  satellitesVisible: number;

  /**
   * Horizontal Dilution of Precision.
   * Fuente: GPS_RAW_INT.eph / 100.
   * <1.0 = excelente, 1-2 = bueno, 2-5 = moderado, >5 = malo.
   * UINT16_MAX en raw = reportar como null.
   */
  hdop: number | null;

  /**
   * Vertical Dilution of Precision.
   * Fuente: GPS_RAW_INT.epv / 100.
   */
  vdop: number | null;

  /** true si el fix es suficiente para volar (>= FIX_3D). */
  hasSufficientFix: boolean;
}

/**
 * Estado de la batería principal.
 * Fuente: SYS_STATUS (básico) o BATTERY_STATUS (detallado).
 *
 * Prioridad: usar BATTERY_STATUS si disponible, si no SYS_STATUS.
 */
export interface BatteryTelemetry {
  /**
   * Voltaje total del paquete de baterías.
   * Fuente: SYS_STATUS.voltage_battery / 1000 o BATTERY_STATUS.voltages sum.
   * Unidad: voltios.
   */
  voltageV: number;

  /**
   * Corriente de descarga actual.
   * Fuente: SYS_STATUS.current_battery / 100 o BATTERY_STATUS.current_battery / 100.
   * Unidad: amperios. Null si no hay sensor de corriente.
   */
  currentA: number | null;

  /**
   * Porcentaje de carga restante estimado.
   * Fuente: SYS_STATUS.battery_remaining o BATTERY_STATUS.battery_remaining.
   * Rango: [0, 100]. -1/null en raw = no disponible.
   */
  remainingPercent: number | null;

  /**
   * Capacidad consumida desde el arm.
   * Fuente: BATTERY_STATUS.current_consumed.
   * Unidad: mAh. Null si no disponible.
   */
  consumedMah: number | null;

  /**
   * Nivel de advertencia de batería para el HUD.
   * Calculado desde remainingPercent con umbrales configurables.
   */
  warningLevel: BatteryWarningLevel;
}

/**
 * Nivel de advertencia de batería normalizado para el HUD.
 * Los umbrales numéricos se configuran externamente.
 */
export const BatteryWarningLevel = {
  NORMAL: "NORMAL",   // >30% (configurable)
  LOW: "LOW",      // 15–30%
  CRITICAL: "CRITICAL", // <15%
  UNKNOWN: "UNKNOWN",
} as const;
export type BatteryWarningLevel = typeof BatteryWarningLevel[keyof typeof BatteryWarningLevel];

/**
 * Estado del EKF normalizado para el HUD.
 * Fuente: EKF_STATUS_REPORT (ArduPilot) o ESTIMATOR_STATUS (PX4)
 */
export interface EKFTelemetry {
  /** Estado de salud general del EKF. */
  healthStatus: EKFHealthStatus;

  /** Bitmask original de flags EKF (para display detallado o alertas). */
  flags: number;

  /** Varianza posición horizontal normalizada [0,1]. >0.5 = degradado. */
  posHorizVariance: number | null;

  /** Varianza posición vertical normalizada [0,1]. */
  posVertVariance: number | null;

  /** Varianza velocidad normalizada [0,1]. */
  velocityVariance: number | null;

  /** Varianza compass normalizada [0,1]. */
  compassVariance: number | null;

  /** true si el EKF ha estimado posición horizontal absoluta (GPS fused). */
  hasAbsolutePosition: boolean;
}

/**
 * Modelo de telemetría de vuelo normalizado completo.
 *
 * Este es el objeto que consume el HUD y todos los componentes UI.
 * Se actualiza desde TelemetryRawData mediante la función de normalización.
 *
 * Invariante: todos los valores numéricos son número válido o null explícito.
 * Nunca NaN, nunca undefined salvo campos opcionales marcados.
 */
export interface FlightTelemetry {
  /** Timestamp de cuándo fue calculado este snapshot normalizado (Unix ms). */
  timestamp: number;

  attitude: AttitudeTelemetry;
  velocity: VelocityTelemetry;
  altitude: AltitudeTelemetry;
  navigation: NavigationTelemetry;
  vehicleStatus: VehicleStatusTelemetry;
  gpsStatus: GPSStatusTelemetry;
  battery: BatteryTelemetry;
  ekf: EKFTelemetry;
  controlSurfaces: ControlSurfacesTelemetry;
  controlSurfacesSource?: ControlSurfacesSource;
  /** Recent autopilot status messages, newest first. */
  statusTextMessages: readonly MAVStatusText[];
}

// ============================================================
// SECTION 4 — FLIGHT DERIVED DATA (valores calculados)
// ============================================================

/**
 * Waypoint de misión (referencia para cálculos derivados).
 */
export interface Waypoint {
  index: number;
  latitude: number;
  longitude: number;
  altitudeMSLm: number;
  /** Descripción legible del tipo de waypoint para el HUD. */
  label?: string;
}

/**
 * Datos calculados derivados de FlightTelemetry + contexto de misión.
 *
 * Estos valores se calculan en el GCS, no vienen del autopiloto.
 * Usar para features del HUD que requieren matemáticas adicionales.
 */
export interface FlightDerivedData {
  /**
   * Distancia desde posición actual hasta el waypoint activo.
   * Algoritmo: Haversine.
   * Unidad: metros. Null si no hay waypoint activo.
   */
  distanceToWaypointM: number | null;

  /**
   * Bearing desde posición actual hasta waypoint activo.
   * Rango: [0, 360). Unidad: grados.
   */
  bearingToWaypointDeg: number | null;

  /**
   * Distancia total recorrida desde arm.
   * Integrada por el GCS desde posiciones sucesivas.
   * Unidad: metros.
   */
  totalDistanceTravelledM: number;

  /**
   * Velocidad de ascenso/descenso promediada (filtro EMA).
   * Suaviza el climbRate crudo para el variometer del HUD.
   * Unidad: m/s.
   */
  smoothedClimbRateMs: number;

  /**
   * Tiempo estimado de llegada al siguiente waypoint.
   * Calculado como distanceToWaypointM / groundSpeedMs.
   * Unidad: segundos. Null si velocidad=0 o sin waypoint.
   */
  etaToWaypointSec: number | null;

  /**
   * Tiempo estimado de vuelo restante basado en batería y consumo.
   * Calculado como (consumoRestanteMah / corrienteActualA) * 3600 / 1000.
   * Unidad: segundos. Null si datos de batería insuficientes.
   */
  estimatedFlightTimeRemainingSec: number | null;

  /**
   * Posición del home (punto de despegue / RTL destination).
   * Fuente: HOME_POSITION message (no modelado en raw por simplicidad,
   * se puede extender TelemetryRawData con MAVHomePosition).
   */
  homePosition: { latitude: number; longitude: number; altitudeMSLm: number } | null;

  /**
   * Distancia desde posición actual al home.
   * Unidad: metros.
   */
  distanceToHomeM: number | null;

  /**
   * Bearing desde posición actual al home.
   * Unidad: grados.
   */
  bearingToHomeDeg: number | null;
}

/**
 * Estado completo del sistema de vuelo: telemetría + datos derivados.
 * Punto de entrada único para todas las vistas del HUD.
 */
export interface FlightSystemState {
  telemetry: FlightTelemetry;
  derived: FlightDerivedData;
  /** Waypoint activo de la misión en curso. */
  activeWaypoint: Waypoint | null;
}

// ============================================================
// SECTION 4b — NORMALIZED TELEMETRY (Mission Planner panel fields)
// ============================================================

/**
 * NormalizedTelemetry — Panel de telemetría Mission Planner style.
 *
 * Incluye batería para poder mostrar en PreflightPanel.
 */
export interface NormalizedTelemetry {
  /** Altitud AGL relativa al home. Metros. */
  altitude: number;

  /** Velocidad sobre tierra. m/s. */
  groundSpeed: number;

  /** Velocidad vertical. m/s positivo = subiendo. */
  verticalSpeed: number;

  /** Yaw normalizado [0, 360). Grados. */
  yaw: number;

  /** Distancia al waypoint activo. Metros. Null si no hay misión activa. */
  distToWP: number | null;

  /** Distancia desde home hasta posición actual. Metros. Null si no hay home. */
  distToMAV: number | null;

  /** GPS fix status from GPS_RAW_INT.fix_type. */
  gpsFixStatus: GPSFixType;

  /** true when EKF health is GOOD. false otherwise (DEGRADED/BAD/UNKNOWN). */
  ekfHealthy: boolean;

  /** true if MAVLink heartbeat was received within the last 2 seconds. */
  connected: boolean;

  /** Batería principal normalizada */
  battery?: BatteryTelemetry;

  /** Fuente de velocidad de suelo activa (GPS primario, VFR fallback o estado stale/invalid). */
  speedSource?: 'GPS' | 'VFR_FALLBACK' | 'STALE_HOLD' | 'INVALID';

  /** True cuando hay telemetría reciente y usable para operación. */
  telemetryValid?: boolean;

  /** True cuando hay enlace + telemetría válida + GPS fix 3D o superior. */
  readyForFlight?: boolean;

  /** Motivo de bloqueo operacional cuando readyForFlight=false. */
  blockingReason?: string | null;
}

// ============================================================
// SECTION 5 — DEFAULT VALUES (estado inicial del sistema)
// ============================================================

export {
  DEFAULT_FLIGHT_TELEMETRY,
  DEFAULT_FLIGHT_DERIVED_DATA,
  DEFAULT_NORMALIZED_TELEMETRY,
} from './flightTelemetryDefaults';

// ============================================================
// SECTION 6 — HELPERS MATEMÁTICOS PUROS
// ============================================================

/** Radio medio de la Tierra en metros (WGS-84). */
const EARTH_RADIUS_M = 6_371_000;

/**
 * Convierte radianes a grados.
 * Usado para normalizar datos crudos MAVLink (rad) a la UI (deg).
 *
 * @param rad  Ángulo en radianes.
 * @returns    Ángulo en grados.
 */
export function radToDeg(rad: number): number {
  return rad * (180 / Math.PI);
}

/**
 * Convierte grados a radianes.
 *
 * @param deg  Ángulo en grados.
 * @returns    Ángulo en radianes.
 */
export function degToRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Normaliza un ángulo yaw/heading al rango [0, 360).
 *
 * Necesario porque ATTITUDE.yaw viene en [-π, π] y tras
 * convertir a grados puede dar valores negativos o >360.
 *
 * @param deg  Ángulo en grados (cualquier rango).
 * @returns    Ángulo en grados, rango [0, 360).
 *
 * @example
 *   normalizeYaw(-10)  // → 350
 *   normalizeYaw(370)  // → 10
 *   normalizeYaw(180)  // → 180
 */
export function normalizeYaw(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Normaliza un ángulo pitch al rango [-90, 90].
 * Útil para la escala del indicador de actitud (ADI).
 *
 * @param deg  Pitch en grados.
 * @returns    Pitch clampado a [-90, 90].
 */
export function clampPitch(deg: number): number {
  return Math.max(-90, Math.min(90, deg));
}

/**
 * Calcula la distancia entre dos puntos geográficos usando la fórmula Haversine.
 *
 * Precisión: suficiente para GCS (error <0.5% hasta ~500 km).
 * Para mayor precisión a distancias largas usar Vincenty (más costoso).
 *
 * @param lat1  Latitud punto 1 en grados decimales.
 * @param lon1  Longitud punto 1 en grados decimales.
 * @param lat2  Latitud punto 2 en grados decimales.
 * @param lon2  Longitud punto 2 en grados decimales.
 * @returns     Distancia en metros.
 */
export function haversineDistanceM(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const φ1 = degToRad(lat1);
  const φ2 = degToRad(lat2);
  const Δφ = degToRad(lat2 - lat1);
  const Δλ = degToRad(lon2 - lon1);

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_M * c;
}

/**
 * Calcula el bearing inicial (azimut) desde el punto 1 hacia el punto 2.
 *
 * Bearing "inicial" = dirección al salir del punto 1 hacia punto 2 en
 * la geodésica. En distancias cortas (<100 km) es equivalente al bearing
 * promedio.
 *
 * @param lat1  Latitud origen en grados decimales.
 * @param lon1  Longitud origen en grados decimales.
 * @param lat2  Latitud destino en grados decimales.
 * @param lon2  Longitud destino en grados decimales.
 * @returns     Bearing en grados, rango [0, 360).
 *
 * @example
 *   // Norte:  calculateBearing(0, 0, 1, 0)  → ~0
 *   // Este:   calculateBearing(0, 0, 0, 1)  → ~90
 *   // Sur:    calculateBearing(0, 0, -1, 0) → ~180
 *   // Oeste:  calculateBearing(0, 0, 0, -1) → ~270
 */
export function calculateBearing(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const φ1 = degToRad(lat1);
  const φ2 = degToRad(lat2);
  const Δλ = degToRad(lon2 - lon1);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  const θ = Math.atan2(y, x);

  return normalizeYaw(radToDeg(θ));
}

/**
 * Convierte latitud/longitud en enteros MAVLink (×1e7) a grados decimales.
 * Fuente: GPS_RAW_INT.lat, GLOBAL_POSITION_INT.lat
 *
 * @param raw  Entero ×1e7 (ej: 403521000 → 40.3521°).
 * @returns    Grados decimales.
 */
export function mavLatLonToDeg(raw: number): number {
  return raw / 1e7;
}

/**
 * Convierte altitud en milímetros MAVLink a metros.
 * Fuente: GPS_RAW_INT.alt, GLOBAL_POSITION_INT.alt
 *
 * @param mm  Altitud en milímetros.
 * @returns   Altitud en metros.
 */
export function mavAltToMeters(mm: number): number {
  return mm / 1000;
}

/**
 * Convierte voltaje en mV (MAVLink SYS_STATUS) a voltios.
 *
 * @param mv  Voltaje en milivoltios.
 * @returns   Voltaje en voltios.
 */
export function mavVoltageToVolts(mv: number): number {
  return mv / 1000;
}

/**
 * Convierte corriente en cA (10 mA) MAVLink a amperios.
 *
 * @param ca  Corriente en centi-amperios.
 * @returns   Corriente en amperios.
 */
export function mavCurrentToAmps(ca: number): number {
  return ca / 100;
}

/**
 * Extrae el estado de armado desde el bitmask base_mode de HEARTBEAT.
 * Bit 7 (0x80) = MAV_MODE_FLAG_SAFETY_ARMED.
 *
 * @param baseMode  HEARTBEAT.base_mode (uint8).
 * @returns         ArmState.ARMED si el bit 7 está activo.
 */
export function parseArmState(baseMode: number): ArmState {
  return (baseMode & 0x80) !== 0 ? ArmState.ARMED : ArmState.DISARMED;
}

/**
 * Determina el nivel de advertencia de batería.
 * Los umbrales son configurables y están separados del modelo.
 *
 * @param remainingPercent  Porcentaje [0,100] o null.
 * @param lowThreshold      Umbral de LOW (default: 30%).
 * @param criticalThreshold Umbral de CRITICAL (default: 15%).
 * @returns                 Nivel de advertencia.
 */
export function classifyBatteryLevel(
  remainingPercent: number | null,
  lowThreshold = 30,
  criticalThreshold = 15,
): BatteryWarningLevel {
  if (remainingPercent === null) return BatteryWarningLevel.UNKNOWN;
  if (remainingPercent <= criticalThreshold) return BatteryWarningLevel.CRITICAL;
  if (remainingPercent <= lowThreshold) return BatteryWarningLevel.LOW;
  return BatteryWarningLevel.NORMAL;
}

/**
 * Determina el estado de salud EKF desde el bitmask de flags.
 *
 * Lógica:
 *   - GOOD:     actitud + velocidad horizontal + posición horizontal absoluta OK.
 *   - DEGRADED: actitud OK pero algún estimador secundario falla.
 *   - BAD:      actitud no estimada.
 *
 * @param flags    Bitmask EKF_STATUS_REPORT.flags.
 * @returns        EKFHealthStatus.
 */
export function classifyEKFHealth(flags: number): EKFHealthStatus {
  const hasAttitude = (flags & EKFStatusFlag.ATTITUDE) !== 0;
  const hasVelHoriz = (flags & EKFStatusFlag.VELOCITY_HORIZ) !== 0;
  const hasPosHorizAbs = (flags & EKFStatusFlag.POS_HORIZ_ABS) !== 0;

  if (!hasAttitude) return EKFHealthStatus.BAD;
  if (hasVelHoriz && hasPosHorizAbs) return EKFHealthStatus.GOOD;
  return EKFHealthStatus.DEGRADED;
}

/**
 * Verifica si el heartbeat está vigente.
 * Un heartbeat se considera "activo" si fue recibido en los últimos 3000 ms.
 *
 * @param lastHeartbeatMs  Timestamp Unix en ms del último heartbeat recibido.
 * @param nowMs            Timestamp actual en ms (Date.now()).
 * @param timeoutMs        Timeout en ms (default 3000).
 * @returns                true si el enlace está activo.
 */
export function isHeartbeatActive(
  lastHeartbeatMs: number,
  nowMs: number,
  timeoutMs = 3000,
): boolean {
  return lastHeartbeatMs > 0 && (nowMs - lastHeartbeatMs) < timeoutMs;
}

/**
 * Aplica filtro EMA (Exponential Moving Average) para suavizar señales
 * ruidosas como el climbRate.
 *
 * @param previous  Valor anterior del EMA.
 * @param current   Nuevo valor de entrada.
 * @param alpha     Factor de suavizado [0,1]. Más alto = más reactivo.
 * @returns         Nuevo valor EMA.
 *
 * @example
 *   let smoothClimb = 0;
 *   smoothClimb = emaFilter(smoothClimb, rawClimbRate, 0.15);
 */
export function emaFilter(previous: number, current: number, alpha: number): number {
  return alpha * current + (1 - alpha) * previous;
}
