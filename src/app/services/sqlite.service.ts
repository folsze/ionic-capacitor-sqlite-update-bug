import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection, CapacitorSQLitePlugin,
  capSQLiteUpgradeOptions, capSQLiteValues} from '@capacitor-community/sqlite';
import { DbnameVersionService } from 'src/app/services/dbname-version.service';
import {CompositeKey} from '../types/composite-keys';
import {MY_UTIL} from '../MY_UTIL';

@Injectable()
export class SQLiteService {
  sqliteConnection!: SQLiteConnection;
  isServiceReady: boolean = false;
  platform!: string;
  sqlitePlugin!: CapacitorSQLitePlugin;
  native: boolean = false;
  constructor(private dbVerService: DbnameVersionService) {
  }
  /**
   * Plugin Initialization
   */
  async initializePlugin(): Promise<boolean> {
    this.platform = Capacitor.getPlatform();
    if(this.platform === 'ios' || this.platform === 'android') this.native = true;
    this.sqlitePlugin = CapacitorSQLite;
    this.sqliteConnection = new SQLiteConnection(this.sqlitePlugin);
    this.isServiceReady = true;
    return true;
  }

  async initWebStore(): Promise<void> {
    try {
      await this.sqliteConnection.initWebStore();
    } catch(err: any) {
      const msg = err.message ? err.message : err;
      return Promise.reject(`initWebStore: ${err}`);
    }
  }

  async openDatabase(dbName:string, encrypted: boolean, mode: string, version: number, readonly: boolean): Promise<SQLiteDBConnection> {
    let db: SQLiteDBConnection;
    const retCC = (await this.sqliteConnection.checkConnectionsConsistency()).result;
    let isConn = (await this.sqliteConnection.isConnection(dbName, readonly)).result;
    if(retCC && isConn) {
      db = await this.sqliteConnection.retrieveConnection(dbName, readonly);
    } else {
      db = await this.sqliteConnection
        .createConnection(dbName, encrypted, mode, version, readonly);
    }
    await db.open();
    return db;
  }
  async retrieveConnection(dbName:string, readonly: boolean): Promise<SQLiteDBConnection> {
    return await this.sqliteConnection.retrieveConnection(dbName, readonly);
  }
  async closeConnection(database:string, readonly?: boolean): Promise<void> {
    const readOnly = readonly ? readonly : false;
    return await this.sqliteConnection.closeConnection(database, readOnly);
  }
  async addUpgradeStatement(options:capSQLiteUpgradeOptions): Promise<void> { // NOTE: this initializes
    await this.sqlitePlugin.addUpgradeStatement(options);
    return;
  }
  async getDatabaseList(): Promise<capSQLiteValues> {
    return await this.sqliteConnection.getDatabaseList();
  }
  async findOneBy(mDb: SQLiteDBConnection, table: string, where: CompositeKey): Promise<any> {
    try {
      const stmt: string = `SELECT * FROM ${table} WHERE ${MY_UTIL.getWhereConditions(where)};`
      const retValues = (await mDb.query(stmt)).values; // TODO: no sqlinjection because no direct user input? Find by name would be?
      const ret = retValues!.length > 0 ? retValues![0] : null;
      return ret;
    } catch(err:any) {
      const msg = err.message ? err.message : err;
      return Promise.reject(`findOneBy err: ${msg}`);
    }
  }
  async save(mDb: SQLiteDBConnection, table: string, mObj: any, where?: any): Promise<void> {
    const isUpdate: boolean = where ? true : false;
    const keys: string[] = Object.keys(mObj);
    let stmt: string = '';
    let values: any[] = [];
    for (const key of keys) {
      values.push(mObj[key]);
    }
    if(!isUpdate) {
      // INSERT
      const qMarks: string[] = [];
      for (const key of keys) {
        qMarks.push('?');
      }
      stmt = `INSERT INTO ${table} (${keys.toString()}) VALUES (${qMarks.toString()});`;
    } else {
      // UPDATE
      const setString: string = MY_UTIL.setNameForUpdate(keys);
      if(setString.length === 0) {
        return Promise.reject(`save: update no SET`);
      }
      stmt = `UPDATE ${table} SET ${setString} WHERE ${MY_UTIL.getWhereConditions(where)}`;
    }
    const ret = await mDb.run(stmt,values);
    if(ret.changes!.changes != 1) {
      return Promise.reject(`save: insert changes != 1`);
    }
    return;
  }
}
