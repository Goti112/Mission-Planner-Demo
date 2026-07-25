/* ═══════════════════════════════════════════════════════════════
   WaypointItem — single waypoint row for the mission planner
   ═══════════════════════════════════════════════════════════════
   Features:
     • Inline-editable altitude & hold time
     • Drag handle for reorder (via HTML drag API)
     • Delete button
     • Duplicate button
     • Select / highlight on click
     • Active-WP indicator during mission execution
   ═══════════════════════════════════════════════════════════════ */

import React, { useCallback } from 'react'
import { GripVertical, Trash2, Copy } from 'lucide-react'
import type { Waypoint } from '../../../types/mission'

export interface WaypointItemProps {
  wp: Waypoint
  index: number
  missionId: string
  /** Is this the waypoint the drone is currently flying toward? */
  isCurrent: boolean
  /** Is this waypoint selected in the list? */
  isSelected: boolean
  /** Whether the mission is running (disables destructive actions) */
  isRunning: boolean
  onSelect: (wpId: string) => void
  onUpdate: (missionId: string, wpId: string, patch: Partial<Omit<Waypoint, 'id'>>) => void
  onRemove: (missionId: string, wpId: string) => void
  onDuplicate: (wp: Waypoint) => void
  /** Drag & drop callbacks */
  onDragStart: (index: number) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (index: number) => void
}

const WaypointItem: React.FC<WaypointItemProps> = ({
  wp,
  index,
  missionId,
  isCurrent,
  isSelected,
  isRunning,
  onSelect,
  onUpdate,
  onRemove,
  onDuplicate,
  onDragStart,
  onDragOver,
  onDrop,
}) => {
  const handleAltChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdate(missionId, wp.id, { altitude: Number(e.target.value) || 0 })
    },
    [missionId, wp.id, onUpdate],
  )

  const handleHoldChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdate(missionId, wp.id, { holdTime: Number(e.target.value) || 0 })
    },
    [missionId, wp.id, onUpdate],
  )

  const handleSpeedChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdate(missionId, wp.id, { speed: Number(e.target.value) || undefined })
    },
    [missionId, wp.id, onUpdate],
  )

  /* CSS classes for state */
  const cls = [
    'wp-item',
    isCurrent && 'wp-item--current',
    isSelected && 'wp-item--selected',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={cls}
      onClick={() => onSelect(wp.id)}
      draggable={!isRunning}
      onDragStart={() => onDragStart(index)}
      onDragOver={onDragOver}
      onDrop={() => onDrop(index)}
    >
      {/* Drag handle */}
      <div className="wp-item__grip" title="Arrastrar para reordenar">
        <GripVertical size={12} />
      </div>

      {/* Index badge */}
      <div className={`wp-item__badge ${isCurrent ? 'wp-item__badge--active' : ''}`}>
        {index + 1}
      </div>

      {/* Coordinate & data block */}
      <div className="wp-item__body">
        <div className="wp-item__coords">
          <span className="wp-item__coord">{wp.lat.toFixed(6)}</span>
          <span className="wp-item__coord">{wp.lng.toFixed(6)}</span>
        </div>
        <div className="wp-item__fields">
          <label className="wp-item__field">
            <span>Alt</span>
            <input
              type="number"
              value={wp.altitude}
              onChange={handleAltChange}
              min={0}
              max={500}
              disabled={isRunning}
            />
            <span className="wp-item__unit">m</span>
          </label>
          <label className="wp-item__field">
            <span>Hold</span>
            <input
              type="number"
              value={wp.holdTime ?? 0}
              onChange={handleHoldChange}
              min={0}
              max={300}
              disabled={isRunning}
            />
            <span className="wp-item__unit">s</span>
          </label>
          <label className="wp-item__field">
            <span>Vel</span>
            <input
              type="number"
              value={wp.speed ?? ''}
              onChange={handleSpeedChange}
              min={0}
              max={2000}
              placeholder="—"
              disabled={isRunning}
            />
            <span className="wp-item__unit">m/s</span>
          </label>
        </div>
      </div>

      {/* Actions */}
      <div className="wp-item__actions">
        <button
          className="wp-item__action-btn"
          onClick={(e) => { e.stopPropagation(); onDuplicate(wp) }}
          title="Duplicar waypoint"
          disabled={isRunning}
        >
          <Copy size={11} />
        </button>
        <button
          className="wp-item__action-btn wp-item__action-btn--danger"
          onClick={(e) => { e.stopPropagation(); onRemove(missionId, wp.id) }}
          title="Eliminar waypoint"
          disabled={isRunning}
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* Current-WP indicator pulse */}
      {isCurrent && <div className="wp-item__pulse" />}
    </div>
  )
}

export default React.memo(WaypointItem)
