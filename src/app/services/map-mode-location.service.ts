import {capSQLiteChanges, DBSQLiteValues, SQLiteDBConnection} from '@capacitor-community/sqlite';
import { Injectable } from '@angular/core';
import {BehaviorSubject, from, map, Observable, ObservedValueOf, Subject, throwError} from 'rxjs';

import { SQLiteService } from './sqlite.service';
import { DbnameVersionService } from './dbname-version.service';
import { environment } from 'src/environments/environment';
import {mapModeLocationVersionUpgrades} from '../upgrades/upgrade-statements';
import {DB_MAPS} from '../data/maps';
import {DB_MODES} from '../data/modes';

import {DB_MODE} from '../data/DB_MODE';
import {DB_MAP} from '../data/DB_MAP';

import { IdsSeq } from '../models/ids-seq';
import {DB_LOCATION} from '../data/DB_LOCATION';
import {DB_LOCATIONS} from '../data/locations';
import {LocationKey, ModeKey} from '../types/composite-keys';
import {MY_UTIL} from '../MY_UTIL';

@Injectable()
export class MapModeLocationService {
  public databaseName: string;
  public mapList$: BehaviorSubject<DB_MAP[]> = new BehaviorSubject<DB_MAP[]>([]);
  public modeList$: BehaviorSubject<DB_MODE[]> = new BehaviorSubject<DB_MODE[]>([]);
  public locationList$: BehaviorSubject<DB_LOCATION[]> = new BehaviorSubject<DB_LOCATION[]>([]);
  public idsSeqList$: BehaviorSubject<IdsSeq[]> = new BehaviorSubject<IdsSeq[]>([]);
  public currentLocation$: Subject<DB_LOCATION> = new Subject();

  private isModeReady$: BehaviorSubject<boolean> = new BehaviorSubject(false);
  private isMapReady$: BehaviorSubject<boolean> = new BehaviorSubject(false);
  private isLocationReady$: BehaviorSubject<boolean> = new BehaviorSubject(false);
  private isIdsSeqReady$: BehaviorSubject<boolean> = new BehaviorSubject(false);
  private versionUpgrades = mapModeLocationVersionUpgrades;
  private loadToVersion = mapModeLocationVersionUpgrades[mapModeLocationVersionUpgrades.length-1].toVersion;
  private mDb!: SQLiteDBConnection;

  constructor(private sqliteService: SQLiteService, private dbVerService: DbnameVersionService) {
    this.databaseName = environment.databaseNames[0].name; // for multiple dbs: .filter(x => x.name.includes('modes'))
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
    await this.saveOrUpdateAllData();
  }
  async openDatabase() {
    this.mDb = await this.sqliteService
      .openDatabase(this.databaseName, false, "no-encryption",
        this.loadToVersion,false);
  }
  async saveOrUpdateAllData(): Promise<void> {
    await this.getAllMaps();
    this.isMapReady$.next(true); //NOTE: I changed order. Might cause bugs... probably not since no db interaction
    await this.getAllModes();
    this.isModeReady$.next(true);
    await this.getAllLocations();
    this.isLocationReady$.next(true);
    await this.getAllIdsSeq();
    this.isIdsSeqReady$.next(true);
  }

  /**
   * Return Mode state
   * @returns
   */
  modeState(): Observable<boolean> {
    return this.isModeReady$.asObservable();
  }
  /**
   * Return Map state
   * @returns
   */
  mapState(): Observable<boolean> {
    return this.isMapReady$.asObservable();
  }
  /**
   * Return Ids Sequence state
   * @returns
   */
  idsSeqState(): Observable<boolean> {
    return this.isIdsSeqReady$.asObservable();
  }

  /**
   * Fetch Modes
   * @returns
   */
  fetchModes(): Observable<DB_MODE[]> {
    return this.modeList$.asObservable();
  }
  /**
   * Fetch Maps
   * @returns
   */
  fetchMaps(): Observable<DB_MAP[]> {
    return this.mapList$.asObservable();
  }
  /**
   * Fetch Ids Sequence
   * @returns
   */
  fetchIdsSeq(): Observable<IdsSeq[]> {
    return this.idsSeqList$.asObservable();
  }

  /**
   * @param currentLocationKey Based on this getNewDifferentRandomLocation from all locations of this mode
   */
  public async getNewDifferentRandomLocation(currentLocationKey: LocationKey): Promise<void> {
    const newLocations: DB_LOCATION[] = (await this.mDb.query(`
      SELECT * FROM Location
      WHERE
        Location.locationId != ${currentLocationKey.locationId}
        AND Location.mapId = ${currentLocationKey.mapId}
        AND Location.modeId = ${currentLocationKey.modeId}
      ORDER BY
        CASE WHEN Location.progress < 7 THEN 1 ELSE 0 END DESC,
        RANDOM()
      LIMIT 1;
    `)).values as DB_LOCATION[];
    if (newLocations.length !== 1) {
      console.error('Query failed');
    }
    this.currentLocation$.next(newLocations[0]);
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
   * Get all Maps
   * @returns
   */
  async getAllMaps(): Promise<void> {
    const maps: DB_MAP[] = (await this.mDb.query("select * from map")).values as DB_MAP[];
    this.mapList$.next(maps);
  }

  public getMap(mapId: number): Observable<DB_MAP> {
    const stmt = `select * from map WHERE ${MY_UTIL.getWhereConditions({mapId})}`;
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
      if (maps.length !== 1) console.error('Assertion failed');
      return maps[0];
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
   * Get all Modes
   * @returns
   */
  async getAllModes(): Promise<void> {
    // Query the mode table
    const stmt = `select * from mode`;
    const modes = (await this.mDb.query(stmt)).values;
    const modesData: DB_MODE[] = [];
    for (const mode of modes!) {
      const modeData = new DB_MODE();
      modeData.modeId = mode.modeId;
      modeData.mapId = mode.mapId; // TODO: this will be used for complex object mappings
      modeData.name = mode.name;
      modesData.push(modeData);
    }
    this.modeList$.next(modesData);
  }

  public getMode(modeKey: ModeKey): Observable<DB_MODE> {
    const stmt = `select * from mode WHERE ${MY_UTIL.getWhereConditions(modeKey)}`;
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
      if (modes.length !== 1) console.error('Assertion failed');
      return modes[0];
    }));
  }

  public getModesOfMap(mapId: number): Observable<DB_MAP[]> {
    const stmt = `select * from mode WHERE ${MY_UTIL.getWhereConditions({mapId})}`;
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

  /**
   * Resets the progress for the mode that matches the modeKey
   * @param modeKey
   */
  public resetProgress(modeKey: ModeKey): Observable<ObservedValueOf<Promise<capSQLiteChanges>>> {
    try {
      return from(this.mDb.run(`
        UPDATE location
        SET progress = 0
        WHERE mapId = ${modeKey.mapId} AND modeId = ${modeKey.modeId};

        UPDATE mode -- TODO: make this be inside a separate query? And/or: make it all be a transaction? Since it's multiple statements...
        SET progress = (
          SELECT AVG(sumProgress) FROM (
            SELECT SUM(progress/${MY_UTIL.maxProgress}) as sumProgress
            FROM location
            WHERE mapId = ${modeKey.mapId} AND modeId = ${modeKey.modeId}
            GROUP BY mapId, modeId, locationId
          ) as subquery
        )
        WHERE modeId = ${modeKey.modeId};

        UPDATE map
        SET progress = (
          SELECT AVG(sumProgress) FROM (
            SELECT SUM(progress) as sumProgress
            FROM mode
            WHERE mapId = ${modeKey.mapId}
            GROUP BY mapId, modeId
          ) as subquery
        )
        WHERE mapId = ${modeKey.mapId};
        `
      ));
      /* // TODO at some point:
      if(ret.changes!.changes != 1) {
        return Promise.reject(`save: insert changes != 1`);
      }
      */
    } catch (error: any) {
      console.error('error while updating progress');
      return throwError(() => 'error while updating progress: ' + error.message);
    }
  }

  /**
   * Get all Locations
   * @returns
   */
  async getAllLocations(): Promise<void> {
    // Query the location table
    const stmt = `select * from location`;
    const rawLocations = (await this.mDb.query(stmt)).values;
    const locations: DB_LOCATION[] = [];
    for (const rawLocation of rawLocations!) {
      const location = new DB_LOCATION();
      location.mapId = rawLocation.mapId; // TODO: this will be used for complex object mappings
      location.modeId = rawLocation.modeId;
      location.locationId = rawLocation.locationId;
      location.progress = rawLocation.progress;
      location.name = rawLocation.name;
      locations.push(location);
    }
    this.locationList$.next(locations);
  }

  public getLocationsOfMode(modeKey: ModeKey): Observable<DB_LOCATION[]> {
    const stmt = `select * from location WHERE ${MY_UTIL.getWhereConditions(modeKey)}`;
    const valuesWrapper$: Observable<DBSQLiteValues> = from(this.mDb.query(stmt)); // todo: type correct?
    return valuesWrapper$.pipe(map(valuesWrapper => {
      const rawJsonObjs: any[] = valuesWrapper.values!;
      const locations: DB_LOCATION[] = [];
      for (const jsonObj of rawJsonObjs) {
        if (jsonObj.progress === undefined) console.error('Assertion failed: progress should only be undefined onCreate.');
        const location = new DB_LOCATION();
        location.mapId = jsonObj.mapId; // NOTE: this will be used for complex object mappings
        location.modeId = jsonObj.modeId;
        location.locationId = jsonObj.locationId;
        location.progress = jsonObj.progress;
        location.name = jsonObj.name;
        locations.push(location);
      }
      return locations;
    }));
  }

  public getLocation(locationKey: LocationKey): Observable<DB_LOCATION> {
    const stmt = `select * from location WHERE ${MY_UTIL.getWhereConditions(locationKey)}`;
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
      if (locations.length !== 1) console.error('Assertion failed');
      return locations[0];
    }));
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

  /**
   * Get
   * all Ids Sequence
   * @returns
   */
  async getAllIdsSeq(): Promise<void> {
    const idsSeq: IdsSeq[] = (await this.mDb.query("select * from sqlite_sequence")).values as IdsSeq[];
    this.idsSeqList$.next(idsSeq);
  }
  /**
   * Get Mode from ModeData
   * @param mode
   * @returns
   */
  getModeFromModeData(mode: DB_MODE): DB_MODE {
    const modeJson: DB_MODE = new DB_MODE();
    modeJson.modeId = mode.modeId;
    modeJson.mapId = mode.mapId; // todo: simplification mapping
    return modeJson;
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
