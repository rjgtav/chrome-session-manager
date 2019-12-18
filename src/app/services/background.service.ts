import { Injectable } from '@angular/core';
import { MESSAGE, Message } from '../domain/message';
import { Observable, from } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class BackgroundService {

  constructor() { }

  send<PAYLOAD extends any, RESPONSE>(message: MESSAGE, payload?: PAYLOAD): Observable<RESPONSE> {
    return from(new Promise((resolve, reject) => chrome.runtime.sendMessage({ message, payload } as Message<PAYLOAD>, (response: RESPONSE) => resolve(response)))) as Observable<RESPONSE>;
  }

}
