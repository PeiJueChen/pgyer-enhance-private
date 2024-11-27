import { Component } from '@angular/core';
import { DataService } from '../services/data-service';
import { AppDataService } from '../services/app-data.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {

  password = "";
  showPasswordForm = false;
  href;
  constructor(private dataService: DataService, public appDataService: AppDataService) {
    this.href = decodeURIComponent(window.location.href);
    this.appDataService.href = window.location.href;
    if (!this.getValue('app')) {
      this.dataService.showAlert("Error", "missing app parameter");
    }else {
      this.getDeviceConfig();
    }
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
      return (version?.buildUpdateDescription || UAT_ENV).includes(envStr)
    })
    this.appDataService.realVerions = realVerions;
    this.appDataService.itemVersions = [...realVerions].splice(1);

  }

  private getDeviceConfig() {
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
}
