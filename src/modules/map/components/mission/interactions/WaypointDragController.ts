/**
 * WaypointDragController.ts
 *
 * Singleton drag lifecycle controller.
 *
 * Lives OUTSIDE the React render tree so that drag-position tracking never
 * triggers a component re-render on its own.  Components (WaypointMarker)
 * maintain their own local state for visual updates; PlanView uses a
 * requestAnimationFrame-throttled subscriber to update the path/stats preview.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  Drag flow                                                          │
 * │                                                                     │
 * │  handleDragStart(id, lat, lng)                                      │
 * │     → stores origin, sets isDragging = true                         │
 * │     → notifies START subscribers                                    │
 * │                                                                     │
 * │  handleDragMove(id, lat, lng)   ← called every mousemove frame     │
 * │     → updates current drag position                                 │
 * │     → notifies MOVE subscribers (RAF-throttled in PlanView)         │
 * │                                                                     │
 * │  handleDragEnd(id, lat, lng)                                        │
 * │     → sets isDragging = false                                       │
 * │     → notifies END subscribers                                      │
 * │     → clears drag state                                             │
 * └─────────────────────────────────────────────────────────────────────┘
 */

export interface DragPosition {
  id:  string
  lat: number
  lng: number
}

type DragStartCallback = (pos: DragPosition) => void
type DragMoveCallback  = (pos: DragPosition) => void
type DragEndCallback   = (pos: DragPosition) => void

class WaypointDragController {
  /* ── Current drag state ─────────────────────────────────────────── */
  private _isDragging = false
  private _draggingId: string | null = null
  private _currentLat = 0
  private _currentLng = 0
  private _originLat  = 0
  private _originLng  = 0

  /* ── Subscriber lists ───────────────────────────────────────────── */
  private _startSubs: Set<DragStartCallback> = new Set()
  private _moveSubs:  Set<DragMoveCallback>  = new Set()
  private _endSubs:   Set<DragEndCallback>   = new Set()

  /* ── Public read-only accessors ────────────────────────────────── */
  get isDragging()  { return this._isDragging }
  get draggingId()  { return this._draggingId }
  get currentLat()  { return this._currentLat }
  get currentLng()  { return this._currentLng }
  get originLat()   { return this._originLat  }
  get originLng()   { return this._originLng  }

  /* ── Lifecycle methods ──────────────────────────────────────────── */

  handleDragStart(id: string, lat: number, lng: number): void {
    this._isDragging  = true
    this._draggingId  = id
    this._currentLat  = lat
    this._currentLng  = lng
    this._originLat   = lat
    this._originLng   = lng
    const pos: DragPosition = { id, lat, lng }
    this._startSubs.forEach((cb) => cb(pos))
  }

  handleDragMove(id: string, lat: number, lng: number): void {
    if (!this._isDragging || this._draggingId !== id) return
    this._currentLat = lat
    this._currentLng = lng
    const pos: DragPosition = { id, lat, lng }
    this._moveSubs.forEach((cb) => cb(pos))
  }

  handleDragEnd(id: string, lat: number, lng: number): void {
    if (!this._isDragging || this._draggingId !== id) return
    this._currentLat = lat
    this._currentLng = lng
    const pos: DragPosition = { id, lat, lng }
    this._endSubs.forEach((cb) => cb(pos))
    // Clear state after notifying
    this._isDragging = false
    this._draggingId = null
  }

  /* ── Subscription management ────────────────────────────────────── */

  onDragStart(cb: DragStartCallback): () => void {
    this._startSubs.add(cb)
    return () => this._startSubs.delete(cb)
  }

  onDragMove(cb: DragMoveCallback): () => void {
    this._moveSubs.add(cb)
    return () => this._moveSubs.delete(cb)
  }

  onDragEnd(cb: DragEndCallback): () => void {
    this._endSubs.add(cb)
    return () => this._endSubs.delete(cb)
  }
}

/** Module-level singleton — import and use directly, no context needed. */
export const waypointDragController = new WaypointDragController()
