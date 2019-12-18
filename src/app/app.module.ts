import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { SessionListComponent } from './session-list/session-list.component';
import { SessionListButtonComponent } from './session-list/session-list-button/session-list-button.component';
import {FormsModule} from '@angular/forms';

@NgModule({
  declarations: [
    AppComponent,
    SessionListComponent,
    SessionListButtonComponent
  ],
    imports: [
        BrowserModule,
        FontAwesomeModule,
        AppRoutingModule,
        FormsModule
    ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
