import { Component, OnInit } from '@angular/core';
import {MapModeLocationService} from '../services/map-mode-location.service';
import {first, Observable, tap} from 'rxjs';
import {MY_UTIL} from '../MY_UTIL';
import {InfiniteScrollCustomEvent} from '@ionic/angular';
import {DB_MAP} from '../types/DB_MAP';
import {DB_MODE} from '../types/DB_MODE';
import {DB_LOCATION} from '../types/DB_LOCATION';

@Component({
  selector: 'app-test',
  templateUrl: './test.page.html',
  styleUrls: ['./test.page.scss'],
})
export class TestPage implements OnInit {
  public allMaps$: Observable<DB_MAP[]>;
  public allModes$: Observable<DB_MODE[]>;
  public allLocations$: Observable<DB_LOCATION[]>

  private readonly CHUNK_SIZE = 50;
  public displayedLocationsCount = this.CHUNK_SIZE;
  private startTime = new Date().getTime();

  constructor(private mapModeLocationService: MapModeLocationService) { }

  ngOnInit() {
    this.allMaps$ = this.mapModeLocationService.getAllMaps1();
    this.allModes$ = this.mapModeLocationService.getAllModes1();
    this.allLocations$ = this.mapModeLocationService.getAllLocations1();
  }

  ionViewDidEnter() {
    const elapsed = new Date().getTime() - this.startTime;
    console.log('ionViewDidEnter after', elapsed, 'ms.');
  }

  public decreaseProgress(location: DB_LOCATION) {
    if (location.progress! < MY_UTIL.maxProgress) {
      const clone = MY_UTIL.clone<DB_LOCATION>(location);
      clone.progress!++;
      this.mapModeLocationService.updateLocationProgress(clone).pipe(first()).subscribe(
        () => {
          location.progress!++;
          this.allModes$ = this.mapModeLocationService.getAllModes1();
          this.allMaps$ = this.mapModeLocationService.getAllMaps1();
        }
      );
    } else {
      // do nothing
    }
  }

  public increaseProgress(location: DB_LOCATION) {
    if (location.progress! > 0) {
      const clone = MY_UTIL.clone<DB_LOCATION>(location);
      clone.progress!--;
      console.log('Updating with: ', clone);
      this.mapModeLocationService.updateLocationProgress(clone).pipe(first()).subscribe(
        () => {
          location.progress!--;
          this.allModes$ = this.mapModeLocationService.getAllModes1();
          this.allMaps$ = this.mapModeLocationService.getAllMaps1();
        }
      );
    } else {
      // do nothing
    }
  }

  doSomething() {
  }

  onIonInfinite(ev: any) {
    this.displayedLocationsCount += this.CHUNK_SIZE;
    // setTimeout(() => {
    //   (ev as InfiniteScrollCustomEvent).target.complete();
    // }, 0); // if this is more, the user will have to scroll up & down again
    (ev as InfiniteScrollCustomEvent).target.complete();
  }
}
