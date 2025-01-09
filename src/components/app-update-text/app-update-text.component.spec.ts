/* tslint:disable:no-unused-variable */
import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DebugElement } from '@angular/core';

import { AppUpdateTextComponent } from './app-update-text.component';

describe('AppUpdateTextComponent', () => {
  let component: AppUpdateTextComponent;
  let fixture: ComponentFixture<AppUpdateTextComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ AppUpdateTextComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(AppUpdateTextComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
