import { Component, OnInit } from '@angular/core';
import { AppDataService } from '../../services/app-data.service';
import { DataService } from '../../services/data-service';
import QRCode from 'qrcode'
import { Platform } from '@angular/cdk/platform';
@Component({
  selector: 'app-app-header-item',
  templateUrl: './app-header-item.component.html',
  styleUrls: ['./app-header-item.component.scss']
})
export class AppHeaderItemComponent implements OnInit {

  constructor(public appDataService: AppDataService, private dataService: DataService, public p: Platform) {

  }

  item;
  qrcodeUrl;
  ngOnInit() {

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
      alert("The app is downloading, please check your phone")
      this.item.isDownloading = false;
    }, 6000);
  }

  retryDownload() {
    window.open(this.appDataService.pgyerOriginalLink, '_blank');
  }
}
