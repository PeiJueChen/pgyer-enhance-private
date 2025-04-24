import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SubscribeService {
  private subjects = new Map<string, BehaviorSubject<any>>();

  getObservable(name: string, initValue = null): BehaviorSubject<any> {
    if (!this.subjects.has(name)) {
      this.subjects.set(name, new BehaviorSubject<any>(initValue));
    }
    return this.subjects.get(name)!;
  }

  next(name: string, value: any) {
    const subject = this.subjects.get(name);
    if (subject) {
      subject.next(value);
    }
  }
}
