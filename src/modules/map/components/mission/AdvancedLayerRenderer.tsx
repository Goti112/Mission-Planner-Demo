import React, { useEffect, useMemo } from 'react'
import { Layer, Marker, Source, useMap } from 'react-map-gl/mapbox'
import type {
  LayerProps,
  MapMouseEvent,
  MarkerDragEvent,
} from 'react-map-gl/mapbox'
import {
  FENCE_EXCLUSION_COLOR,
  FENCE_INCLUSION_COLOR,
  FENCE_VERTEX_COLOR,
  RALLY_POINT_COLOR,
  SURVEY_AREA_COLOR,
  SURVEY_VERTEX_COLOR,
  type AdvancedLayerMapData,
  type FenceBoundaryMapData,
  type FenceCircleMarkerData,
  type FenceMapVertexData,
  type FencePolygonMarkerData,
  type RallyMarkerData,
  type SurveyAreaMapData,
} from './rendering/MissionRenderConfig'

interface AdvancedLayerRendererProps {
  readonly data: AdvancedLayerMapData
  readonly editable: boolean
  readonly onFenceVertexDrag: (fenceId: string, vertexIndex: number, lat: number, lng: number) => void
  readonly onRallyDrag: (rallyPointId: string, lat: number, lng: number) => void
  readonly onSelectFence: (fenceId: string, vertexIndex: number | null) => void
  readonly onSelectRally: (rallyPointId: string) => void
  readonly onDragActivity: () => void
}

interface RenderableFenceLayer {
  readonly sourceId: string
  readonly fenceId: string
  readonly fillLayerId: string
  readonly lineLayerId: string
  readonly fillLayer: LayerProps
  readonly lineLayer: LayerProps
  readonly feature: GeoJSON.Feature<GeoJSON.Polygon>
}

interface RenderableSurveyLayer {
  readonly sourceId: string
  readonly fillLayer: LayerProps
  readonly lineLayer: LayerProps
  readonly feature: GeoJSON.Feature<GeoJSON.Polygon>
}

const EARTH_RADIUS_M = 6_378_137
const CIRCLE_SEGMENT_COUNT = 64
const ADVANCED_HANDLE_Z_INDEX = 20
const FNV_OFFSET_BASIS = 0x811c9dc5
const FNV_PRIME = 0x01000193

const fenceColor = (boundary: FenceBoundaryMapData): string =>
  boundary === 'inclusion' ? FENCE_INCLUSION_COLOR : FENCE_EXCLUSION_COLOR

const shortHash = (value: string): string => {
  let hash = FNV_OFFSET_BASIS

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, FNV_PRIME)
  }

  return (hash >>> 0).toString(36)
}

const mapboxIdSegment = (value: string): string => {
  const readableSegment = value.replace(/[^a-zA-Z0-9_-]/g, '_')
  const normalizedSegment = readableSegment.length > 0 ? readableSegment : 'layer'

  return `${normalizedSegment}-${shortHash(value)}`
}

const closePolygonCoordinates = (vertices: readonly FenceMapVertexData[]): [number, number][] => {
  if (vertices.length === 0) {
    return []
  }

  const coordinates = vertices.map((vertex): [number, number] => [vertex.lng, vertex.lat])
  const first = coordinates[0]
  const last = coordinates[coordinates.length - 1]

  if (first[0] === last[0] && first[1] === last[1]) {
    return coordinates
  }

  return [...coordinates, first]
}

const circleCoordinates = (fence: FenceCircleMarkerData): [number, number][] => {
  const centerLatRad = fence.center.lat * Math.PI / 180
  const centerLngRad = fence.center.lng * Math.PI / 180
  const angularDistance = fence.radiusM / EARTH_RADIUS_M
  const coordinates: [number, number][] = []

  for (let index = 0; index < CIRCLE_SEGMENT_COUNT; index += 1) {
    const bearing = 2 * Math.PI * index / CIRCLE_SEGMENT_COUNT
    const pointLatRad = Math.asin(
      Math.sin(centerLatRad) * Math.cos(angularDistance)
        + Math.cos(centerLatRad) * Math.sin(angularDistance) * Math.cos(bearing),
    )
    const pointLngRad = centerLngRad + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(centerLatRad),
      Math.cos(angularDistance) - Math.sin(centerLatRad) * Math.sin(pointLatRad),
    )

    coordinates.push([pointLngRad * 180 / Math.PI, pointLatRad * 180 / Math.PI])
  }

  return [...coordinates, coordinates[0]]
}

const polygonCoordinates = (
  fence: FencePolygonMarkerData | FenceCircleMarkerData,
): [number, number][] => {
  if (fence.shape === 'circle') {
    return circleCoordinates(fence)
  }

  return closePolygonCoordinates(fence.vertices)
}

const polygonFeature = (
  fence: FencePolygonMarkerData | FenceCircleMarkerData,
): GeoJSON.Feature<GeoJSON.Polygon> | null => {
  const coordinates = polygonCoordinates(fence)

  if (coordinates.length < 4) {
    return null
  }

  return {
    type: 'Feature',
    properties: {
      fenceId: fence.id,
      boundary: fence.boundary,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [coordinates],
    },
  }
}

const surveyFeature = (surveyArea: SurveyAreaMapData): GeoJSON.Feature<GeoJSON.Polygon> | null => {
  const coordinates = closePolygonCoordinates(surveyArea.vertices)

  if (coordinates.length < 4) {
    return null
  }

  return {
    type: 'Feature',
    properties: {
      surveyId: surveyArea.id,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [coordinates],
    },
  }
}

const fillLayer = (id: string, color: string, selected: boolean): LayerProps => ({
  id,
  type: 'fill',
  paint: {
    'fill-color': color,
    'fill-opacity': selected ? 0.26 : 0.14,
  },
})

const lineLayer = (id: string, color: string, selected: boolean): LayerProps => ({
  id,
  type: 'line',
  layout: {
    'line-cap': 'round',
    'line-join': 'round',
  },
  paint: {
    'line-color': color,
    'line-width': selected ? 3.5 : 2,
    'line-opacity': selected ? 0.95 : 0.7,
  },
})

const renderableFenceLayer = (
  fence: FencePolygonMarkerData | FenceCircleMarkerData,
  selected: boolean,
): RenderableFenceLayer | null => {
  const feature = polygonFeature(fence)

  if (feature === null) {
    return null
  }

  const safeId = mapboxIdSegment(fence.id)
  const color = fenceColor(fence.boundary)

  const fillLayerId = `advanced-fence-fill-${safeId}`
  const lineLayerId = `advanced-fence-line-${safeId}`

  return {
    sourceId: `advanced-fence-source-${safeId}`,
    fenceId: fence.id,
    fillLayerId,
    lineLayerId,
    fillLayer: fillLayer(fillLayerId, color, selected),
    lineLayer: lineLayer(lineLayerId, color, selected),
    feature,
  }
}

const renderableSurveyLayer = (surveyArea: SurveyAreaMapData): RenderableSurveyLayer | null => {
  const feature = surveyFeature(surveyArea)

  if (feature === null) {
    return null
  }

  const safeId = mapboxIdSegment(surveyArea.id)
  const fillLayerId = `advanced-survey-fill-${safeId}`
  const lineLayerId = `advanced-survey-line-${safeId}`

  return {
    sourceId: `advanced-survey-source-${safeId}`,
    fillLayer: fillLayer(fillLayerId, SURVEY_AREA_COLOR, false),
    lineLayer: lineLayer(lineLayerId, SURVEY_AREA_COLOR, false),
    feature,
  }
}

const fenceIsSelected = (data: AdvancedLayerMapData, fenceId: string): boolean =>
  data.selectedLayer?.type === 'fence' && data.selectedLayer.id === fenceId

const vertexIsSelected = (data: AdvancedLayerMapData, fenceId: string, vertexIndex: number): boolean =>
  data.selectedLayer?.type === 'fence'
    && data.selectedLayer.id === fenceId
    && data.selectedLayer.vertexIndex === vertexIndex

const rallyIsSelected = (data: AdvancedLayerMapData, rallyPointId: string): boolean =>
  data.selectedLayer?.type === 'rally' && data.selectedLayer.id === rallyPointId

const vertexClassName = (selected: boolean): string =>
  selected ? 'advanced-layer-vertex advanced-layer-vertex--selected' : 'advanced-layer-vertex'

const rallyClassName = (selected: boolean): string =>
  selected ? 'advanced-layer-rally advanced-layer-rally--selected' : 'advanced-layer-rally'

const surveyVertexClassName = (): string => 'advanced-layer-survey-vertex'

const AdvancedLayerRenderer: React.FC<AdvancedLayerRendererProps> = ({
  data,
  editable,
  onFenceVertexDrag,
  onRallyDrag,
  onSelectFence,
  onSelectRally,
  onDragActivity,
}) => {
  const { current: currentMap } = useMap()

  const fenceLayers = useMemo(
    () => data.fences
      .map((fence): RenderableFenceLayer | null => renderableFenceLayer(fence, fenceIsSelected(data, fence.id)))
      .filter((layer): layer is RenderableFenceLayer => layer !== null),
    [data],
  )

  const polygonFences = useMemo(
    () => data.fences.filter((fence): fence is FencePolygonMarkerData => fence.shape === 'polygon'),
    [data.fences],
  )

  const surveyLayers = useMemo(
    () => data.surveyAreas
      .map((surveyArea): RenderableSurveyLayer | null => renderableSurveyLayer(surveyArea))
      .filter((layer): layer is RenderableSurveyLayer => layer !== null),
    [data.surveyAreas],
  )

  useEffect(() => {
    const map = currentMap?.getMap()

    if (!map) {
      return undefined
    }

    const registrations = fenceLayers.flatMap((layer) => [
      { fenceId: layer.fenceId, layerId: layer.fillLayerId },
      { fenceId: layer.fenceId, layerId: layer.lineLayerId },
    ])

    const handlers = registrations.map((registration) => {
      const handler = (event: MapMouseEvent): void => {
        event.originalEvent.stopPropagation()
        onSelectFence(registration.fenceId, null)
      }

      map.on('click', registration.layerId, handler)

      return {
        handler,
        layerId: registration.layerId,
      }
    })

    return () => {
      handlers.forEach((registration) => {
        map.off('click', registration.layerId, registration.handler)
      })
    }
  }, [currentMap, fenceLayers, onSelectFence])

  const handleFenceVertexDrag = (
    fenceId: string,
    vertexIndex: number,
    event: MarkerDragEvent,
  ): void => {
    onDragActivity()
    onFenceVertexDrag(fenceId, vertexIndex, event.lngLat.lat, event.lngLat.lng)
  }

  const handleRallyDrag = (rallyPointId: string, event: MarkerDragEvent): void => {
    onDragActivity()
    onRallyDrag(rallyPointId, event.lngLat.lat, event.lngLat.lng)
  }

  const renderFenceVertex = (
    fence: FencePolygonMarkerData,
    vertex: FenceMapVertexData,
    vertexIndex: number,
  ): React.ReactNode => (
    <Marker
      key={`${fence.id}-${vertexIndex}`}
      longitude={vertex.lng}
      latitude={vertex.lat}
      anchor="center"
      draggable={editable}
      style={{ zIndex: ADVANCED_HANDLE_Z_INDEX }}
      onDragStart={onDragActivity}
      onDrag={onDragActivity}
      onDragEnd={(event) => handleFenceVertexDrag(fence.id, vertexIndex, event)}
    >
      <button
        type="button"
        className={vertexClassName(vertexIsSelected(data, fence.id, vertexIndex))}
        style={{ borderColor: FENCE_VERTEX_COLOR }}
        title={fence.name}
        aria-label={`Select ${fence.name} vertex ${vertexIndex + 1}`}
        onClick={(event) => {
          event.stopPropagation()
          onSelectFence(fence.id, vertexIndex)
        }}
      />
    </Marker>
  )

  const renderRallyPoint = (rallyPoint: RallyMarkerData): React.ReactNode => (
    <Marker
      key={rallyPoint.id}
      longitude={rallyPoint.lng}
      latitude={rallyPoint.lat}
      anchor="center"
      draggable={editable}
      style={{ zIndex: ADVANCED_HANDLE_Z_INDEX }}
      onDragStart={onDragActivity}
      onDrag={onDragActivity}
      onDragEnd={(event) => handleRallyDrag(rallyPoint.id, event)}
    >
      <button
        type="button"
        className={rallyClassName(rallyIsSelected(data, rallyPoint.id))}
        style={{ borderColor: RALLY_POINT_COLOR }}
        title={rallyPoint.name}
        aria-label={`Select ${rallyPoint.name}`}
        onClick={(event) => {
          event.stopPropagation()
          onSelectRally(rallyPoint.id)
        }}
      />
    </Marker>
  )

  const renderSurveyVertex = (
    surveyArea: SurveyAreaMapData,
    vertex: FenceMapVertexData,
    vertexIndex: number,
  ): React.ReactNode => (
    <Marker
      key={`${surveyArea.id}-${vertexIndex}`}
      longitude={vertex.lng}
      latitude={vertex.lat}
      anchor="center"
      draggable={false}
      style={{ zIndex: ADVANCED_HANDLE_Z_INDEX }}
    >
      <span
        className={surveyVertexClassName()}
        style={{ borderColor: SURVEY_VERTEX_COLOR }}
        title={surveyArea.name}
        aria-label={`${surveyArea.name} vertex ${vertexIndex + 1}`}
      />
    </Marker>
  )

  return (
    <>
      {fenceLayers.map((layer) => (
        <Source key={layer.sourceId} id={layer.sourceId} type="geojson" data={layer.feature}>
          <Layer {...layer.fillLayer} />
          <Layer {...layer.lineLayer} />
        </Source>
      ))}

      {surveyLayers.map((layer) => (
        <Source key={layer.sourceId} id={layer.sourceId} type="geojson" data={layer.feature}>
          <Layer {...layer.fillLayer} />
          <Layer {...layer.lineLayer} />
        </Source>
      ))}

      {polygonFences.flatMap((fence) =>
        fence.vertices.map((vertex, vertexIndex) => renderFenceVertex(fence, vertex, vertexIndex)),
      )}

      {data.surveyAreas.flatMap((surveyArea) =>
        surveyArea.vertices.map((vertex, vertexIndex) => renderSurveyVertex(surveyArea, vertex, vertexIndex)),
      )}

      {data.rallyPoints.map((rallyPoint) => renderRallyPoint(rallyPoint))}
    </>
  )
}

export default React.memo(AdvancedLayerRenderer)
