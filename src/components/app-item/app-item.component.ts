import { Component, OnInit } from '@angular/core';
import { AppDataService } from '../../services/app-data.service';
import { DataService } from '../../services/data-service';

@Component({
  selector: 'app-app-item',
  templateUrl: './app-item.component.html',
  styleUrls: ['./app-item.component.scss']
})
export class AppItemComponent implements OnInit {

  expandedItemIndex: number | null = null;
  constructor(public appDataService: AppDataService, private dataService: DataService) { }
  displayedItems: any[] = [];
  shownAllButton = false;
  expendAll = false;
  appName;

  showDelLoading = false;
  showCheckboxes: boolean = false;
  ngOnInit() {
    this.init();
  }
  init() {
    this.displayedItems = this.appDataService.itemVersions.slice(0, 6);
    this.shownAllButton = this.appDataService?.itemVersions.length > 6;
    this.appName = this.displayedItems?.[0]?.buildName;
    this.expendAll = false;
  }

  toggleItem(index: number): void {
    if (this.expandedItemIndex === index) {
      this.expandedItemIndex = null; // Collapse
    } else {
      this.expandedItemIndex = index; // Expand
    }
  }


  get hasMoreItems(): boolean {
    return this.appDataService?.itemVersions.length > 6;
  }

  clickAllVersions() {
    if (this.expendAll) {
      this.displayedItems = this.appDataService.itemVersions;

    } else {
      this.displayedItems = this.appDataService.itemVersions.slice(0, 6);

    }

  }
  installApp(item) {
    const url = this.appDataService.getDownloadUrl(item);
    if (!url) {
      this.dataService.showAlert('', 'the url is incorrect')
      return;
    }
    item.isDownloading = true;
    window.open(url, '_blank');

    setTimeout(() => {
      alert("The app is downloading, please check your phone")
      item.isDownloading = false;
    }, 6000);
  }

  lastClickedVersion: number = 0;
  clickCountVersion: number = 0;
  editClicked(e) {
    var diff = e?.timeStamp - this.lastClickedVersion;
    if (diff < 1000) {
      this.clickCountVersion++;
    }
    this.lastClickedVersion = e?.timeStamp;
    if (this.clickCountVersion > 5) {
      this.clickCountVersion = 0;
      this._editClicked();
    }
  }
  _editClicked() {
    this.showCheckboxes = true;
    this.shownAllButton = true;
    // show select box
  }
  async deleteSelectedVersions() {

    const buildKeys = this.displayedItems.filter(item => item.isSelected).map(item => item.buildKey);
    if (buildKeys.length === 0) {
      alert("Please select at least one version to delete");
      return;
    }
    try {
      let userResponse = prompt("Are you sure to delete the selected versions?");
      if (!userResponse || userResponse != 'jason') {
        alert("Please enter the correct password to delete the selected versions");
        return;
      }
      this.showDelLoading = true;
      const rsp = await this.dataService.deleteVersionReal(this.appDataService.app, this.appDataService.env, this.appDataService.platform, buildKeys);
      this.appDataService.handleVersions(rsp);
      this.init();
      this.cancelSelectedVersions();
      this.showDelLoading = false;
    } catch (error: any) {
      this.dataService.showAlert('Error', error?.message);
      this.showDelLoading = false;
    }


  }
  cancelSelectedVersions() {
    this.showCheckboxes = false;
    this.displayedItems.forEach(item => {
      item.isSelected = false;
    });
  }
}
