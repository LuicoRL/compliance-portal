import { Routes } from '@angular/router';

import { PageNotFoundComponent } from './error-routing/not-found/not-found.component';
import { UncaughtErrorComponent } from './error-routing/error/uncaught-error.component';
import { AdminViewComponent } from './admin-view/admin-view.component';
import { ClientViewComponent } from './client-view/client-view.component';

export const routes: Routes = [
  { path: '', redirectTo: 'solicitud', pathMatch: 'full' },
  { path: 'error', component: UncaughtErrorComponent },
  { path: 'solicitud', component: ClientViewComponent },
  { path: 'solicitud/:id', component: ClientViewComponent },
  { path: 'admin', component: AdminViewComponent },
  { path: 'master-view', redirectTo: 'solicitud', pathMatch: 'full' }, // legacy link from the single-view era
  { path: '**', component: PageNotFoundComponent } // must always be last
];
