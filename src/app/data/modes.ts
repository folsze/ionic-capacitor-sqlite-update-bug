import {Observable} from 'rxjs';
import {DB_MODE} from '../types/DB_MODE';

const location_by_name = 'Location by name';
const name_by_location = 'Name by location';

export const DB_MODES: DB_MODE[] = [ // todo: any -> Location
  {mapId: 1, modeId: 1, name: location_by_name},
  {mapId: 1, modeId: 2, name: name_by_location},
  {mapId: 2, modeId: 1, name: location_by_name},
  {mapId: 2, modeId: 2, name: name_by_location},
  {mapId: 3, modeId: 1, name: location_by_name},
  {mapId: 3, modeId: 2, name: name_by_location},
  {mapId: 4, modeId: 1, name: location_by_name},
  {mapId: 4, modeId: 2, name: name_by_location},
  {mapId: 5, modeId: 1, name: location_by_name},
  {mapId: 5, modeId: 2, name: name_by_location},
  {mapId: 6, modeId: 1, name: location_by_name},
  {mapId: 6, modeId: 2, name: name_by_location},
  {mapId: 7, modeId: 1, name: location_by_name},
  {mapId: 7, modeId: 2, name: name_by_location}
];

export const modes: Mode[] = [
  {
    title: 'Guess location by name',
    icon: 'map',
  },
  {
    title: 'Guess location by number',
    icon: 'map-outline',
  },
  {
    title: 'Guess name by location',
    icon: 'text',
  },
  {
    title: 'Guess name by number',
    icon: 'text-outline',
  },
  {
    title: 'Guess number by location',
    icon: 'apps',
  },
  {
    title: 'Guess number by name',
    icon: 'apps-outline',
  },
];

class Mode {
  title: string;
  icon: string;
  totalProgress$?: Observable<number>; // [0.0;1.0]
}
