import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useDroneStore } from '../modules/drone'
import { useUIStore } from '../shared/store/uiStore'
import { DemoBanner, DemoGuide } from '../demo'
import { useInitializeDemo } from '../demo/useInitializeDemo'
import { LazyCesiumGlobe, MapContainer, MapToolbar } from '../modules/map'
import type {
  HomeMarkerData,
  WaypointMarkerData,
} from '../modules/map/components/mission/rendering/MissionRenderConfig'
import '../App.css'

import {
  MissionPanel,
  buildLegacyWaypointsFromMissionPlan,
  useMissionPlanStore,
  type PlannerMissionRecord,
} from '../modules/mission'
import { ControlBar } from '../modules/layout'

import { useDroneTelemetry } from '../modules/telemetry/hooks'

import {
  DroneStatusPills,
  FailsafeAlerts,
  FloatingPanel,
  GCSNavBar,
  LayoutEngine,
  LeftColumn,
} from '../modules/layout'
import { useFlightReplay } from '../modules/replay/hooks/useFlightReplay'
import { useClockTime } from '../modules/layout/hooks/useClockTime'
import { useFailsafeMonitor, useOperationalReadiness } from '../modules/operational'
import ToastContainer from '../components/shared/ToastContainer'
import { ControlSurfacesDrawer, SurfaceWidgetLayer } from '../modules/hud'
import { useDetachedSurfaces } from '../modules/hud'
import { DetachedSurfacesContext } from '../shared/contexts/DetachedSurfacesContext'

const PlanRoute = React.lazy(() => import('./routes/PlanRoute'))
const MissionReplayViewerLazy = React.lazy(() => import('../modules/replay/components/MissionReplayViewer'))

const viewTransition = {
  initial: { opacity: 0, scale: 0.995 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
  exit: { opacity: 0, scale: 0.995, transition: { duration: 0.15, ease: 'easeIn' as const } },
}

const SHOW_GLOBAL_NOTIFICATIONS = false

interface MapFramePoint {
  readonly lat: number
  readonly lng: number
}

interface MissionPathPoint {
  readonly lat: number
  readonly lng: number
}

interface HomeFlightMissionMapModel {
  readonly waypointMarkers: WaypointMarkerData[]
  readonly missionPath: MissionPathPoint[]
  readonly missionFramePoints: MapFramePoint[]
  readonly homeMarker: HomeMarkerData | null
}

const isValidMapFramePoint = (point: MapFramePoint): boolean =>
  Number.isFinite(point.lat) &&
  point.lat >= -90 &&
  point.lat <= 90 &&
  Number.isFinite(point.lng) &&
  point.lng >= -180 &&
  point.lng <= 180

const homeMarkerFromPlannerMission = (mission: PlannerMissionRecord | null): HomeMarkerData | null => {
  if (mission?.plan.home === null || mission?.plan.home === undefined) {
    return null
  }

  return {
    id: `${mission.id}:home`,
    lat: mission.plan.home.lat,
    lng: mission.plan.home.lng,
    altitudeM: mission.plan.home.alt,
  }
}

const prependHomeToRoute = (
  home: HomeMarkerData | null,
  waypoints: readonly MissionPathPoint[],
): MissionPathPoint[] => {
  if (home === null || waypoints.length === 0) {
    return waypoints.map((waypoint) => ({ lat: waypoint.lat, lng: waypoint.lng }))
  }

  return [
    { lat: home.lat, lng: home.lng },
    ...waypoints.map((waypoint) => ({ lat: waypoint.lat, lng: waypoint.lng })),
  ]
}

const emptyHomeFlightMissionMapModel = (): HomeFlightMissionMapModel => ({
  waypointMarkers: [],
  missionPath: [],
  missionFramePoints: [],
  homeMarker: null,
})

const buildHomeFlightMissionMapModel = (
  mission: PlannerMissionRecord | null,
): HomeFlightMissionMapModel => {
  if (mission === null) {
    return emptyHomeFlightMissionMapModel()
  }

  const legacyProjection = buildLegacyWaypointsFromMissionPlan(mission.plan)
  const homeMarker = homeMarkerFromPlannerMission(mission)
  const waypointMarkers = legacyProjection.waypoints.map((waypoint, index) => ({
    id: waypoint.id,
    lat: waypoint.lat,
    lng: waypoint.lng,
    index,
    altitudeM: waypoint.altitude,
    isCurrent: mission.status === 'running' && index === mission.currentItemIndex,
  }))
  const waypointFramePoints = waypointMarkers.map((waypoint) => ({
    lat: waypoint.lat,
    lng: waypoint.lng,
  }))
  const missionFramePoints = homeMarker === null
    ? waypointFramePoints
    : [{ lat: homeMarker.lat, lng: homeMarker.lng }, ...waypointFramePoints]
  const route = prependHomeToRoute(homeMarker, legacyProjection.waypoints)

  return {
    waypointMarkers,
    missionPath: route.length < 2 ? [] : route,
    missionFramePoints,
    homeMarker,
  }
}

const App: React.FC = () => {
  useInitializeDemo()
  const dronesObj = useDroneStore((state) => state.drones)
  const visibleDrones = React.useMemo(() => Object.values(dronesObj), [dronesObj])
  const activeDrone = React.useMemo(
    () => visibleDrones.find((drone) => drone.active) ?? null,
    [visibleDrones],
  )
  const visibleDroneMarkers = React.useMemo(
    () =>
      visibleDrones.map((drone) => ({
        id: drone.id,
        lat: drone.lat,
        lng: drone.lng,
        yaw: drone.yaw,
        altitudeM: drone.altitude,
        active: drone.active,
      })),
    [visibleDrones],
  )

  const plannerMissions = useMissionPlanStore((state) => state.missions)
  const plannerSelectedMissionId = useMissionPlanStore((state) => state.selectedMissionId)

  const selectedPlannerMission = React.useMemo<PlannerMissionRecord | null>(
    () => (
      plannerSelectedMissionId === null
        ? null
        : plannerMissions[plannerSelectedMissionId] ?? null
    ),
    [plannerMissions, plannerSelectedMissionId],
  )

  const homeFlightMissionMapModel = React.useMemo(
    () => buildHomeFlightMissionMapModel(selectedPlannerMission),
    [selectedPlannerMission],
  )

  const activeVehicleFramePoint = React.useMemo<MapFramePoint | null>(
    () => (
      activeDrone === null
        ? null
        : { lat: activeDrone.lat, lng: activeDrone.lng }
    ),
    [activeDrone],
  )

  const activeHomeFramePoint = React.useMemo<MapFramePoint | null>(() => {
    if (homeFlightMissionMapModel.homeMarker !== null) {
      const plannedHomeFramePoint = {
        lat: homeFlightMissionMapModel.homeMarker.lat,
        lng: homeFlightMissionMapModel.homeMarker.lng,
      }

      return isValidMapFramePoint(plannedHomeFramePoint) ? plannedHomeFramePoint : null
    }

    return null
  }, [homeFlightMissionMapModel.homeMarker])

  const currentView = useUIStore((state) => state.currentView)
  const openPanel = useUIStore((state) => state.openPanel)
  const setOpenPanel = useUIStore((state) => state.setOpenPanel)

  const {
    telemetry: simTelemetry,
    normTelemetry,
    snapshotProvider,
  } = useDroneTelemetry()

  const operationalReadiness = useOperationalReadiness({
    telemetry: simTelemetry,
    normTelemetry,
  })
  useFailsafeMonitor()

  const clockTime = useClockTime()
  const detachedSurfaces = useDetachedSurfaces()

  useFlightReplay()

  const mapStyle = useUIStore((state) => state.mapStyle)
  const show3D = useUIStore((state) => state.show3D)
  const show3DBuildings = useUIStore((state) => state.show3DBuildings)

  return (
    <DetachedSurfacesContext.Provider value={detachedSurfaces}>
      <div className="gcs-shell">
        <DemoBanner />
        <GCSNavBar
          clockTime={clockTime}
          readiness={operationalReadiness}
        />
        <DemoGuide />
        {SHOW_GLOBAL_NOTIFICATIONS ? <FailsafeAlerts readiness={operationalReadiness} /> : null}

        <AnimatePresence mode="wait">
          {currentView === 'PLAN' ? (
            <React.Suspense fallback={null}>
              <motion.div key="plan" className="gcs-workspace" {...viewTransition}>
                <PlanRoute />
              </motion.div>
            </React.Suspense>
          ) : currentView === 'REPLAY' ? (
            <React.Suspense fallback={null}>
              <motion.div key="replay" className="gcs-workspace" {...viewTransition}>
                <MissionReplayViewerLazy />
              </motion.div>
            </React.Suspense>
          ) : (
            <motion.div key="flight" className="gcs-workspace" {...viewTransition}>
              <LayoutEngine
                panels={{
                  pfdPanel: () => (
                    <LeftColumn
                      simTelemetry={simTelemetry}
                      normTelemetry={normTelemetry}
                      droneName={activeDrone?.name}
                      snapshotProvider={snapshotProvider}
                      readiness={operationalReadiness}
                    />
                  ),
                }}
                center={(
                  <div className="gcs-map-col">
                    <MapToolbar />

                    {show3D ? (
                      <LazyCesiumGlobe
                        addingWaypoint={false}
                        mapStyle={mapStyle}
                        showBuildings={show3DBuildings}
                        selectedMissionId={selectedPlannerMission?.id ?? null}
                        waypointMarkers={homeFlightMissionMapModel.waypointMarkers}
                        missionFramePoints={homeFlightMissionMapModel.missionFramePoints}
                        vehicleFramePoint={activeVehicleFramePoint}
                        homeFramePoint={activeHomeFramePoint}
                        showFrameControl={true}
                        homeMarker={homeFlightMissionMapModel.homeMarker}
                      />
                    ) : (
                      <MapContainer
                        mapStyle={mapStyle}
                        drones={visibleDroneMarkers}
                        waypointMarkers={homeFlightMissionMapModel.waypointMarkers}
                        missionPath={homeFlightMissionMapModel.missionPath}
                        missionFramePoints={homeFlightMissionMapModel.missionFramePoints}
                        vehicleFramePoint={activeVehicleFramePoint}
                        homeFramePoint={activeHomeFramePoint}
                        showFrameControl={true}
                        homeMarker={homeFlightMissionMapModel.homeMarker}
                      />
                    )}
                  </div>
                )}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <footer className="gcs-statusbar">
          <div className="gcs-statusbar-left">
            {activeDrone ? (
              <ControlBar
                droneLat={activeDrone.lat}
                droneLon={activeDrone.lng}
                show3D={show3D}
              />
            ) : (
              <span className="gcs-statusbar-idle">Sin dron activo — selecciona uno en el menú</span>
            )}
          </div>
          <ControlSurfacesDrawer
            telemetry={simTelemetry}
            snapshotProvider={snapshotProvider}
          />
          <div className="gcs-statusbar-right">
            {activeDrone && (
              <DroneStatusPills
                drone={activeDrone}
                gpsStatus={simTelemetry.gpsStatus}
              />
            )}
            <div className="gcs-statusbar-item">
              <span className="gcs-statusbar-label">VISTA</span>
              <span className="gcs-statusbar-value">{currentView === 'FLIGHT' ? 'Vuelo' : currentView === 'PLAN' ? 'Plan' : 'Replay'}</span>
            </div>
          </div>
        </footer>

        <FloatingPanel
          side="left"
          open={currentView === 'FLIGHT' && openPanel === 'inicio'}
          onClose={() => setOpenPanel(null)}
          title="Misiones"
          width="400px"
        >
          <MissionPanel
            addingWaypoint={false}
            setAddingWaypoint={() => {}}
            pendingWaypoint={null}
            clearPendingWaypoint={() => {}}
          />
        </FloatingPanel>
        {SHOW_GLOBAL_NOTIFICATIONS ? <ToastContainer /> : null}
        <SurfaceWidgetLayer
          telemetry={simTelemetry}
          snapshotProvider={snapshotProvider}
        />
      </div>
    </DetachedSurfacesContext.Provider>
  )
}

export default App
