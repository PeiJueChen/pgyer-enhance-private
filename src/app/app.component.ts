import { Component } from '@angular/core';
import { DataService } from '../services/data-service';
import { AppDataService } from '../services/app-data.service';
import { Platform } from '@angular/cdk/platform';
import QRCode from 'qrcode'
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {

  password = "";
  showPasswordForm = false;
  href;
  qrcodeUrl;
  appIcon = '/assets/images/ai.png';
  appName = "loading...";
  version = environment.version;
  constructor(private dataService: DataService, public appDataService: AppDataService, public p: Platform) {
    if (!Object['fromEntries']) {
      Object['fromEntries'] = this.fromEntries;
    }

    this.href = decodeURIComponent(window.location.href);
    this.appDataService.href = window.location.href;
    const linkVersions = this.appDataService.href.split('#')[1];
    this.appDataService.linkVersions = (linkVersions && linkVersions?.split(',')) || [];
    if (!this.getValue('app')) {
      this.dataService.showAlert("Error", "missing app parameter");
    } else {
      this.getDeviceConfig();
    }

    QRCode.toDataURL(this.appDataService.href, { errorCorrectionLevel: 'H' })
      .then(url => {
        this.qrcodeUrl = url;
      })
      .catch(err => {
        console.error(err)
      })

    const v = document.getElementById('app-version');
    if (v) {
      v.innerHTML = `v${this.version}`;
    }
  }

  fromEntries(iterable) {
    return [...iterable].reduce((obj, [key, val]) => {
      obj[key] = val
      return obj
    }, {})
  }

  // https://pgyer-enhance.web.app/app/bksg?env=uat&platform=android
  getValue(key: string): string {
    const urlObj = new URL(this.href);

    if (urlObj.searchParams.has(key)) {
      return urlObj.searchParams.get(key) || "";
    }
    const pathParts = urlObj.pathname.split('/').filter(part => part);
    const index = pathParts.indexOf(key);
    if (index !== -1 && index + 1 < pathParts.length) {
      return pathParts[index + 1];
    }

    return ""; // 如果没有找到，返回 null
  }

  //   {
  //     "buildKey": "58a50d57134efbda8ed1ac6672b391e5",
  //     "buildType": "2",
  //     "buildFileName": "app-debug.apk",
  //     "buildFileSize": "160450548",
  //     "buildName": "Burger King Singapore",
  //     "buildVersion": "1.0.74",
  //     "buildVersionNo": "1",
  //     "buildUpdateDescription": "Env: uat",
  //     "buildBuildVersion": "70",
  //     "buildIdentifier": "com.aigens.bksg",
  //     "buildLauncherActivity": "com.aigens.bksg.MainActivity",
  //     "buildIcon": "9c44fc665aac50f155fedd25b9cdff1c",
  //     "buildIsDisplayInHistory": "1",
  //     "buildIsLastest": "2",
  //     "buildIsPublishComplete": "1",
  //     "buildCreated": "2024-11-22 20:01:40",
  //     "buildExtendsIsPublish": "1",
  //     "buildExtendsTimingDate": "0000-00-00 00:00:00",
  //     "buildDownloadCount": 0
  // }
  private async getVersions() {
    if (1) {
      try {
        const rsp = await this.dataService.getVersionsReal(this.appDataService.app, this.appDataService.env, this.appDataService.platform);
        let realVerions = JSON.parse(decodeURIComponent(this.base64Decode(rsp?.versions.replace("S1JeBfseDESE", ""))));
        if (realVerions?.length > 0) {
          realVerions = realVerions.filter(version => {
            const buildUpdateDescription = version.buildUpdateDescription;
            if (buildUpdateDescription.includes('\n')) {
              const lines = buildUpdateDescription.split('\n');
              return lines[0].trim().includes(this.appDataService.env);
            }
            return true;
          })
        }
        this.appDataService.setVersions(realVerions);
        if (!this.appDataService.realVerions || this.appDataService.realVerions.length === 0) {
          const obj = this.appDataService.getLocal(this.appDataService.appKey);
          if (obj?.href == window.location.href) {
            window.location.reload();
          } else {
            this.appDataService.setLocal(this.appDataService.appKey, null);
            this.dataService.showAlert('Error', 'No versions found for this app.');
          }

          return;
        }
        this.appDataService.setLocal(this.appDataService.appKey, { href: window.location.href });
        this.appIcon = this.appDataService.realVerions[0]?.realIcon;
        this.appName = this.appDataService.realVerions[0]?.buildName;
      } catch (error: any) {
        this.dataService.showAlert('Error', error?.message);
      }
      return;
    }

    this.dataService.clearAllVerions();
    const versions = await this.dataService.getAllVerions(this.appDataService.apiKey, this.appDataService.currentAppInfo?.appKey);
    this.dataService.clearAllVerions();
    const UAT_ENV = "Env: uat";
    const PRD_ENV = "Env: prd";
    const getEnvString = (env) => {
      if (env) {
        env = env.toLocaleLowerCase();
        return (env.includes('uat') || env.includes('development') || env.includes('test')) ? UAT_ENV : PRD_ENV;
      }
      return "";
    }
    const envStr = getEnvString(this.appDataService.env);
    let realIcon = "";
    const realVerions = versions.filter(version => {
      version.realIcon = realIcon || `https://www.pgyer.com/image/view/app_icons/${version.buildIcon}`;
      realIcon = version.realIcon;
      version.isSelected = false;
      return (version?.buildUpdateDescription || UAT_ENV).includes(envStr);
    })
    this.appDataService.realVerions = realVerions;
    this.appDataService.itemVersions = [...realVerions].splice(1);

    if (!this.appDataService.realVerions || this.appDataService.realVerions.length === 0) {
      this.dataService.showAlert('Error', 'No versions found for this app.');
      return;
    }

  }

  private base64Decode(str: string) {
    return atob(str);
  }

  private getDeviceConfig() {
    if (1) {
      const data = window?.['deviceData'];
      if (!data) {
        this.dataService.showAlert("Error", "Please run on the correct device");
        return;
      };
      let target = (data['result'] || "").replace("HBLZXkiOi", "");
      target = this.base64Decode(target);
      this.appDataService.deviceConfig = JSON.parse(decodeURIComponent(target));
      this.appDataService.apiKey = this.appDataService.deviceConfig?.defaultPgyerApiKey;
      const projects = this.appDataService.deviceConfig?.projects || [];
      this.appDataService.platform = this.getValue('platform');
      this.appDataService.env = this.getValue('env');
      this.appDataService.app = this.getValue('app');
      const app = projects.find(p => p.name === this.appDataService.app);
      if (!app) {
        this.dataService.showAlert("Error", "app not found");
        return;
      }
      this.appDataService.currentAppInfo = app?.['pgyer']?.[this.appDataService.platform]?.[this.appDataService.env];
      this.appDataService.pgyerOriginalLink = !!this.appDataService.currentAppInfo?.channel ? `https://www.pgyer.com/${this.appDataService.currentAppInfo?.channel}` : '';
      this.appDataService.apiKey = this.appDataService.currentAppInfo?.apiKey || this.appDataService.apiKey;
      this.showPasswordForm = !!this.appDataService?.currentAppInfo?.buildPassword;
      this.getVersions();
      return;
    }

    this.dataService.getDeviceConfig('_57041316416061_4').subscribe((data: any) => {
      this.appDataService.deviceConfig = data?.data?.data;
      this.appDataService.apiKey = this.appDataService.deviceConfig?.defaultPgyerApiKey;
      const projects = this.appDataService.deviceConfig?.projects || [];
      this.appDataService.platform = this.getValue('platform');
      this.appDataService.env = this.getValue('env');
      this.appDataService.app = this.getValue('app');
      const app = projects.find(p => p.name === this.appDataService.app);
      if (!app) {
        this.dataService.showAlert("Error", "app not found");
        return;
      }
      this.appDataService.currentAppInfo = app?.['pgyer']?.[this.appDataService.platform]?.[this.appDataService.env];
      this.appDataService.pgyerOriginalLink = !!this.appDataService.currentAppInfo?.channel ? `https://www.pgyer.com/${this.appDataService.currentAppInfo?.channel}` : '';
      this.appDataService.apiKey = this.appDataService.currentAppInfo?.apiKey || this.appDataService.apiKey;
      this.showPasswordForm = !!this.appDataService?.currentAppInfo?.buildPassword;
      this.getVersions();
    }, err => {
      this.dataService.showAlert('Error', err.message);
    });
  }

  onSubmit() {
    this.showPasswordForm = this.password != this.appDataService.currentAppInfo?.buildPassword;
  }


  lastClickedVersion: number = 0;
  clickCountVersion: number = 0;
  clickedLogo(e) {
    var diff = e?.timeStamp - this.lastClickedVersion;
    if (diff < 1000) {
      this.clickCountVersion++;
    }
    this.lastClickedVersion = e?.timeStamp;
    if (this.clickCountVersion > 5) {
      this.clickCountVersion = 0;
      this._clickedLogo();
    }
  }
  _clickedLogo() {
    let userResponse = prompt("verify your identity to excecute this action");
    if (userResponse && userResponse != 'jason') {
      alert("Please enter the correct password to execute this action");
      return;
    }
    this.appDataService.setIsAigensUser(true);
    this.showPasswordForm = false;
  }
}
