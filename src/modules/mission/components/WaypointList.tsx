/* ═══════════════════════════════════════════════════════════════
   WaypointList — scrollable waypoint list with drag-to-reorder
   ═══════════════════════════════════════════════════════════════
   Wraps WaypointItem rows and manages drag state + reorder.
   Uses the existing missionStore.reorderWaypoints method.
   ═══════════════════════════════════════════════════════════════ */

import React, { useState, useCallback } from 'react'
import WaypointItem from './WaypointItem'
import type { Waypoint, Mission } from '../../../types/mission'

interface WaypointListProps {
  mission: Mission
  selectedWpId: string | null
  onSelectWp: (wpId: string) => void
  onUpdate: (missionId: string, wpId: string, patch: Partial<Omit<Waypoint, 'id'>>) => void
  onRemove: (missionId: string, wpId: string) => void
  onDuplicate: (wp: Waypoint) => void
  onReorder: (missionId: string, fromIndex: number, toIndex: number) => void
}

const WaypointList: React.FC<WaypointListProps> = ({
  mission,
  selectedWpId,
  onSelectWp,
  onUpdate,
  onRemove,
  onDuplicate,
  onReorder,
}) => {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const isRunning = mission.status === 'running'

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault() // allow drop
  }, [])

  const handleDrop = useCallback(
    (toIndex: number) => {
      if (dragIndex !== null && dragIndex !== toIndex) {
        onReorder(mission.id, dragIndex, toIndex)
      }
      setDragIndex(null)
    },
    [dragIndex, mission.id, onReorder],
  )

  if (mission.waypoints.length === 0) {
    return (
      <div className="wp-list__empty">
        <span>Sin waypoints</span>
        <span className="wp-list__empty-hint">
          Pulsa "Añadir WP" y haz clic en el mapa
        </span>
      </div>
    )
  }

  return (
    <div className="wp-list">
      {mission.waypoints.map((wp, i) => (
        <WaypointItem
          key={wp.id}
          wp={wp}
          index={i}
          missionId={mission.id}
          isCurrent={isRunning && i === mission.currentWpIndex}
          isSelected={wp.id === selectedWpId}
          isRunning={isRunning}
          onSelect={onSelectWp}
          onUpdate={onUpdate}
          onRemove={onRemove}
          onDuplicate={onDuplicate}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        />
      ))}
    </div>
  )
}

export default WaypointList
