import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}


const w = window as any;

let bootstrap = () => {
  platformBrowserDynamic().bootstrapModule(AppModule)
    .catch(err => console.error(err));
}

// /console is an admin page independent of the deviceData gating flow.
const isConsole = location.pathname.startsWith('/console');
if (w['deviceData'] || isConsole) {
  bootstrap();
} else {
  w['bootstrap'] = bootstrap;
}
