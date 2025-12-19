import { Component, OnInit, HostListener } from '@angular/core';
import { AppDataService } from '../../services/app-data.service';
import { DataService } from '../../services/data-service';
import { SubscribeService } from '../../services/subscribe.service';

@Component({
  selector: 'app-app-item',
  templateUrl: './app-item.component.html',
  styleUrls: ['./app-item.component.scss']
})
export class AppItemComponent implements OnInit {

  expandedItemIndex: number | null = null;
  constructor(public appDataService: AppDataService, private dataService: DataService, private subscribeService: SubscribeService) { }
  displayedItems: any[] = [];
  shownAllButton = false;
  expendAll = false;
  appName;

  showDelLoading = false;
  showCheckboxes: boolean = false;

  // 拖拽选择相关
  isDragging: boolean = false;
  dragStartIndex: number | null = null;
  dragStartY: number = 0; // 记录鼠标按下的Y坐标
  dragDistance: number = 0; // 记录拖拽距离
  dragThreshold: number = 30; // 拖拽阈值30像素
  isDragActivated: boolean = false; // 是否已激活拖拽（超过阈值）

  ngOnInit() {
    this.init();
    this.subscribeService.getObservable('versionsChanged').subscribe(versions => {
      this.init();
      this.cancelSelectedVersions();
      this.showDelLoading = false;
    })
  }
  init() {
    this.displayedItems = this.appDataService?.itemVersions?.slice(0, 6);
    this.shownAllButton = this.appDataService?.itemVersions.length > 6;
    this.appName = this.displayedItems?.[0]?.buildName;
    this.expendAll = false;
  }

  toggleItem(index: number): void {
    // 如果显示复选框，点击整行时切换选择状态
    if (this.showCheckboxes) {
      this.displayedItems[index].isSelected = !this.displayedItems[index].isSelected;
      return;
    }

    // 原来的展开/折叠逻辑
    if (this.expandedItemIndex === index) {
      this.expandedItemIndex = null; // Collapse
    } else {
      this.expandedItemIndex = index; // Expand
    }
  }

  // 鼠标按下开始拖拽选择
  onMouseDown(index: number, event: MouseEvent) {
    if (!this.showCheckboxes) return;

    // 如果点击的是复选框，不处理拖拽
    if ((event.target as HTMLElement).tagName === 'INPUT') return;

    event.preventDefault();
    this.isDragging = true;
    this.dragStartIndex = index;
    this.dragStartY = event.clientY; // 记录按下的Y坐标
    this.dragDistance = 0;
    this.isDragActivated = false;
  }

  // 鼠标移动时继续选择
  onMouseMove(index: number, event: MouseEvent) {
    if (!this.showCheckboxes || !this.isDragging || this.dragStartIndex === null) return;

    event.preventDefault();

    // 计算拖拽距离
    const currentY = event.clientY;
    this.dragDistance = Math.abs(currentY - this.dragStartY);

    // 只有当拖拽距离超过阈值时才激活
    if (this.dragDistance >= this.dragThreshold) {
      if (!this.isDragActivated) {
        this.isDragActivated = true;
      }

      // 判断方向：向下为正，向上为负
      const direction = currentY - this.dragStartY;

      if (direction > 0) {
        // 向下拖拽 - 选中
        this.selectRangeDown(this.dragStartIndex, index);
      } else {
        // 向上拖拽 - 取消选中
        this.selectRangeUp(this.dragStartIndex, index);
      }
    }
  }

  // 鼠标释放时结束拖拽
  @HostListener('mouseup', ['$event'])
  onMouseUp(event: MouseEvent) {
    if (!this.isDragging) return;

    this.isDragging = false;
    this.dragStartIndex = null;
    this.dragStartY = 0;
    this.dragDistance = 0;
    this.isDragActivated = false;
  }

  // 向下拖拽 - 选中范围内的所有项目
  selectRangeDown(startIndex: number, endIndex: number) {
    const start = Math.min(startIndex, endIndex);
    const end = Math.max(startIndex, endIndex);

    // 将范围内的所有项设置为选中状态
    for (let i = start; i <= end; i++) {
      this.displayedItems[i].isSelected = true;
    }
  }

  // 向上拖拽 - 取消选中范围内的所有项目
  selectRangeUp(startIndex: number, endIndex: number) {
    const start = Math.min(startIndex, endIndex);
    const end = Math.max(startIndex, endIndex);

    // 将范围内的所有项设置为取消选中状态
    for (let i = start; i <= end; i++) {
      this.displayedItems[i].isSelected = false;
    }
  }

  // 鼠标进入项目时，如果正在拖拽则选择该项目
  onMouseEnter(index: number, event: MouseEvent) {
    if (!this.showCheckboxes || !this.isDragging || this.dragStartIndex === null) return;

    // 计算拖拽距离
    const currentY = event.clientY;
    this.dragDistance = Math.abs(currentY - this.dragStartY);

    // 只有当拖拽距离超过阈值时才激活
    if (this.dragDistance >= this.dragThreshold) {
      if (!this.isDragActivated) {
        this.isDragActivated = true;
      }

      // 判断方向：向下为正，向上为负
      const direction = currentY - this.dragStartY;

      if (direction > 0) {
        // 向下拖拽 - 选中
        this.selectRangeDown(this.dragStartIndex, index);
      } else {
        // 向上拖拽 - 取消选中
        this.selectRangeUp(this.dragStartIndex, index);
      }
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
      alert("The app is downloading, please check your phone. If download failed, please click the try again button.")
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
      if (userResponse && userResponse != 'jason') {
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
    this.isDragging = false;
    this.dragStartIndex = null;
    this.dragStartY = 0;
    this.dragDistance = 0;
    this.isDragActivated = false;
    this.displayedItems.forEach(item => {
      item.isSelected = false;
    });
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
