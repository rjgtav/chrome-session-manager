import {Injectable} from '@angular/core';
import {Session, Session$JSON} from '../domain/session';
import {Observable} from 'rxjs';
import {BackgroundService} from './background.service';
import {MESSAGE} from '../domain/message';
import {map} from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class SessionService {

    constructor(
        private background: BackgroundService
    ) { }

    findAll(): Observable<Session[]> {
        return this.background.send(MESSAGE.SESSION_LIST).pipe(map((value: Session$JSON[]) => value.map(value => Session.fromJSON(value))));
    }

    close(session: Session) { return this.background.send(MESSAGE.SESSION_CLOSE, session.id) }
    open(session: Session) { return this.background.send(MESSAGE.SESSION_OPEN, session.id) }
    remove(session: Session) { return this.background.send(MESSAGE.SESSION_REMOVE, session.id) }
    rename(session: Session, name: string) { return this.background.send(MESSAGE.SESSION_RENAME, { id: session.id, name }) }
    switch(session: Session) { return this.background.send(MESSAGE.SESSION_SWITCH, session.id) }

}
