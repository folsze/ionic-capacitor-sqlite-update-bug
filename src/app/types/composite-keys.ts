export type CompositeKey = MapKey | ModeKey | LocationKey;

export interface MapKey {
  mapId: number;
}
export interface ModeKey {
  mapId: number;
  modeId: number;
}
export interface LocationKey {
  mapId: number;
  modeId: number;
  locationId: number;
}
