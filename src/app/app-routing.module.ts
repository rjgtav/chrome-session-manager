import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { SessionListComponent } from './session-list/session-list.component';

const routes: Routes = [
  {
    path: '',
    component: SessionListComponent,
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
