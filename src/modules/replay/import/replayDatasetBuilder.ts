import type {
  DecodedLogMessage,
  ReplayDataset,
  ReplayEventMarker,
  ReplayImportDiagnostics,
  ReplayLogSource,
  ReplayPlotSeries,
  ReplayTrackSample,
  ReplayVehicleDataset,
  ReplayVehicleSummary,
} from './logImportTypes';

interface PartialTrackState {
  lat: number | null;
  lng: number | null;
  altitudeM: number | null;
  rollDeg: number | null;
  pitchDeg: number | null;
  yawDeg: number | null;
  airspeedMs: number | null;
  groundspeedMs: number | null;
  batteryPercent: number | null;
  vxMs: number | null;
  vyMs: number | null;
  vzMs: number | null;
}

const EMPTY_STATE: PartialTrackState = {
  lat: null,
  lng: null,
  altitudeM: null,
  rollDeg: null,
  pitchDeg: null,
  yawDeg: null,
  airspeedMs: null,
  groundspeedMs: null,
  batteryPercent: null,
  vxMs: null,
  vyMs: null,
  vzMs: null,
};

function vehicleIdFor(message: DecodedLogMessage): string {
  return `sys-${message.sysId ?? 1}`;
}

function messageTimeMs(message: DecodedLogMessage): number | null {
  return message.timestampMs ?? message.relativeTimeMs;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function updateTrackState(state: PartialTrackState, message: DecodedLogMessage): PartialTrackState {
  const payload = message.payload;
  if (message.type === 'GLOBAL_POSITION_INT') {
    return {
      ...state,
      lat: finiteNumber(payload.lat) ?? state.lat,
      lng: finiteNumber(payload.lng) ?? state.lng,
      altitudeM: finiteNumber(payload.altitudeRelativeM) ?? finiteNumber(payload.altitudeMslM) ?? state.altitudeM,
      groundspeedMs: state.groundspeedMs,
      vxMs: finiteNumber(payload.vxMs) ?? state.vxMs,
      vyMs: finiteNumber(payload.vyMs) ?? state.vyMs,
      vzMs: finiteNumber(payload.vzMs) ?? state.vzMs,
      yawDeg: finiteNumber(payload.headingDeg) ?? state.yawDeg,
    };
  }
  if (message.type === 'GPS') {
    return {
      ...state,
      lat: finiteNumber(payload.lat) ?? state.lat,
      lng: finiteNumber(payload.lng) ?? state.lng,
      altitudeM: finiteNumber(payload.altitudeM) ?? state.altitudeM,
      groundspeedMs: finiteNumber(payload.groundspeedMs) ?? state.groundspeedMs,
      yawDeg: finiteNumber(payload.headingDeg) ?? state.yawDeg,
    };
  }
  if (message.type === 'ATTITUDE' || message.type === 'ATT') {
    return {
      ...state,
      rollDeg: finiteNumber(payload.rollDeg) ?? state.rollDeg,
      pitchDeg: finiteNumber(payload.pitchDeg) ?? state.pitchDeg,
      yawDeg: finiteNumber(payload.yawDeg) ?? state.yawDeg,
    };
  }
  if (message.type === 'VFR_HUD') {
    return {
      ...state,
      airspeedMs: finiteNumber(payload.airspeedMs) ?? state.airspeedMs,
      groundspeedMs: finiteNumber(payload.groundspeedMs) ?? state.groundspeedMs,
      altitudeM: finiteNumber(payload.altitudeMslM) ?? state.altitudeM,
    };
  }
  if (message.type === 'SYS_STATUS') {
    return {
      ...state,
      batteryPercent: finiteNumber(payload.batteryRemainingPercent) ?? state.batteryPercent,
    };
  }
  if (message.type === 'MISSION_SAMPLE') {
    return {
      ...state,
      lat: finiteNumber(payload.lat) ?? state.lat,
      lng: finiteNumber(payload.lng) ?? state.lng,
      altitudeM: finiteNumber(payload.altitudeM) ?? state.altitudeM,
      rollDeg: finiteNumber(payload.rollDeg) ?? state.rollDeg,
      pitchDeg: finiteNumber(payload.pitchDeg) ?? state.pitchDeg,
      yawDeg: finiteNumber(payload.yawDeg) ?? state.yawDeg,
      airspeedMs: finiteNumber(payload.airspeedMs) ?? state.airspeedMs,
      groundspeedMs: finiteNumber(payload.groundspeedMs) ?? state.groundspeedMs,
      batteryPercent: finiteNumber(payload.batteryPercent) ?? state.batteryPercent,
      vxMs: finiteNumber(payload.vxMs) ?? state.vxMs,
      vyMs: finiteNumber(payload.vyMs) ?? state.vyMs,
      vzMs: finiteNumber(payload.vzMs) ?? state.vzMs,
    };
  }
  return state;
}

function hasReplayPosition(state: PartialTrackState): boolean {
  return state.lat !== null && state.lng !== null && state.altitudeM !== null;
}

function messageProvidesPosition(message: DecodedLogMessage): boolean {
  return message.type === 'GPS' || message.type === 'GLOBAL_POSITION_INT' || message.type === 'VFR_HUD' || message.type === 'MISSION_SAMPLE';
}

function sampleFromState(timestampMs: number, state: PartialTrackState): ReplayTrackSample {
  return {
    timestampMs,
    lat: state.lat ?? 0,
    lng: state.lng ?? 0,
    altitudeM: state.altitudeM ?? 0,
    rollDeg: state.rollDeg ?? 0,
    pitchDeg: state.pitchDeg ?? 0,
    yawDeg: state.yawDeg ?? 0,
    airspeedMs: state.airspeedMs ?? 0,
    groundspeedMs: state.groundspeedMs ?? 0,
    batteryPercent: state.batteryPercent ?? 0,
    vxMs: state.vxMs ?? 0,
    vyMs: state.vyMs ?? 0,
    vzMs: state.vzMs ?? 0,
  };
}

function buildSummary(track: ReplayTrackSample[], modes: string[]): ReplayVehicleSummary {
  const durationSec = track.length >= 2 ? (track[track.length - 1].timestampMs - track[0].timestampMs) / 1000 : 0;
  const altitudes = track.map((sample) => sample.altitudeM);
  const speeds = track.map((sample) => sample.groundspeedMs);
  const batteries = track.map((sample) => sample.batteryPercent).filter((value) => value > 0);
  return {
    durationSec,
    distanceM: 0,
    minAltitudeM: altitudes.length > 0 ? Math.min(...altitudes) : null,
    maxAltitudeM: altitudes.length > 0 ? Math.max(...altitudes) : null,
    maxGroundspeedMs: speeds.length > 0 ? Math.max(...speeds) : null,
    averageGroundspeedMs: speeds.length > 0 ? speeds.reduce((sum, value) => sum + value, 0) / speeds.length : null,
    initialBatteryPercent: batteries[0] ?? null,
    finalBatteryPercent: batteries[batteries.length - 1] ?? null,
    gpsFixCoveragePercent: null,
    flightModes: modes,
  };
}

function addPlotSeries(series: ReplayPlotSeries[], vehicleId: string, message: DecodedLogMessage): void {
  const timestampMs = messageTimeMs(message);
  for (const [field, value] of Object.entries(message.payload)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || timestampMs === null) continue;
    const id = `${vehicleId}:${message.type}:${field}`;
    let target = series.find((item) => item.id === id);
    if (!target) {
      target = {
        id,
        vehicleId,
        group: message.type,
        field,
        label: `${message.type}.${field}`,
        unit: '',
        points: [],
      };
      series.push(target);
    }
    target.points.push({ timestampMs, value });
  }
}

function makeEvent(message: DecodedLogMessage, index: number): ReplayEventMarker | null {
  if (message.type !== 'MSG' && message.type !== 'STATUSTEXT') return null;
  return {
    id: `event-${index}`,
    timestampMs: messageTimeMs(message) ?? 0,
    vehicleId: message.sysId === null ? null : `sys-${message.sysId}`,
    severity: 'INFO',
    label: message.type,
    detail: String(message.payload.message ?? message.payload.text ?? ''),
  };
}

export function buildReplayDataset(
  source: ReplayLogSource,
  messages: DecodedLogMessage[],
  diagnostics: ReplayImportDiagnostics,
): ReplayDataset {
  const sorted = [...messages].sort((a, b) => (messageTimeMs(a) ?? 0) - (messageTimeMs(b) ?? 0));
  const states: Record<string, PartialTrackState> = {};
  const tracks: Record<string, ReplayTrackSample[]> = {};
  const counts: Record<string, Record<string, number>> = {};
  const compIds: Record<string, Set<number>> = {};
  const modes: Record<string, string[]> = {};
  const plotSeries: ReplayPlotSeries[] = [];
  const events: ReplayEventMarker[] = [];

  sorted.forEach((message, index) => {
    const vehicleId = vehicleIdFor(message);
    states[vehicleId] = updateTrackState(states[vehicleId] ?? EMPTY_STATE, message);
    tracks[vehicleId] = tracks[vehicleId] ?? [];
    counts[vehicleId] = counts[vehicleId] ?? {};
    compIds[vehicleId] = compIds[vehicleId] ?? new Set<number>();
    modes[vehicleId] = modes[vehicleId] ?? [];
    counts[vehicleId][message.type] = (counts[vehicleId][message.type] ?? 0) + 1;
    if (message.compId !== null) compIds[vehicleId].add(message.compId);
    if (message.type === 'MODE') modes[vehicleId].push(String(message.payload.mode ?? message.payload.modeNum ?? 'UNKNOWN'));
    addPlotSeries(plotSeries, vehicleId, message);
    const event = makeEvent(message, index);
    if (event) events.push(event);
    const timestampMs = messageTimeMs(message);
    if (timestampMs !== null && messageProvidesPosition(message) && hasReplayPosition(states[vehicleId])) {
      tracks[vehicleId].push(sampleFromState(timestampMs, states[vehicleId]));
    }
  });

  const vehicles: Record<string, ReplayVehicleDataset> = {};
  for (const [vehicleId, track] of Object.entries(tracks)) {
    if (track.length < 1) continue;
    vehicles[vehicleId] = {
      vehicleId,
      sysId: Number(vehicleId.replace('sys-', '')),
      compIds: Array.from(compIds[vehicleId] ?? []),
      messageCounts: counts[vehicleId] ?? {},
      track,
      summary: buildSummary(track, modes[vehicleId] ?? []),
    };
  }

  return {
    source,
    diagnostics,
    vehicles,
    events,
    plotSeries,
  };
}
