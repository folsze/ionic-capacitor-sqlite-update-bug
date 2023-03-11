import {capSQLiteChanges, DBSQLiteValues, SQLiteDBConnection} from '@capacitor-community/sqlite';
import { Injectable } from '@angular/core';
import {BehaviorSubject, from, map, Observable, ObservedValueOf, Subject, throwError} from 'rxjs';

import { SQLiteService } from './sqlite.service';
import { DbnameVersionService } from './dbname-version.service';
import { environment } from 'src/environments/environment';
import {DB_MAPS} from '../data/maps';
import {DB_MODES} from '../data/modes';

import {DB_LOCATIONS} from '../data/locations';
import {LocationKey, ModeKey} from '../types/composite-keys';
import {DB_MAP} from '../types/DB_MAP';
import {DB_MODE} from '../types/DB_MODE';
import {DB_LOCATION} from '../types/DB_LOCATION';
import {mapModeLocationVersionUpgrades} from '../upgrade-statement';

@Injectable()
export class MapModeLocationService {
  public databaseName: string;
  private versionUpgrades = mapModeLocationVersionUpgrades;
  private loadToVersion = mapModeLocationVersionUpgrades[mapModeLocationVersionUpgrades.length-1].toVersion;
  private mDb!: SQLiteDBConnection;

  constructor(private sqliteService: SQLiteService, private dbVerService: DbnameVersionService) {
    this.databaseName = environment.databaseNames[0].name; // for multiple dbs: .filter(x => x.name.includes('modes'))
  }

  public getAllLocations1(): Observable<DB_LOCATION[]> {
    const stmt = `select * from location`;
    const valuesWrapper$: Observable<DBSQLiteValues> = from(this.mDb.query(stmt)); // todo: type correct?
    return valuesWrapper$.pipe(map(valuesWrapper => {
      const rawJsonObjs: any[] = valuesWrapper.values!;
      const locations: DB_LOCATION[] = [];
      for (const jsonObj of rawJsonObjs) {
        if (jsonObj.progress === undefined) console.error('Assertion failed: progress should only be undefined onCreate.');
        const location = new DB_LOCATION();
        location.mapId = jsonObj.mapId;
        location.modeId = jsonObj.modeId;
        location.locationId = jsonObj.locationId;
        location.progress = jsonObj.progress;
        location.name = jsonObj.name;
        locations.push(location);
      }
      return locations;
    }));
  }

  public getAllModes1(): Observable<DB_MODE[]> {
    const stmt = `select * from mode`;
    const valuesWrapper$: Observable<DBSQLiteValues> = from(this.mDb.query(stmt)); // todo: type correct?
    return valuesWrapper$.pipe(map(valuesWrapper => {
      const rawJsonObjs: any[] = valuesWrapper.values!;
      const modes: DB_MODE[] = [];
      for (const jsonObj of rawJsonObjs) {
        if (jsonObj.progress === undefined) console.error('Assertion failed: progress should only be undefined onCreate.');
        const mode = new DB_MODE();
        mode.mapId = jsonObj.mapId;
        mode.modeId = jsonObj.modeId;
        mode.progress = jsonObj.progress;
        mode.name = jsonObj.name;
        modes.push(mode);
      }
      return modes;
    }));
  }

  public getAllMaps1(): Observable<DB_MAP[]> {
    const stmt = `select * from map`;
    const valuesWrapper$: Observable<DBSQLiteValues> = from(this.mDb.query(stmt)); // todo: type correct?
    return valuesWrapper$.pipe(map(valuesWrapper => {
      const rawJsonObjs: any[] = valuesWrapper.values!;
      const maps: DB_MAP[] = [];
      for (const jsonObj of rawJsonObjs) {
        if (jsonObj.progress === undefined) console.error('Assertion failed: progress should only be undefined onCreate.');
        const map = new DB_MAP();
        map.mapId = jsonObj.mapId;
        map.progress = jsonObj.progress;
        map.name = jsonObj.name;
        maps.push(map);
      }
      return maps;
    }));
  }

  async initializeDatabase() {
    // create upgrade statements
    await this.sqliteService // NOTE: this initializes
      .addUpgradeStatement({ database: this.databaseName,
        upgrade: this.versionUpgrades});
    // create and/or open the database
    await this.openDatabase();
    this.dbVerService.set(this.databaseName,this.loadToVersion);
    const isData = await this.mDb.query("select * from sqlite_sequence");
    // create database initial data
    if(isData.values!.length === 0) {
      await this.createInitialData();
    }
    if( this.sqliteService.platform === 'web') {
      await this.sqliteService.sqliteConnection.saveToStore(this.databaseName);
    }
  }

  async openDatabase() {
    this.mDb = await this.sqliteService
      .openDatabase(this.databaseName, false, "no-encryption",
        this.loadToVersion,false);
  }

  /**
   * Get, Create, Update a Map
   * @returns
   */
  async cruMap(jsonMap: DB_MAP): Promise<DB_MAP> {
    let map: DB_MAP = await this.sqliteService.findOneBy(this.mDb, "map", {mapId: jsonMap.mapId});
    if(!map) {
      if(jsonMap.mapId) { // TODO: when is this not the case???
        // create a new map
        const newMap = await this.mapDtoToEntity(jsonMap);
        await this.sqliteService.save(this.mDb, "map", newMap);
        map = await this.sqliteService.findOneBy(this.mDb, "map", {mapId: jsonMap.mapId});
        if(map) {
          return map;
        } else {
          return Promise.reject(`failed to getMap for id ${jsonMap.mapId}`);
        }
      } else {
        // map not in the database
        map = new DB_MAP();
        map.mapId = -1;
        return map;
      }
    } else {
      if(Object.keys(jsonMap).length > 1) {
        // update and existing map
        const updMap = new DB_MAP();
        updMap.mapId = jsonMap.mapId;
        updMap.name = jsonMap.name;

        await this.sqliteService.save(this.mDb, "map", updMap, {mapId: jsonMap.mapId});
        map = await this.sqliteService.findOneBy(this.mDb, "map", {mapId: jsonMap.mapId});
        if(map) {
          return map;
        } else {
          return Promise.reject(`failed to getMap for id ${jsonMap.mapId}`);
        }
      } else {
        return map;
      }
    }
  }


  /**
   * Get, Create, Update an Mode
   * @returns
   */
  async cruMode(inputMode: DB_MODE): Promise<DB_MODE> {
    const modeKey = {modeId: inputMode.modeId, mapId: inputMode.mapId};
    let retMode = await this.sqliteService.findOneBy(this.mDb, "mode", modeKey) as DB_MODE;
    if(!retMode) {
      if(inputMode.modeId) { // TODO: when is this not the case???
        // create a new Mode
        const mode: DB_MODE = await this.modeDtoToEntity(inputMode);
        await this.sqliteService.save(this.mDb, "mode", mode);
        retMode = await this.sqliteService.findOneBy(this.mDb, "mode", modeKey) as DB_MODE;
        return retMode;
      } else {
        // post not in the database
        const mMode = new DB_MODE();
        mMode.modeId = -1;
        return mMode;
      }
    } else {
      if(Object.keys(inputMode).length > 1) {
        // update an existing Mode
        const updMode = await this.modeDtoToEntity(inputMode);
        await this.sqliteService.save(this.mDb, "mode", updMode, modeKey);
        const mode = (await this.sqliteService.findOneBy(this.mDb, "mode", modeKey)) as DB_MODE;
        if(mode) {
          return mode;
        } else {
          return Promise.reject(`failed to getMode for id ${inputMode.modeId}`);
        }
      } else {
        return retMode;
      }
    }
  }

  /**
   * Get, Create, Update an Location
   * @returns
   */
  async cruLocation(inputLocation: DB_LOCATION): Promise<DB_LOCATION> {
    const locationKey = {mapId: inputLocation.mapId, modeId: inputLocation.modeId, locationId: inputLocation.locationId };
    let retLocation = await this.sqliteService.findOneBy(this.mDb, "location", locationKey) as DB_LOCATION;
    if(!retLocation) {
      if(inputLocation.locationId) { // TODO: when is this not the case???
        // create a new Location
        const location: DB_LOCATION = await this.locationDtoToEntity(inputLocation);
        console.log('Gonna save based on those two: ');
        console.log(JSON.stringify(inputLocation));
        console.log(JSON.stringify(location));
        if (location === undefined) console.error('Assertion failed about cruLocation');
        if (inputLocation === undefined) console.error('Assertion failed about cruLocation1');
        await this.sqliteService.save(this.mDb, "location", location);
        retLocation = await this.sqliteService.findOneBy(this.mDb, "location", locationKey) as DB_LOCATION;
        return retLocation;
      } else {
        // post not in the database
        const mLocation = new DB_LOCATION();
        mLocation.locationId = -1;
        return mLocation;
      }
    } else {
      if(Object.keys(inputLocation).length > 1) {
        // update an existing Location
        const updLocation = await this.locationDtoToEntity(inputLocation);
        const locationKey: LocationKey = {mapId: inputLocation.mapId, modeId: inputLocation.modeId, locationId: inputLocation.locationId };
        await this.sqliteService.save(this.mDb, "location", updLocation, locationKey);
        const location = (await this.sqliteService.findOneBy(this.mDb, "location", locationKey)) as DB_LOCATION;
        if(location) {
          return location;
        } else {
          return Promise.reject(`failed to getLocation for id ${inputLocation.locationId}`);
        }
      } else {
        return retLocation;
      }
    }
  }

  public updateLocationProgress(location: DB_LOCATION): Observable<ObservedValueOf<Promise<capSQLiteChanges>>> {
    // TODO: ChatGPT suggested to make this statement of multiple queries use BEGIN AND COMMIT -> should I?
    const stmt = `
      UPDATE map
      SET progress = 0.3
      WHERE mapId = ${location.mapId};

      UPDATE mode
      SET progress = 0.3
      WHERE mapId = ${location.mapId} AND modeId = ${location.modeId};

      UPDATE location
      SET progress = 0
      WHERE mapId = ${location.mapId} AND modeId = ${location.modeId} AND locationId = ${location.locationId};
    `;
    console.log(stmt);
    return from(this.mDb.run(stmt, [])); // the only value of values is the one that has a '?' in the statement
  }



  /*********************
   * Private Functions *
   *********************/

  /**
   * Create Database Initial Data
   * @returns
   */
  private async createInitialData(): Promise<void> {
    // create maps
    console.log('💾 Starting to create initial data...');
    for (const map of DB_MAPS) {
      await this.cruMap(map);
    }
    // create modes
    for (const mode of DB_MODES) {
      await this.cruMode(mode);
    }
    // create modes
    for (const location of DB_LOCATIONS) {
      await this.cruLocation(location);
    }
    console.log('💾 Finished creating initial data.');
  }

  private async mapDtoToEntity(jsonMap: DB_MAP) {
    const map = new DB_MAP();
    map.mapId = jsonMap.mapId;
    map.name = jsonMap.name;
    if (jsonMap.progress === undefined) { // initial creation
      map.progress = 0;
    } else {
      map.progress = jsonMap.progress;
    }
    return map;
  }

  private async modeDtoToEntity(jsonMode: DB_MODE): Promise<DB_MODE> {
    const mode = new DB_MODE();
    mode.mapId = jsonMode.mapId;
    mode.modeId = jsonMode.modeId;
    mode.name = jsonMode.name;
    if (jsonMode.progress === undefined) { // initial creation
      mode.progress = 0;
    } else {
      console.log(jsonMode);
      mode.progress = jsonMode.progress;
    }
    return mode;
  }

  private async locationDtoToEntity(jsonLocation: DB_LOCATION): Promise<any> {
    const location = new DB_LOCATION();
    location.mapId = jsonLocation.mapId;
    location.modeId = jsonLocation.modeId;
    location.locationId = jsonLocation.locationId;
    if (jsonLocation.progress === undefined) { // initial creation
      location.progress = 0;
    } else {
      location.progress = jsonLocation.progress;
    }
    location.name = jsonLocation.name;
    return location;
  }

}
