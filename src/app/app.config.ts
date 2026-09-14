import { ApplicationConfig, EnvironmentProviders, ErrorHandler, Provider, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { GlobalErrorHandlerService } from './error-routing/error/global-error-handler.service';

// provide the HAMMER_GESTURE_CONFIG token
// to override the default settings of the HammerModule
// { provide: HAMMER_GESTURE_CONFIG, useClass: MyHammerConfig }
const providers: (EnvironmentProviders | Provider)[] = [
  provideZoneChangeDetection({ eventCoalescing: true }),
  provideHttpClient(),
  provideRouter(routes)
];

if (environment.production) {
  providers.push({
    provide: ErrorHandler,
    useClass: GlobalErrorHandlerService
  });
}

export const appConfig: ApplicationConfig = { providers };
