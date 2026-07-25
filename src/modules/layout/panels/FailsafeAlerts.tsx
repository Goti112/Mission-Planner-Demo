import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Radio, Battery, Satellite,
  AlertTriangle, Siren, X, ShieldAlert,
} from 'lucide-react'
import { useFailsafeStore } from '../../../systems/failsafe/FailsafeStore'
import { failsafeManager } from '../../../systems/failsafe/FailsafeManager'
import type { OperationalReadiness, SafetyAlert } from '../../operational'
import { buildSafetyAlerts } from '../../operational'
import './FailsafeAlerts.css'

interface FailsafeAlertsProps {
  readiness: OperationalReadiness
}

interface AlertCardProps {
  alert: SafetyAlert
  dismissalKey: string
  onDismiss: (alert: SafetyAlert, dismissalKey: string) => void
}

interface AlertRenderItem {
  alert: SafetyAlert
  dismissalKey: string
}

interface AlertOccurrenceRegistry {
  tokens: Map<string, string>
  nextSeq: number
}

interface AlertOccurrenceRegistryAccess {
  read: () => AlertOccurrenceRegistry
}

function sourceLabel(alert: SafetyAlert): string {
  if (alert.source === 'prearm') return 'PREARM'
  if (alert.source === 'failsafe') return 'FAILSAFE'
  return 'SISTEMA'
}

function alertIcon(alert: SafetyAlert): React.ReactNode {
  const searchableText = `${alert.title} ${alert.detail}`.toUpperCase()
  if (searchableText.includes('BATERIA') || searchableText.includes('BATTERY')) return <Battery size={16} />
  if (searchableText.includes('GPS')) return <Satellite size={16} />
  if (searchableText.includes('LINK') || searchableText.includes('SIGNAL')) return <Radio size={16} />
  return <ShieldAlert size={16} />
}

function alertOccurrenceIdentity(alert: SafetyAlert): string {
  return `${alert.id}:${alert.triggeredAt}:${alert.detail}`
}

function buildAlertRenderItems(
  alerts: SafetyAlert[],
  registryAccess: AlertOccurrenceRegistryAccess,
): AlertRenderItem[] {
  const registry = registryAccess.read()

  return alerts.map((alert) => {
    const identity = alertOccurrenceIdentity(alert)
    const occurrenceToken = registry.tokens.get(identity) ?? 'pending'

    return {
      alert,
      dismissalKey: `${identity}:${occurrenceToken}`,
    }
  })
}

function ensureOccurrenceToken(identity: string, registry: AlertOccurrenceRegistry): string {
  const existingToken = registry.tokens.get(identity)
  if (existingToken !== undefined) return existingToken

  const token = String(registry.nextSeq)
  registry.nextSeq += 1
  registry.tokens.set(identity, token)
  return token
}

function syncAlertOccurrences(alerts: SafetyAlert[], registry: AlertOccurrenceRegistry): void {
  const liveIdentities = new Set<string>(alerts.map(alertOccurrenceIdentity))

  for (const identity of registry.tokens.keys()) {
    if (!liveIdentities.has(identity)) registry.tokens.delete(identity)
  }

  for (const identity of liveIdentities) {
    ensureOccurrenceToken(identity, registry)
  }
}

function resetAlertOccurrences(registry: AlertOccurrenceRegistry): void {
  registry.tokens.clear()
  registry.nextSeq = 0
}

const AlertCard: React.FC<AlertCardProps> = ({ alert, dismissalKey, onDismiss }) => {
  const severityIcon = alert.severity === 'critical' ? <Siren size={16} /> : <AlertTriangle size={16} />
  const liveMode = alert.severity === 'critical' ? 'assertive' : 'polite'

  const handleDismiss = useCallback(() => {
    onDismiss(alert, dismissalKey)
  }, [alert, dismissalKey, onDismiss])

  return (
    <article
      className={`fs-alert fs-alert--${alert.severity}`}
      role={alert.severity === 'critical' ? 'alert' : 'status'}
      aria-live={liveMode}
    >
      <div className="fs-alert__rail" aria-hidden="true">
        {severityIcon}
      </div>

      <div className="fs-alert__content">
        <div className="fs-alert__meta">
          <span className={`fs-alert__source fs-alert__source--${alert.source}`}>
            {sourceLabel(alert)}
          </span>
          {alert.command && (
            <span className="fs-alert__badge">
              {alert.command}
            </span>
          )}
          {alert.droneId && (
            <span className="fs-alert__badge">
              {alert.droneId}
            </span>
          )}
        </div>

        <div className="fs-alert__title-row">
          <span className="fs-alert__type-icon" aria-hidden="true">
            {alertIcon(alert)}
          </span>
          <h2 className="fs-alert__title">{alert.title}</h2>
        </div>

        <p className="fs-alert__detail">{alert.detail}</p>
      </div>

      {alert.dismissible && (
        <button
          className="fs-alert__dismiss"
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss safety alert"
          title="Dismiss"
        >
          <X size={14} />
        </button>
      )}
    </article>
  )
}

const FailsafeAlerts: React.FC<FailsafeAlertsProps> = ({ readiness }) => {
  const active = useFailsafeStore((state) => state.active)
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set<string>())
  const alertOccurrenceRegistryRef = useRef<AlertOccurrenceRegistry>({
    tokens: new Map<string, string>(),
    nextSeq: 0,
  })
  const [alertOccurrenceRegistryAccess] = useState<AlertOccurrenceRegistryAccess>(() => ({
    read: (): AlertOccurrenceRegistry => alertOccurrenceRegistryRef.current,
  }))

  const activeFailsafes = useMemo(() => Object.values(active), [active])
  const allAlerts = useMemo(
    () => buildSafetyAlerts(readiness, activeFailsafes),
    [activeFailsafes, readiness],
  )
  const alertItems = buildAlertRenderItems(allAlerts, alertOccurrenceRegistryAccess)
  const visibleAlertItems = useMemo(
    () => alertItems.filter((item) => !dismissedKeys.has(item.dismissalKey)),
    [alertItems, dismissedKeys],
  )

  const handleDismiss = useCallback((alert: SafetyAlert, key: string) => {
    if (!alert.dismissible) return

    const identity = alertOccurrenceIdentity(alert)
    const occurrenceToken = ensureOccurrenceToken(identity, alertOccurrenceRegistryRef.current)
    const dismissalKey = key.endsWith(':pending') ? `${identity}:${occurrenceToken}` : key

    setDismissedKeys((current): Set<string> => {
      if (current.has(key) && current.has(dismissalKey)) return current
      const next = new Set<string>(current)
      if (key.endsWith(':pending')) next.add(key)
      next.add(dismissalKey)
      return next
    })
  }, [])

  useEffect(() => {
    syncAlertOccurrences(allAlerts, alertOccurrenceRegistryRef.current)
  }, [allAlerts])

  const simulateCriticalBattery = useCallback(() => {
    failsafeManager.simulateBatteryDrain('drone-1', 5)
  }, [])

  const simulateLowBattery = useCallback(() => {
    failsafeManager.simulateBatteryDrain('drone-1', 15)
  }, [])

  const simulateGpsDrop = useCallback(() => {
    failsafeManager.simulateGpsDrop('drone-1', 2)
  }, [])

  const simulateSignalLoss = useCallback(() => {
    failsafeManager.simulateSignalLoss('drone-1', true)
  }, [])

  const clearSimulation = useCallback(() => {
    failsafeManager.clearSimulation('drone-1')
    useFailsafeStore.getState().clearAll()
    resetAlertOccurrences(alertOccurrenceRegistryRef.current)
    setDismissedKeys(new Set<string>())
  }, [])

  if (visibleAlertItems.length === 0 && !import.meta.env.DEV) return null

  return (
    <aside className="fs-alerts-overlay" aria-label="Safety alerts">
      {visibleAlertItems.map((item) => (
        <AlertCard
          key={item.dismissalKey}
          alert={item.alert}
          dismissalKey={item.dismissalKey}
          onDismiss={handleDismiss}
        />
      ))}

      {import.meta.env.DEV && (
        <div className="fs-alerts-simbar" aria-label="Failsafe simulation controls">
          <span className="fs-alerts-simbar__label">SIM</span>
          <button
            className="fs-alerts-simbar__btn"
            type="button"
            onClick={simulateCriticalBattery}
            title="Simulate critical battery on drone-1"
          >
            <Battery size={12} /> Crit
          </button>
          <button
            className="fs-alerts-simbar__btn"
            type="button"
            onClick={simulateLowBattery}
            title="Simulate low battery on drone-1"
          >
            <Battery size={12} /> Low
          </button>
          <button
            className="fs-alerts-simbar__btn"
            type="button"
            onClick={simulateGpsDrop}
            title="Simulate GPS drop on drone-1"
          >
            <Satellite size={12} /> GPS
          </button>
          <button
            className="fs-alerts-simbar__btn"
            type="button"
            onClick={simulateSignalLoss}
            title="Simulate signal loss on drone-1"
          >
            <Radio size={12} /> Loss
          </button>
          <button
            className="fs-alerts-simbar__btn fs-alerts-simbar__btn--clear"
            type="button"
            onClick={clearSimulation}
            title="Clear simulation overrides and dismissed alerts"
          >
            <X size={12} /> Clear
          </button>
        </div>
      )}
    </aside>
  )
}

export default FailsafeAlerts
