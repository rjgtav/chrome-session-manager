import {ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit} from '@angular/core';
import {SessionService} from '../services/session.service';
import {Subscription} from 'rxjs';
import {Session} from '../domain/session';
import {
    faBan,
    faCheck,
    faDonate,
    faExternalLinkAlt,
    faInfoCircle,
    faPencilAlt, faPlus,
    faRandom,
    faSave,
    faTimes,
    faTrashAlt
} from '@fortawesome/free-solid-svg-icons';
import {MESSAGE, Message} from '../domain/message';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'app-session-list',
    templateUrl: './session-list.component.html',
    styleUrls: ['./session-list.component.scss']
})
export class SessionListComponent implements OnInit, OnDestroy {

    readonly faBan = faBan;
    readonly faCheck = faCheck;
    readonly faDonate = faDonate;
    readonly faSave = faSave;
    readonly faPencilAlt = faPencilAlt;
    readonly faExternalLinkAlt = faExternalLinkAlt;
    readonly faInfoCircle = faInfoCircle;
    readonly faPlus = faPlus;
    readonly faRandom = faRandom;
    readonly faTimes = faTimes;
    readonly faTrashAlt = faTrashAlt;

    sessionsClosed: Session[];
    sessionsOpen: Session[];

    showWarning: boolean;

    private port: chrome.runtime.Port;
    private subscription: Subscription;

    constructor(
        private changeDetectorRef: ChangeDetectorRef,
        private session: SessionService,
    ) { }

    ngOnInit() {
        this.port = chrome.runtime.connect();
        this.port.onMessage.addListener((message: Message<any>) => message.message == MESSAGE.SESSION_LIST_UPDATE && this.update());

        this.update();
    }

    ngOnDestroy(): void {
        this.port && this.port.disconnect();
        this.subscription && this.subscription.unsubscribe();
    }

    sessionById(id: number) { return Session.byId(id) }

    sessionClose(session: Session) { this.session.close(session) }

    sessionEdit(session: Session) { session.edit(); this.changeDetectorRef.detectChanges(); }
    sessionEditCancel(session: Session) { session.editCancel(); this.changeDetectorRef.detectChanges(); }
    sessionEditFinish(session: Session, name: string) { this.session.rename(session, name) }

    sessionNew() { this.session.new() }
    sessionOpen(session: Session) { this.session.open(session) }
    sessionRemove(session: Session) { confirm(`Are you sure you want to delete ${ session.name }, with ${ session.tabs.length } tabs?`) && this.session.remove(session) }
    sessionSwitch(session: Session) { this.session.switch(session) }

    update() {
        this.subscription && this.subscription.unsubscribe();
        this.subscription = this.session.findAll().subscribe(value => {
            this.sessionsClosed = value.filter(value => !value.isOpen);
            this.sessionsOpen = value.filter(value => value.isOpen);
            this.showWarning = value.length >= 30 || value.find(value => value.tabs.length >= 120) != null;

            this.changeDetectorRef.detectChanges();
        });
    }

}
