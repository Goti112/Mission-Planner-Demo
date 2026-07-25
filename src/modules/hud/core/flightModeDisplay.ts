import { FlightMode } from '../../telemetry';

const PFD_AUTO_DISPLAY_LABEL = 'AUTO';

const PFD_AUTO_DISPLAY_MODES = new Set<FlightMode>([
  FlightMode.RTL,
  FlightMode.SMART_RTL,
  FlightMode.AUTO_RTL,
]);

function containsRtl(value: string): boolean {
  return value.toUpperCase().includes('RTL');
}

export function getPFDModeDisplayKey(mode: FlightMode | string, label: string): string {
  const modeIsAutoDisplay = PFD_AUTO_DISPLAY_MODES.has(mode as FlightMode);
  return modeIsAutoDisplay || containsRtl(mode) || containsRtl(label)
    ? PFD_AUTO_DISPLAY_LABEL
    : mode;
}

export function getPFDModeDisplayLabel(mode: FlightMode | string, label: string): string {
  const modeIsAutoDisplay = PFD_AUTO_DISPLAY_MODES.has(mode as FlightMode);
  return modeIsAutoDisplay || containsRtl(mode) || containsRtl(label)
    ? PFD_AUTO_DISPLAY_LABEL
    : label;
}
