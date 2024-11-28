import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppComponent } from './app.component';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AppHeaderItemComponent } from '../components/app-header-item/app-header-item.component';
import { AppItemComponent } from '../components/app-item/app-item.component';
import { BytesToMBPipe, DateFormatPipe } from '../pipes/DataPipe.pipe';
import { PlatformModule } from '@angular/cdk/platform';

@NgModule({
  declarations: [
    AppComponent,
    AppHeaderItemComponent,
    AppItemComponent,
    BytesToMBPipe,
    DateFormatPipe
  ],
  exports: [
    AppHeaderItemComponent,
    AppItemComponent,
    BytesToMBPipe,
    DateFormatPipe,
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    FormsModule,
    PlatformModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
