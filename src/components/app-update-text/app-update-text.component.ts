import { Component, Input, OnInit } from '@angular/core';
import { AppDataService } from '../../services/app-data.service';
import { DataService } from '../../services/data-service';

@Component({
  selector: 'app-update-text',
  templateUrl: './app-update-text.component.html',
  styleUrls: ['./app-update-text.component.scss']
})
export class AppUpdateTextComponent implements OnInit {

  @Input() item: any; // 接收父组件的数据
  isEditing: boolean = false;
  updateDescription: string = "";
  constructor(public appDataService: AppDataService, private dataService: DataService) {

  }

  ngOnInit() {
    this.updateDescription = this.item?.buildUpdateDescription || '';
  }

  edit() {
    this.isEditing = true;
  }

  async save() {
    if (!this.updateDescription) return;
    const c = confirm('Are you sure to save the update description?');
    if (!c) return;
    try {
      const rsp = await this.dataService.updateAppInfoReal(this.appDataService.app, this.appDataService.env, this.appDataService.platform, this.item.buildKey, this.updateDescription);

      const content = rsp?.data?.data?.buildUpdateDescription;
      if (!content) {
        alert('Failed to save the update description.');
        return;
      }
      this.item.buildUpdateDescription = this.updateDescription;
      this.isEditing = false;
    } catch (error: any) {
      this.dataService.showAlert('Error', error?.message);
    }

  }

}
