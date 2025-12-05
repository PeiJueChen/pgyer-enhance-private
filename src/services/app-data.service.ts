import { Platform } from '@angular/cdk/platform';
import { Injectable } from '@angular/core';
import { DataService } from './data-service';

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
  dataKey = "DATA_KEY";
  appKey = "PAYGER_APP_KEY";
  isAigensUser = false;
  linkVersions: any[] = [];
  constructor(public platformService: Platform, private dataService: DataService) {

  }

  public setIsAigensUser(isAigensUser: boolean) {
    this.isAigensUser = isAigensUser;
  }
  public getIsAigensUser() {
    return this.isAigensUser;
  }

  /**
   * canShowIosIpaDownload
   */
  public canShowIosIpaDownload() {
    return this.isAigensUser && this.platform == 'ios';
  }


  private base64Decode(str: string) {
    return atob(str);
  }

  setVersions(realVerions: any[]) {
    if (this.linkVersions.length > 0) {
        this.realVerions = realVerions.filter(item => this.linkVersions.includes(item?.buildVersion));
        this.itemVersions = [...this.realVerions].splice(1);
    }else {
      this.realVerions = realVerions;
      this.itemVersions = [...realVerions].splice(1);
    }
  }
  handleVersions(rsp) {
    let realVerions = JSON.parse(decodeURIComponent(this.base64Decode(rsp?.versions.replace("S1JeBfseDESE", ""))));
    if (realVerions?.length > 0) {
      realVerions = realVerions.filter(version => {
        const buildUpdateDescription = version?.buildUpdateDescription;
        if (buildUpdateDescription?.includes('\n')) {
          const lines = buildUpdateDescription.split('\n');
          return lines[0].trim().includes(this.env);
        }
        return true;
      })
    }
    this.realVerions = realVerions;
    this.itemVersions = [...realVerions].splice(1);
  }

  setLocal(key: string, object: any) {
    try {
      if (!object) {
        localStorage.removeItem(key);
        return;
      }
      localStorage.setItem(key, JSON.stringify(object));
    } catch (e) {
      console.log(e);
    }
  }

  getLocal(key: string): any {
    try {

      const str = localStorage.getItem(key);
      if (!str) {
        return null;
      }
      return JSON.parse(str);
    } catch (e) {
      console.log(e);
    }
    return null;
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

  getIosInternalDownloadUrl(item) {
    const buildKey = item.buildKey;
    if (!buildKey) return "";
    return `https://www.pgyer.com/app/plist/${buildKey}/install-api/s.plist`;
  }
}
