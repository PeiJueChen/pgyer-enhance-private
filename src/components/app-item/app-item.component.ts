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
  ngOnInit() {
    this.displayedItems = this.appDataService.itemVersions.slice(0, 6);
    this.shownAllButton = this.appDataService?.itemVersions.length > 6;
    this.appName = this.displayedItems?.[0]?.buildName;
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
  }
}
