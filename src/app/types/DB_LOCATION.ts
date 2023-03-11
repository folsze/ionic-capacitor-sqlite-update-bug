export class DB_LOCATION {
  locationId: number;
  modeId: number;
  mapId: number;
  name: string;
  progress?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7; // optional when first creating
}
