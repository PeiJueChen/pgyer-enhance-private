import { Platform } from '@angular/cdk/platform';
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AppDataService {

  deviceConfig: any;
  currentAppInfo: any;

  pgyerOriginalLink;
  apiKey;
  platform;
  env;
  app;
  realVerions: any[] = [];
  itemVersions: any = [];
  href;
  constructor(public platformService: Platform) {

  }


  getDownloadUrl(item) {

    const password = this.currentAppInfo?.buildPassword;
    const buildKey = item.buildKey;
    if (!buildKey) return "";

    const url = `https://www.pgyer.com/apiv2/app/install?_api_key=0202f5206763d902070f95c7826cb794&buildKey=${buildKey}`;
    return !!password ? `${url}&buildPassword=${password}` : url;

    // if (this.platform === 'ios') {
    //   const url = `itms-services://?action=download-manifest&url=https://www.pgyer.com/app/plist/${buildKey}`;
    //   return !!password ? `${url}?password=${password}` : url;
    // } else {
    //   const url = `https://www.pgyer.com/apiv2/app/install?_api_key=0202f5206763d902070f95c7826cb794&buildKey=${buildKey}`;
    //   return !!password ? `${url}&buildPassword=${password}` : url;
    // }


  }
}
