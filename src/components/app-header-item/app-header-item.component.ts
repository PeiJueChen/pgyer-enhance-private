import { Component, OnInit } from '@angular/core';
import { AppDataService } from '../../services/app-data.service';
import { DataService } from '../../services/data-service';
import QRCode from 'qrcode'
import { Platform } from '@angular/cdk/platform';
import { SubscribeService } from '../../services/subscribe.service';
@Component({
  selector: 'app-app-header-item',
  templateUrl: './app-header-item.component.html',
  styleUrls: ['./app-header-item.component.scss']
})
export class AppHeaderItemComponent implements OnInit {

  constructor(public appDataService: AppDataService, private dataService: DataService, public p: Platform, private subscribeService: SubscribeService) {

  }

  item;
  qrcodeUrl;
  ngOnInit() {
    this.init();
  }

  onImgError() {
    this.item && (this.item.realIcon = '/assets/images/ai.png');
  }
  init() {
    if (!this.appDataService.realVerions || this.appDataService.realVerions.length === 0) {
      this.dataService.showAlert('Error', 'No versions found for this app.');
      return;
    }

    this.item = this.appDataService.realVerions[0];

    QRCode.toDataURL(this.appDataService.href, { errorCorrectionLevel: 'H' })
      .then(url => {
        this.qrcodeUrl = url;
      })
      .catch(err => {
        console.error(err)
      })
  }


  installApp() {
    const url = this.appDataService.getDownloadUrl(this.item);
    if (!url) {
      this.dataService.showAlert('', 'the url is incorrect')
      return;
    }
    this.item.isDownloading = true;
    window.open(url, '_blank');

    setTimeout(() => {
      alert("The app is downloading, please check your phone. If download failed, please click the try again button.")
      this.item.isDownloading = false;
    }, 6000);
  }

  retryDownload() {
    window.open(this.appDataService.pgyerOriginalLink, '_blank');
  }

  lastClickedVersion: number = 0;
  clickCountVersion: number = 0;
  deleteItem(e) {
    var diff = e?.timeStamp - this.lastClickedVersion;
    if (diff < 1000) {
      this.clickCountVersion++;
    }
    this.lastClickedVersion = e?.timeStamp;
    if (this.clickCountVersion > 5) {
      this.clickCountVersion = 0;
      this._deleteItem();
    }
  }
  async _deleteItem() {
    try {
      let userResponse = prompt("Are you sure to delete this version?");
      console.log('userResponse', userResponse);

      if (userResponse && userResponse != 'jason') {
        alert("Please enter the correct password to delete this version");
        return;
      }
      const rsp = await this.dataService.deleteVersionReal(this.appDataService.app, this.appDataService.env, this.appDataService.platform, [this.item.buildKey]);
      this.appDataService.handleVersions(rsp);
      this.subscribeService.next('versionsChanged', this.appDataService.realVerions);
      if (!this.appDataService.realVerions || this.appDataService.realVerions.length === 0) {
        this.dataService.showAlert('Error', 'No versions found for this app.');
        return;
      }
      this.item = this.appDataService.realVerions[0];
    } catch (error: any) {
      this.dataService.showAlert('Error', error?.message);
    }
  }

  async downloadIpa(item) {
    try {
      if (!item?.buildKey) return;
      const r: any = await this.dataService.getIosInternalDownloadUrl(item.buildKey);
      const url = r?.result?.url;
      if (!url) return;
      const a = document.createElement('a');
      a.href = url;
      a.download = item?.buildName || 'ios' + '.ipa';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (error) {
      console.log('downloadIpa error:', error);

    }
  }
}
