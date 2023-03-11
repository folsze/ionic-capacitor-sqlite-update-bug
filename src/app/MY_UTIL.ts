import {SimpleChanges} from '@angular/core';
import {CompositeKey} from './types/composite-keys';

export const MY_UTIL = {
  roundToXDigits: (value: number, digits: number): number => {
    value = value * Math.pow(10, digits);
    value = Math.round(value);
    value = value / Math.pow(10, digits);
    return value;
  },
  maxProgress: 7,
  clone: <T>(obj: T): T => JSON.parse(JSON.stringify(obj)),
  debugNgOnChanges: (changes: SimpleChanges, props: string[]): void => {
    console.log('✅✅✅✅ ngOnChanges');
    let changesCount = 0;
    props.forEach(
      (prop) => {
        if (changes[prop] && changes[prop]?.currentValue !== undefined && changes[prop].currentValue   !== null) {
          console.log(prop + ': ' + changes[prop]?.previousValue + ' -> ' + changes[prop].currentValue);
          changesCount++;
        }
      }
    );
    console.log('⚠ RESULTING TOTAL # of changes: (' + changesCount + '/' + props.length + ')')
    console.log();
    console.log();
  },
  getWhereConditions: (where: CompositeKey): string => {
    const keys_values = Object.entries(where);
    const conditions: string[] = keys_values.map(([key, value]) => `${key}=${value}`);
    return conditions.join(' AND ');
  },
  /**
   * SetNameForUpdate
   * @param names
   */
  setNameForUpdate: (names: string[]): string => {
    let retString = '';
    for (const name of names) {
      retString += `${name} = ? ,`;
    }
    if (retString.length > 1) {
      retString = retString.slice(0, -1);
      return retString;
    } else {
      throw Error('SetNameForUpdate: length = 0');
    }
  }
};
