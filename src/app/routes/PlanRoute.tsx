import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DroneEntity } from '../../modules/drone/core/DroneEntity';
import { PUBLIC_ASSET_URLS } from '../../shared/utils/publicAssetUrl';
import { droneRuntime, useDroneStore } from '../../modules/drone';
import { LazyCesiumGlobe, MapContainer, MapToolbar } from '../../modules/map';
import {
  MissionPlanningWorkbench,
  MissionValidationModal,
  appendMapPolygonVertex,
  buildRallyDraftFromCoordinate,
  buildLegacyWaypointsFromMissionPlan,
  droneMissionController,
  evaluateMissionPlanExecution,
  exportPlannerMissionToJson,
  readPlannerMissionJson,
  updatePolygonFenceVertex,
  updateRallyPointCoordinate,
  useAdvancedLayerUiStore,
  useMissionPlanStore,
  useMissionStore,
  type MissionCoordinate,
  type MissionHome,
  type MissionItem,
  type MissionPlanExecutionIssue,
  type PlannerMissionRecord,
  type ValidationResult,
} from '../../modules/mission';
import { useUIStore } from '../../shared/store/uiStore';
import type { Waypoint } from '../../types/mission';
import './PlanRoute.css';

import { buildPlanRouteAdvancedLayers } from './planRouteAdvancedLayers';
import { usePlanRouteModel, selectedMissionRecord } from './usePlanRouteModel';



const createMapAdvancedId = (scope: string): string =>
  `${scope}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000).toString(36)}`;

const normalizeLongitude = (lng: number): number => {
  const wrapped = ((lng + 180) % 360 + 360) % 360 - 180;

  return Object.is(wrapped, -0) ? 0 : wrapped;
};

const mapClickCoordinateToMissionCoordinate = (
  coords: { readonly lat: number; readonly lng: number },
  altitudeM: number,
): MissionCoordinate => {
  if (!Number.isFinite(coords.lat) || coords.lat < -90 || coords.lat > 90) {
    throw new Error(`Cannot place advanced map point because map click latitude is invalid; lat=${coords.lat.toString()}.`);
  }

  if (!Number.isFinite(coords.lng)) {
    throw new Error(`Cannot place advanced map point because map click longitude is invalid; lng=${coords.lng.toString()}.`);
  }

  if (!Number.isFinite(altitudeM) || altitudeM < 0) {
    throw new Error(`Cannot place advanced map point because default altitude is invalid; altitudeM=${altitudeM.toString()}.`);
  }

  return {
    lat: coords.lat,
    lng: normalizeLongitude(coords.lng),
    alt: altitudeM,
  };
};



interface DragPreview {
  readonly wpId: string;
  readonly lat: number;
  readonly lng: number;
}

interface MapFramePoint {
  readonly lat: number;
  readonly lng: number;
}

interface HomeMarker {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  readonly altitudeM: number;
}

const isValidMapFramePoint = (point: MapFramePoint): boolean =>
  Number.isFinite(point.lat) &&
  point.lat >= -90 &&
  point.lat <= 90 &&
  Number.isFinite(point.lng) &&
  point.lng >= -180 &&
  point.lng <= 180;

const issueToMessage = (issue: MissionPlanExecutionIssue): string => {
  if (issue.seq === null) {
    return issue.message;
  }

  return `#${issue.seq + 1} ${issue.message}`;
};

const issuesToValidationResult = (
  errors: readonly MissionPlanExecutionIssue[],
  warnings: readonly MissionPlanExecutionIssue[],
): ValidationResult => ({
  isValid: errors.length === 0,
  errors: errors.map(issueToMessage),
  warnings: warnings.map(issueToMessage),
});

const downloadableFileName = (name: string): string => {
  const normalizedName = name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalizedName.length === 0 ? 'mission' : normalizedName;
};

const downloadTextFile = (fileName: string, content: string): void => {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

const findPlanItem = (mission: PlannerMissionRecord | null, itemId: string): MissionItem | null => {
  if (mission === null) {
    return null;
  }

  return mission.plan.items.find((item) => item.id === itemId) ?? null;
};

const homeMarkerFromMission = (mission: PlannerMissionRecord | null): HomeMarker | null => {
  if (mission?.plan.home === null || mission?.plan.home === undefined) {
    return null;
  }

  return {
    id: `${mission.id}:home`,
    lat: mission.plan.home.lat,
    lng: mission.plan.home.lng,
    altitudeM: mission.plan.home.alt,
  };
};

const prependHomeToRoute = (
  home: HomeMarker | null,
  waypoints: readonly Waypoint[],
): { lat: number; lng: number }[] => {
  if (home === null || waypoints.length === 0) {
    return waypoints.map((waypoint) => ({ lat: waypoint.lat, lng: waypoint.lng }));
  }

  return [
    { lat: home.lat, lng: home.lng },
    ...waypoints.map((waypoint) => ({ lat: waypoint.lat, lng: waypoint.lng })),
  ];
};

const applyDragPreview = (
  waypoints: readonly Waypoint[],
  preview: DragPreview | null,
): readonly Waypoint[] => {
  if (preview === null) {
    return waypoints;
  }

  return waypoints.map((waypoint) =>
    waypoint.id === preview.wpId
      ? {
          ...waypoint,
          lat: preview.lat,
          lng: preview.lng,
        }
      : waypoint,
  );
};

export default function PlanRoute() {
  const dronesObj = useDroneStore((state) => state.drones);
  const legacyMissions = useMissionStore((state) => state.missions);
  const createLegacyMission = useMissionStore((state) => state.createMission);
  const addLegacyWaypoint = useMissionStore((state) => state.addWaypoint);
  const removeLegacyWaypoint = useMissionStore((state) => state.removeWaypoint);
  const plannerMissions = useMissionPlanStore((state) => state.missions);
  const plannerSelectedDroneId = useMissionPlanStore((state) => state.selectedDroneId);
  const plannerSelectedMissionId = useMissionPlanStore((state) => state.selectedMissionId);
  const plannerSelectedItemId = useMissionPlanStore((state) => state.selectedItemId);
  const updatePlannerItem = useMissionPlanStore((state) => state.updateItem);
  const selectPlannerItem = useMissionPlanStore((state) => state.selectItem);
  const updatePlannerHome = useMissionPlanStore((state) => state.updateHome);
  const setAdvancedPlan = useMissionPlanStore((state) => state.setAdvancedPlan);
  const addPlannerRallyPoint = useMissionPlanStore((state) => state.addRallyPoint);
  const setLegacyMissionId = useMissionPlanStore((state) => state.setLegacyMissionId);
  const setPlannerMissionStatus = useMissionPlanStore((state) => state.setMissionStatus);
  const activeAdvancedTool = useAdvancedLayerUiStore((state) => state.activeAdvancedTool);
  const selectedAdvancedLayer = useAdvancedLayerUiStore((state) => state.selectedAdvancedLayer);
  const toggleSourceMissionItem = useAdvancedLayerUiStore((state) => state.toggleSourceMissionItem);
  const selectAdvancedLayer = useAdvancedLayerUiStore((state) => state.selectAdvancedLayer);
  const resetAdvancedLayerUi = useAdvancedLayerUiStore((state) => state.resetAdvancedLayerUi);
  const mapStyle = useUIStore((state) => state.mapStyle);
  const show3D = useUIStore((state) => state.show3D);
  const show3DBuildings = useUIStore((state) => state.show3DBuildings);
  const dragPreviewRef = useRef<DragPreview | null>(null);
  const rafHandleRef = useRef<number | undefined>(undefined);
  const [pathPreview, setPathPreview] = useState<DragPreview | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const mapPolygonDraft = useAdvancedLayerUiStore((state) => state.mapPolygonDraft);
  const setMapPolygonDraft = useAdvancedLayerUiStore((state) => state.setMapPolygonDraft);

  const {
    initialSelectedDroneId,
    effectiveDroneId,
    activePlannerDrone,
    selectedMission,
    droneOptions,
    defaultCoordinate,
  } = usePlanRouteModel({
    dronesObj,
    plannerSelectedDroneId,
    plannerSelectedMissionId,
    plannerMissions,
  });

  useEffect(() => {
    droneMissionController.syncEntitiesWithStore();
  }, [dronesObj]);

  useEffect(
    () => () => {
      if (rafHandleRef.current !== undefined) {
        cancelAnimationFrame(rafHandleRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (selectedMission === null || selectedMission.legacyMissionId === null) {
      return;
    }

    const legacyMission = legacyMissions[selectedMission.legacyMissionId];

    if (legacyMission === undefined) {
      return;
    }

    if (
      selectedMission.status !== legacyMission.status ||
      selectedMission.currentItemIndex !== legacyMission.currentWpIndex ||
      selectedMission.progress !== legacyMission.progress
    ) {
      setPlannerMissionStatus(
        selectedMission.id,
        legacyMission.status,
        legacyMission.currentWpIndex,
        legacyMission.progress,
      );
    }
  }, [legacyMissions, selectedMission, setPlannerMissionStatus]);

  useEffect(() => {
    resetAdvancedLayerUi();
  }, [plannerSelectedMissionId, resetAdvancedLayerUi]);



  const legacyProjection = useMemo(
    () => (selectedMission === null ? null : buildLegacyWaypointsFromMissionPlan(selectedMission.plan)),
    [selectedMission],
  );

  const waypointsWithPreview = useMemo<readonly Waypoint[]>(
    () => applyDragPreview(legacyProjection?.waypoints ?? [], pathPreview),
    [legacyProjection, pathPreview],
  );

  const waypointMarkers = useMemo(
    () =>
      (legacyProjection?.waypoints ?? []).map((waypoint, index) => ({
        id: waypoint.id,
        lat: waypoint.lat,
        lng: waypoint.lng,
        index,
        altitudeM: waypoint.altitude,
        isCurrent: selectedMission?.status === 'running' && index === selectedMission.currentItemIndex,
      })),
    [legacyProjection, selectedMission],
  );

  const homeMarker = useMemo(() => homeMarkerFromMission(selectedMission), [selectedMission]);

  const missionFramePoints = useMemo<readonly MapFramePoint[]>(() => {
    const points = waypointMarkers.map((waypoint) => ({ lat: waypoint.lat, lng: waypoint.lng }));

    return homeMarker === null ? points : [{ lat: homeMarker.lat, lng: homeMarker.lng }, ...points];
  }, [homeMarker, waypointMarkers]);

  const activeVehicleFramePoint: MapFramePoint | null = useMemo(
    () => activePlannerDrone === null ? null : { lat: activePlannerDrone.lat, lng: activePlannerDrone.lng },
    [activePlannerDrone],
  );

  const activeHomeFramePoint: MapFramePoint | null = useMemo(() => {
    if (homeMarker !== null) {
      const plannedHomeFramePoint = { lat: homeMarker.lat, lng: homeMarker.lng };

      return isValidMapFramePoint(plannedHomeFramePoint) ? plannedHomeFramePoint : null;
    }

    if (effectiveDroneId === null) {
      return null;
    }

    const homePosition = droneRuntime.getHomePosition(effectiveDroneId);

    if (homePosition === null) {
      return null;
    }

    const homeFramePoint = { lat: homePosition.lat, lng: homePosition.lon };

    return isValidMapFramePoint(homeFramePoint) ? homeFramePoint : null;
  }, [effectiveDroneId, homeMarker]);

  const missionPath = useMemo(
    () => {
      const route = prependHomeToRoute(homeMarker, waypointsWithPreview);

      return route.length < 2 ? [] : route;
    },
    [homeMarker, waypointsWithPreview],
  );

  const advancedLayers = useMemo(() => {
    if (selectedMission === null) {
      return null;
    }

    return buildPlanRouteAdvancedLayers({
      advanced: selectedMission.advanced,
      mapPolygonDraft,
      selectedLayer: selectedAdvancedLayer,
    });
  }, [mapPolygonDraft, selectedAdvancedLayer, selectedMission]);

  const droneLeadLine = useMemo(() => {
    if (selectedMission === null || waypointsWithPreview.length === 0) {
      return null;
    }

    if (selectedMission.status === 'running' || selectedMission.status === 'completed') {
      return null;
    }

    const drone = dronesObj[selectedMission.droneId];
    const firstWaypoint = waypointsWithPreview[0];

    if (drone === undefined || firstWaypoint === undefined) {
      return null;
    }

    return {
      dronePos: { lat: drone.lat, lng: drone.lng },
      firstWpPos: { lat: firstWaypoint.lat, lng: firstWaypoint.lng },
    };
  }, [dronesObj, selectedMission, waypointsWithPreview]);

  const droneMarkers = useMemo(() => {
    if (effectiveDroneId === null) {
      return [];
    }

    const drone = dronesObj[effectiveDroneId];

    if (drone === undefined) {
      return [];
    }

    return [
      {
        id: drone.id,
        lat: drone.lat,
        lng: drone.lng,
        yaw: drone.yaw,
        altitudeM: drone.altitude,
        name: drone.name,
        active: true,
      },
    ];
  }, [dronesObj, effectiveDroneId]);

  const handleFenceVertexDrag = useCallback(
    (fenceId: string, vertexIndex: number, lat: number, lng: number): void => {
      if (selectedMission === null) {
        throw new Error(
          `Cannot update fence vertex because no planner mission is selected; fenceId=${fenceId}; vertexIndex=${vertexIndex.toString()}; lat=${lat.toString()}; lng=${lng.toString()}.`,
        );
      }

      const advanced = updatePolygonFenceVertex(selectedMission.advanced, fenceId, vertexIndex, { lat, lng });

      setAdvancedPlan(selectedMission.id, advanced);
      selectAdvancedLayer({ type: 'fence', id: fenceId, vertexIndex });
    },
    [selectAdvancedLayer, selectedMission, setAdvancedPlan],
  );

  const handleRallyDrag = useCallback(
    (rallyPointId: string, lat: number, lng: number): void => {
      if (selectedMission === null) {
        throw new Error(
          `Cannot update rally point because no planner mission is selected; rallyPointId=${rallyPointId}; lat=${lat.toString()}; lng=${lng.toString()}.`,
        );
      }

      const rallyPoint = selectedMission.advanced.rallyPoints.find((currentRallyPoint) => currentRallyPoint.id === rallyPointId);

      if (rallyPoint === undefined) {
        throw new Error(
          `Cannot update rally point because rally point ${rallyPointId} was not found in planner mission ${selectedMission.id}.`,
        );
      }

      const advanced = updateRallyPointCoordinate(selectedMission.advanced, rallyPointId, {
        lat,
        lng,
        alt: rallyPoint.coordinate.alt,
      });

      setAdvancedPlan(selectedMission.id, advanced);
      selectAdvancedLayer({ type: 'rally', id: rallyPointId, vertexIndex: null });
    },
    [selectAdvancedLayer, selectedMission, setAdvancedPlan],
  );

  const handleSelectFence = useCallback(
    (fenceId: string, vertexIndex: number | null): void => {
      selectAdvancedLayer({ type: 'fence', id: fenceId, vertexIndex });
    },
    [selectAdvancedLayer],
  );

  const handleSelectRally = useCallback(
    (rallyPointId: string): void => {
      selectAdvancedLayer({ type: 'rally', id: rallyPointId, vertexIndex: null });
    },
    [selectAdvancedLayer],
  );

  const handleSelectWaypoint = useCallback(
    (itemId: string): void => {
      if (activeAdvancedTool === 'selectFenceSource' || activeAdvancedTool === 'selectSurveySource') {
        toggleSourceMissionItem(itemId);
        return;
      }

      resetAdvancedLayerUi();
      selectPlannerItem(itemId);
    },
    [activeAdvancedTool, resetAdvancedLayerUi, selectPlannerItem, toggleSourceMissionItem],
  );

  const handleSelectedItemChange = useCallback((itemId: string | null): void => {
    void itemId;
  }, []);

  const handleDragStart = useCallback((wpId: string): void => {
    void wpId;
  }, []);

  const handleDragMove = useCallback((wpId: string, lat: number, lng: number): void => {
    dragPreviewRef.current = { wpId, lat, lng };

    if (rafHandleRef.current !== undefined) {
      cancelAnimationFrame(rafHandleRef.current);
    }

    rafHandleRef.current = requestAnimationFrame(() => {
      setPathPreview(dragPreviewRef.current);
    });
  }, []);

  const handleDragEnd = useCallback(
    (wpId: string, lat: number, lng: number): void => {
      if (rafHandleRef.current !== undefined) {
        cancelAnimationFrame(rafHandleRef.current);
      }

      rafHandleRef.current = undefined;
      dragPreviewRef.current = null;
      setPathPreview(null);

      const item = findPlanItem(selectedMission, wpId);

      if (selectedMission === null || item === null || item.coordinate === null) {
        return;
      }

      updatePlannerItem(selectedMission.id, wpId, {
        coordinate: {
          ...item.coordinate,
          lat,
          lng,
        },
      });
    },
    [selectedMission, updatePlannerItem],
  );

  const handleHomeDragEnd = useCallback(
    (lat: number, lng: number): void => {
      if (selectedMission === null || selectedMission.plan.home === null) {
        return;
      }

      updatePlannerHome(selectedMission.id, {
        ...selectedMission.plan.home,
        lat,
        lng,
      });
    },
    [selectedMission, updatePlannerHome],
  );

  const ensureLegacyMission = useCallback(
    (mission: PlannerMissionRecord): string => {
      if (mission.legacyMissionId !== null && legacyMissions[mission.legacyMissionId] !== undefined) {
        return mission.legacyMissionId;
      }

      const legacyMissionId = createLegacyMission(mission.name, mission.droneId);
      setLegacyMissionId(mission.id, legacyMissionId);

      return legacyMissionId;
    },
    [createLegacyMission, legacyMissions, setLegacyMissionId],
  );

  const replaceLegacyWaypoints = useCallback(
    (legacyMissionId: string, waypoints: readonly Waypoint[]): void => {
      const legacyMission = useMissionStore.getState().missions[legacyMissionId];

      if (legacyMission === undefined) {
        throw new Error(`Cannot replace waypoints because legacy mission ${legacyMissionId} was not found.`);
      }

      for (const waypoint of legacyMission.waypoints) {
        removeLegacyWaypoint(legacyMissionId, waypoint.id);
      }

      for (const waypoint of waypoints) {
        addLegacyWaypoint(legacyMissionId, waypoint);
      }
    },
    [addLegacyWaypoint, removeLegacyWaypoint],
  );

  const startSimMission = useCallback(
    (mission: PlannerMissionRecord): void => {
      const projection = buildLegacyWaypointsFromMissionPlan(mission.plan);
      const readiness = evaluateMissionPlanExecution({ plan: mission.plan });

      if (!readiness.canExecute) {
        setValidationResult(issuesToValidationResult(readiness.blockers, readiness.warnings));
        return;
      }

      const drone = useDroneStore.getState().drones[mission.droneId];

      if (drone === undefined) {
        setValidationResult({
          isValid: false,
          errors: [`Cannot start mission because drone ${mission.droneId} was not found.`],
          warnings: [],
        });
        return;
      }

      const legacyMissionId = ensureLegacyMission(mission);
      replaceLegacyWaypoints(legacyMissionId, projection.waypoints);

      if (droneMissionController.getEntity(drone.id) === undefined) {
        droneMissionController.addEntity(new DroneEntity(drone, PUBLIC_ASSET_URLS.droneModel, 12));
      }

      droneMissionController.startMission(mission.droneId, legacyMissionId);
      useMissionPlanStore.getState().setMissionStatus(mission.id, 'running', 0, 0);
    },
    [ensureLegacyMission, replaceLegacyWaypoints],
  );

  const handleStartExecution = useCallback(
    (missionId: string): void => {
      const mission = useMissionPlanStore.getState().missions[missionId];

      if (mission === undefined) {
        setValidationResult({
          isValid: false,
          errors: [`Cannot start simulation because planner mission ${missionId} was not found.`],
          warnings: [],
        });
        return;
      }

      startSimMission(mission);
    },
    [startSimMission],
  );

  const replacePlannerMissionItems = useCallback((
    missionId: string,
    items: readonly MissionItem[],
    home: MissionHome | null,
  ): void => {
    const state = useMissionPlanStore.getState();
    const mission = state.missions[missionId];

    if (mission === undefined) {
      throw new Error(`Cannot replace mission items because planner mission ${missionId} was not found.`);
    }

    for (const item of mission.plan.items) {
      useMissionPlanStore.getState().removeItem(missionId, item.id);
    }

    if (home !== null) {
      useMissionPlanStore.getState().updateHome(missionId, home);
    }

    let afterItemId: string | null = null;
    for (const item of items) {
      useMissionPlanStore.getState().addItem(missionId, item, afterItemId);
      afterItemId = item.id;
    }

    useMissionPlanStore.getState().selectItem(items[0]?.id ?? null);
  }, []);

  const handleExportMissionJson = useCallback((missionId: string): string => {
    const mission = useMissionPlanStore.getState().missions[missionId];
    if (mission === undefined) {
      const message = `Cannot export mission JSON because planner mission ${missionId} was not found.`;
      setValidationResult({
        isValid: false,
        errors: [message],
        warnings: [],
      });
      throw new Error(message);
    }

    const content = exportPlannerMissionToJson(mission);
    downloadTextFile(`${downloadableFileName(mission.name)}.json`, content);

    return content;
  }, []);

  const handleImportMissionJson = useCallback((missionId: string, rawText: string): void => {
    const mission = useMissionPlanStore.getState().missions[missionId];
    if (mission === undefined) {
      setValidationResult({
        isValid: false,
        errors: [`Cannot import mission JSON because planner mission ${missionId} was not found.`],
        warnings: [],
      });
      return;
    }

    try {
      const imported = readPlannerMissionJson(rawText);

      replacePlannerMissionItems(mission.id, imported.plan.items, imported.plan.home);
      useMissionPlanStore.getState().renameMission(mission.id, imported.name);
      setAdvancedPlan(mission.id, imported.advanced);
    } catch (err) {
      setValidationResult({
        isValid: false,
        errors: [err instanceof Error ? err.message : 'Error importando JSON de misión.'],
        warnings: [],
      });
    }
  }, [replacePlannerMissionItems, setAdvancedPlan]);

  const handleMapClick = useCallback(
    (coords: { lat: number; lng: number }): void => {
      const state = useMissionPlanStore.getState();
      const mission = selectedMissionRecord(state.missions, state.selectedMissionId);

      if (mission === null) {
        return;
      }

      if (
        activeAdvancedTool !== 'placeRallyPoint' &&
        activeAdvancedTool !== 'drawFencePolygon' &&
        activeAdvancedTool !== 'drawSurveyPolygon'
      ) {
        return;
      }

      try {
        const coordinate = mapClickCoordinateToMissionCoordinate(coords, defaultCoordinate.alt);

        if (activeAdvancedTool === 'drawFencePolygon' || activeAdvancedTool === 'drawSurveyPolygon') {
          const purpose = activeAdvancedTool === 'drawFencePolygon' ? 'fence' : 'survey';
          const result = appendMapPolygonVertex({
            advanced: mission.advanced,
            draft: mapPolygonDraft,
            purpose,
            vertex: { lat: coordinate.lat, lng: coordinate.lng },
            id: createMapAdvancedId(purpose),
          });

          setMapPolygonDraft(result.draft);

          return;
        }

        const rallyPoint = buildRallyDraftFromCoordinate({
          id: createMapAdvancedId('rally'),
          name: 'Map Rally',
          coordinate,
          loiterAltitudeM: 80,
          breakAltitudeM: null,
          landHeadingDeg: null,
        });

        addPlannerRallyPoint(mission.id, rallyPoint);
        selectAdvancedLayer({ type: 'rally', id: rallyPoint.id, vertexIndex: null });
      } catch (err) {
        setValidationResult({
          isValid: false,
          errors: [err instanceof Error ? err.message : 'Error placing advanced map point from map click.'],
          warnings: [],
        });
      }
    },
    [activeAdvancedTool, addPlannerRallyPoint, defaultCoordinate.alt, mapPolygonDraft, selectAdvancedLayer, setMapPolygonDraft],
  );
  const handleValidationClose = useCallback((): void => setValidationResult(null), []);

  const map = useMemo(() => (
    <div className="plan-view__map">
      <MapToolbar className="plan-view__map-toolbar" />
      {show3D ? (
        <LazyCesiumGlobe
          addingWaypoint={
            activeAdvancedTool === 'placeRallyPoint' ||
            activeAdvancedTool === 'drawFencePolygon' ||
            activeAdvancedTool === 'drawSurveyPolygon'
          }
          onWaypointClick={handleMapClick}
          waypointMarkers={waypointMarkers}
          missionFramePoints={missionFramePoints}
          vehicleFramePoint={activeVehicleFramePoint}
          homeFramePoint={activeHomeFramePoint}
          showFrameControl={true}
          selectedMissionId={plannerSelectedMissionId}
          onWaypointDrag={handleDragEnd}
          selectedWpId={plannerSelectedItemId}
          onWaypointSelect={handleSelectWaypoint}
          droneLeadLine={droneLeadLine}
          mapStyle={mapStyle}
          showBuildings={show3DBuildings}
          homeMarker={homeMarker}
          onHomeDrag={handleHomeDragEnd}
        />
      ) : (
        <MapContainer
          mapStyle={mapStyle}
          drones={droneMarkers}
          planningMode={
            activeAdvancedTool === 'placeRallyPoint' ||
            activeAdvancedTool === 'drawFencePolygon' ||
            activeAdvancedTool === 'drawSurveyPolygon'
          }
          onWaypointClick={handleMapClick}
          waypointMarkers={waypointMarkers}
          missionFramePoints={missionFramePoints}
          vehicleFramePoint={activeVehicleFramePoint}
          homeFramePoint={activeHomeFramePoint}
          showFrameControl={true}
          missionPath={missionPath}
          droneLeadLine={droneLeadLine}
          advancedLayers={advancedLayers}
          advancedLayerEditing={true}
          onFenceVertexDrag={handleFenceVertexDrag}
          onRallyDrag={handleRallyDrag}
          onSelectFence={handleSelectFence}
          onSelectRally={handleSelectRally}
          onWaypointDragStart={handleDragStart}
          onWaypointDragMove={handleDragMove}
          onWaypointDrag={handleDragEnd}
          selectedWpId={plannerSelectedItemId}
          onWaypointSelect={handleSelectWaypoint}
          homeMarker={homeMarker}
          onHomeDrag={handleHomeDragEnd}
        />
      )}
    </div>
  ), [show3D, mapStyle, show3DBuildings, activeAdvancedTool, handleMapClick, waypointMarkers, missionFramePoints, activeVehicleFramePoint, activeHomeFramePoint, homeMarker, handleDragEnd, handleHomeDragEnd, plannerSelectedMissionId, plannerSelectedItemId, handleSelectWaypoint, droneLeadLine, droneMarkers, handleFenceVertexDrag, handleRallyDrag, handleSelectFence, handleSelectRally, handleDragStart, handleDragMove, advancedLayers, missionPath]);

  return (
    <>
      {validationResult !== null ? (
        <MissionValidationModal
          result={validationResult}
          onConfirm={handleValidationClose}
          onCancel={handleValidationClose}
        />
      ) : null}

      <MissionPlanningWorkbench
        selectedDroneId={initialSelectedDroneId}
        droneOptions={droneOptions}
        defaultCoordinate={defaultCoordinate}
        map={map}
        onStartExecution={handleStartExecution}
        onExportMissionJson={handleExportMissionJson}
        onImportMissionJson={handleImportMissionJson}
        onSelectedItemChange={handleSelectedItemChange}
      />
    </>
  );
}
