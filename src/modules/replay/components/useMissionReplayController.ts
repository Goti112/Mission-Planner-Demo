import { useCallback, useMemo } from 'react';

import {
  useFlightRecorderStore,
  type DroneRecording,
  MAX_FRAMES_PER_DRONE,
  FRAME_FIELDS,
  F,
  RECORD_HZ,
} from '../store/flightRecorderStore';
import { useReplayTrajectoryStore } from '../store/replayTrajectoryStore';
import { useDroneStore } from '../../drone';
import { useUIStore } from '../../../shared/store/uiStore';
import { framesToDuration, frameIndexToTime } from '../../../utils/telemetryFileIO';

// ── Constants ──────────────────────────────────────────────────────────────

const MAPBOX_STYLES: Record<string, string> = {
  streets: 'mapbox://styles/mapbox/streets-v11',
  satellite: 'mapbox://styles/mapbox/satellite-v9',
  hybrid: 'mapbox://styles/mapbox/satellite-streets-v11',
  dark: 'mapbox://styles/mapbox/dark-v11',
};

const TRACK_MIN_DELTA_DEG = 0.0000001;

// ── Pure helpers ──────────────────────────────────────────────────────────

function normalizeHeadingDeg(value: number): number {
  const wrapped = value % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

function computeTrackHeadingDeg(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const avgLatRad = ((from.lat + to.lat) * 0.5 * Math.PI) / 180;
  const dNorth = to.lat - from.lat;
  const dEast = (to.lng - from.lng) * Math.cos(avgLatRad);
  return normalizeHeadingDeg((Math.atan2(dEast, dNorth) * 180) / Math.PI);
}

// ── Seek helper ────────────────────────────────────────────────────────────

export function seekToFrame(
  idx: number,
  droneId: string | null,
  recordings: Record<string, DroneRecording>,
  recordedIds: string[],
): void {
  const updateDrone = useDroneStore.getState().updateDrone;
  const ids = droneId ? [droneId] : recordedIds;

  for (const id of ids) {
    const rec = recordings[id];
    if (!rec) continue;
    const fc = Math.min(rec.total, MAX_FRAMES_PER_DRONE);
    const safeIdx = Math.max(0, Math.min(idx, fc - 1));

    const ringOffset = rec.total > MAX_FRAMES_PER_DRONE ? rec.cursor : 0;
    const slot = (ringOffset + safeIdx) % MAX_FRAMES_PER_DRONE;
    const base = slot * FRAME_FIELDS;

    updateDrone(id, {
      lat: rec.frames[base + F.LAT],
      lng: rec.frames[base + F.LNG],
      altitude: rec.frames[base + F.ALT],
      roll: rec.frames[base + F.ROLL],
      pitch: rec.frames[base + F.PITCH],
      yaw: rec.frames[base + F.YAW],
      airspeed: rec.frames[base + F.AIRSPEED],
      groundspeed: rec.frames[base + F.GROUNDSPEED],
      battery: rec.frames[base + F.BATTERY],
    });
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

export type ReplayDroneSnapshot = {
  readonly lat: number;
  readonly lng: number;
  readonly altitude: number;
  readonly yaw: number;
  readonly airspeed: number;
  readonly groundspeed: number;
  readonly battery: number;
};

export type UseMissionReplayControllerInput = {
  readonly recordings: Record<string, DroneRecording>;
  readonly replayState: string;
  readonly replayIndex: number;
  readonly replaySpeed: number;
  readonly replayDroneId: string | null;
  readonly dronesObj: Readonly<Record<string, {
    readonly id: string;
    readonly lat: number;
    readonly lng: number;
    readonly altitude: number;
    readonly yaw: number;
    readonly roll: number;
    readonly pitch: number;
    readonly airspeed: number;
    readonly groundspeed: number;
    readonly battery: number;
    readonly name: string;
    readonly active: boolean;
  }>>;
  readonly mapStyle: string;
  readonly allPoints: readonly { lat: number; lng: number; alt: number }[];
  readonly visibleCount: number;
};

export type UseMissionReplayControllerReturn = {
  readonly recordedIds: string[];
  readonly effectiveDroneId: string | null;
  readonly maxFrames: number;
  readonly hasData: boolean;
  readonly isPlaying: boolean;
  readonly isPaused: boolean;
  readonly isReplaying: boolean;
  readonly currentDrone: ReplayDroneSnapshot | null;
  readonly currentTime: string;
  readonly totalDuration: string;
  readonly missionTimeMM: string;
  readonly missionTimeSS: string;
  readonly scrubPercent: number;
  readonly progressPercent: number;
  readonly headingDeg: number;
  readonly headingLabel: string;
  readonly stateLabel: string;
  readonly stateDot: string;
  readonly missionName: string;
  readonly styleUrl: string;
  readonly replayTrackHeading: number;
  readonly handleBack: () => void;
  readonly handlePlayPause: () => void;
  readonly handleStop: () => void;
  readonly handleReset: () => void;
  readonly handleScrubStart: () => void;
  readonly handleScrub: (e: React.ChangeEvent<HTMLInputElement>) => void;
  readonly handleSpeedChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
};

// ── Hook ───────────────────────────────────────────────────────────────────

export const useMissionReplayController = (
  input: UseMissionReplayControllerInput,
): UseMissionReplayControllerReturn => {
  const {
    recordings,
    replayState,
    replayIndex,
    replayDroneId,
    dronesObj,
    mapStyle,
    allPoints,
    visibleCount,
  } = input;

  const startReplay = useFlightRecorderStore(s => s.startReplay);
  const stopReplay = useFlightRecorderStore(s => s.stopReplay);
  const pauseReplay = useFlightRecorderStore(s => s.pauseReplay);
  const resumeReplay = useFlightRecorderStore(s => s.resumeReplay);
  const setReplayIndex = useFlightRecorderStore(s => s.setReplayIndex);
  const setReplaySpeed = useFlightRecorderStore(s => s.setReplaySpeed);
  const syncToFrame = useReplayTrajectoryStore(s => s.syncToFrame);
  const setCurrentView = useUIStore(s => s.setCurrentView);

  // ── Derived ────────────────────────────────────────────────────────────

  const recordedIds = useMemo(() => Object.keys(recordings), [recordings]);

  const effectiveDroneId = replayDroneId ?? recordedIds[0] ?? null;

  const maxFrames = useMemo(() => {
    const ids = effectiveDroneId ? [effectiveDroneId] : recordedIds;
    return ids.reduce((max, id) => {
      const rec = recordings[id];
      if (!rec) return max;
      return Math.max(max, Math.min(rec.total, MAX_FRAMES_PER_DRONE));
    }, 0);
  }, [recordings, effectiveDroneId, recordedIds]);

  const hasData = maxFrames >= 2;
  const isPlaying = replayState === 'PLAYING';
  const isPaused = replayState === 'PAUSED';
  const isReplaying = replayState !== 'IDLE';

  const currentDrone: ReplayDroneSnapshot | null = useMemo(() => {
    if (!effectiveDroneId) return null;
    const drone = dronesObj[effectiveDroneId];
    if (!drone) return null;
    return {
      lat: drone.lat,
      lng: drone.lng,
      altitude: drone.altitude,
      yaw: drone.yaw,
      airspeed: drone.airspeed,
      groundspeed: drone.groundspeed,
      battery: drone.battery,
    };
  }, [dronesObj, effectiveDroneId]);

  const currentTime = frameIndexToTime(replayIndex);
  const totalDuration = framesToDuration(maxFrames);

  const elapsedSec = Math.floor(replayIndex / RECORD_HZ);
  const missionTimeMM = Math.floor(elapsedSec / 60).toString().padStart(2, '0');
  const missionTimeSS = (elapsedSec % 60).toString().padStart(2, '0');

  const scrubPercent = maxFrames > 1
    ? (Math.floor(replayIndex) / (maxFrames - 1)) * 100
    : 0;

  const progressPercent = maxFrames > 1
    ? Math.round((Math.floor(replayIndex) / (maxFrames - 1)) * 100)
    : 0;

  const headingDeg = ((currentDrone?.yaw ?? 0) + 360) % 360;

  const headingLabel = (() => {
    if (headingDeg < 22.5 || headingDeg >= 337.5) return 'N';
    if (headingDeg < 67.5) return 'NE';
    if (headingDeg < 112.5) return 'E';
    if (headingDeg < 157.5) return 'SE';
    if (headingDeg < 202.5) return 'S';
    if (headingDeg < 247.5) return 'SW';
    if (headingDeg < 292.5) return 'W';
    return 'NW';
  })();

  const stateLabel = isPlaying ? 'REPRODUCIENDO' : isPaused ? 'PAUSADO' : 'DETENIDO';
  const stateDot = isPlaying
    ? 'mrv__state-dot--playing'
    : isPaused
      ? 'mrv__state-dot--paused'
      : 'mrv__state-dot--idle';

  const missionName = (effectiveDroneId && recordings[effectiveDroneId]?.missionName)
    || effectiveDroneId
    || '—';

  const styleUrl = MAPBOX_STYLES[mapStyle] || MAPBOX_STYLES.dark;

  const replayTrackHeading = useMemo(() => {
    if (allPoints.length < 2 || visibleCount < 2) {
      return normalizeHeadingDeg(currentDrone?.yaw ?? 0);
    }

    const endIdx = Math.min(visibleCount - 1, allPoints.length - 1);
    const prevIdx = Math.max(0, endIdx - 1);
    const from = allPoints[prevIdx];
    const to = allPoints[endIdx];
    const moved =
      Math.abs(to.lat - from.lat) > TRACK_MIN_DELTA_DEG ||
      Math.abs(to.lng - from.lng) > TRACK_MIN_DELTA_DEG;

    if (!moved) return normalizeHeadingDeg(currentDrone?.yaw ?? 0);
    return computeTrackHeadingDeg(from, to);
  }, [allPoints, visibleCount, currentDrone?.yaw]);

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleBack = useCallback(() => {
    stopReplay();
    setCurrentView('FLIGHT');
  }, [stopReplay, setCurrentView]);

  const handlePlayPause = useCallback(() => {
    if (replayState === 'IDLE') {
      if (!hasData) return;
      startReplay(effectiveDroneId ?? undefined);
    } else if (isPlaying) {
      pauseReplay();
    } else {
      resumeReplay();
    }
  }, [replayState, hasData, isPlaying, startReplay, pauseReplay, resumeReplay, effectiveDroneId]);

  const handleStop = useCallback(() => stopReplay(), [stopReplay]);

  const handleReset = useCallback(() => {
    stopReplay();
    setReplayIndex(0);
    seekToFrame(0, effectiveDroneId, recordings, recordedIds);
    syncToFrame(0);
  }, [stopReplay, setReplayIndex, effectiveDroneId, recordings, recordedIds, syncToFrame]);

  const handleScrubStart = useCallback(() => {
    if (isPlaying) pauseReplay();
  }, [isPlaying, pauseReplay]);

  const handleScrub = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const idx = parseFloat(e.target.value);
      setReplayIndex(idx);
      seekToFrame(Math.floor(idx), effectiveDroneId, recordings, recordedIds);
      syncToFrame(Math.floor(idx));
      if (import.meta.env.DEV) {
        const pct = maxFrames > 0 ? ((idx / maxFrames) * 100).toFixed(1) : '0';
        console.log(`🎯 [ReplayViewer] user scrubbed  → frame ${Math.floor(idx)} (${pct}%) — syncing all renderers`);
      }
    },
    [effectiveDroneId, recordings, recordedIds, setReplayIndex, syncToFrame, maxFrames],
  );

  const handleSpeedChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setReplaySpeed(parseFloat(e.target.value));
    },
    [setReplaySpeed],
  );

  return {
    recordedIds,
    effectiveDroneId,
    maxFrames,
    hasData,
    isPlaying,
    isPaused,
    isReplaying,
    currentDrone,
    currentTime,
    totalDuration,
    missionTimeMM,
    missionTimeSS,
    scrubPercent,
    progressPercent,
    headingDeg,
    headingLabel,
    stateLabel,
    stateDot,
    missionName,
    styleUrl,
    replayTrackHeading,
    handleBack,
    handlePlayPause,
    handleStop,
    handleReset,
    handleScrubStart,
    handleScrub,
    handleSpeedChange,
  };
};
