import { getMissionCommandDefinition } from './MissionCommandCatalog';
import type { MissionItem, MissionMapPoint, MissionPlan, MissionTableRow } from './MissionTypes';

interface SpatialMissionItem extends MissionItem {
  readonly coordinate: NonNullable<MissionItem['coordinate']>;
}

const hasMissionCoordinate = (item: MissionItem): item is SpatialMissionItem => item.coordinate !== null;

const isNavigationRouteItem = (item: SpatialMissionItem): boolean => {
  const commandDefinition = getMissionCommandDefinition(item.command);

  return commandDefinition.category === 'nav' && commandDefinition.hasCoordinate;
};

const toMissionTableRow = (item: MissionItem): MissionTableRow => ({
  id: item.id,
  seq: item.seq,
  command: item.command,
  frame: item.frame,
  param1: item.params[0],
  param2: item.params[1],
  param3: item.params[2],
  param4: item.params[3],
  lat: item.coordinate === null ? null : item.coordinate.lat,
  lng: item.coordinate === null ? null : item.coordinate.lng,
  alt: item.coordinate === null ? null : item.coordinate.alt,
  autocontinue: item.autocontinue,
});

const toMissionMapPoint = (item: SpatialMissionItem): MissionMapPoint => ({
  id: item.id,
  seq: item.seq,
  command: item.command,
  lat: item.coordinate.lat,
  lng: item.coordinate.lng,
  alt: item.coordinate.alt,
});

export const selectMissionTableRows = (plan: MissionPlan): readonly MissionTableRow[] =>
  plan.items.map(toMissionTableRow);

export const selectMissionMapPoints = (plan: MissionPlan): readonly MissionMapPoint[] =>
  plan.items.filter(hasMissionCoordinate).map(toMissionMapPoint);

export const selectMissionRoutePoints = (plan: MissionPlan): readonly MissionMapPoint[] =>
  plan.items.filter(hasMissionCoordinate).filter(isNavigationRouteItem).map(toMissionMapPoint);

export const selectUploadableMissionItems = (plan: MissionPlan): readonly MissionItem[] =>
  [...plan.items].sort((first, second) => first.seq - second.seq);
