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
import {KEY_SESSIONS} from '../../background';

// XTODO: mostrar indicador da sessao atual
// XTODO: apagar/nao guardar as sessoes so com 1 tab
// XTODO: melhorar o algoritmo que valida se ja tamos no limite de storage
// TODO: atualizar para Angular 9
// TODO: lidar com pinned tabs

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

    storageFull: boolean;
    window: number;

    private port: chrome.runtime.Port;
    private subscription: Subscription;

    constructor(
        private changeDetector: ChangeDetectorRef,
        private session: SessionService,
    ) { }

    ngOnInit() {
        this.port = chrome.runtime.connect();
        this.port.onMessage.addListener((message: Message<any>) => message.message == MESSAGE.SESSION_LIST_UPDATE && this.update());
        this.update();

        // Get current window
        chrome.windows.getCurrent((window) => {
            this.window = window.id;
            this.changeDetector.markForCheck();
        });
    }

    ngOnDestroy(): void {
        this.port && this.port.disconnect();
        this.subscription && this.subscription.unsubscribe();
    }

    sessionById(id: number) { return Session.byId(id) }

    sessionClose(session: Session) { this.session.close(session) }

    sessionEdit(session: Session) { session.edit(); this.changeDetector.detectChanges(); }
    sessionEditCancel(session: Session) { session.editCancel(); this.changeDetector.detectChanges(); }
    sessionEditFinish(session: Session, name: string) { this.session.rename(session, name) }

    sessionNew() { this.session.new() }
    sessionOpen(session: Session) { this.session.open(session) }
    sessionRemove(session: Session) { confirm(`Are you sure you want to delete ${ session.name }, with ${ session.tabs.length } tabs?`) && this.session.remove(session) }
    sessionSwitch(session: Session) { this.session.switch(session) }

    // Read more: https://developer.chrome.com/apps/storage#property-sync
    async storageQuota(sessions: Session[]) {
        if (sessions.length + [KEY_SESSIONS].length >= chrome.storage.sync.MAX_ITEMS)
            return false;

        let quotaSession: number;
        let quotaTotal: number = await new Promise(resolve => chrome.storage.sync.getBytesInUse([KEY_SESSIONS], bytesInUse => resolve(bytesInUse)));

        for (let session of sessions) {
            quotaSession = await new Promise(resolve => chrome.storage.sync.getBytesInUse([`${ session.id }`], bytesInUse => resolve(bytesInUse)));
            quotaTotal += quotaSession;

            if (quotaSession >= chrome.storage.sync.QUOTA_BYTES_PER_ITEM)
                return false;
        }

        return quotaTotal < chrome.storage.sync.QUOTA_BYTES;
    }

    update() {
        this.subscription && this.subscription.unsubscribe();
        this.subscription = this.session.findAll().subscribe(async value => {
            this.sessionsClosed = value.filter(value => !value.isOpen);
            this.sessionsOpen = value.filter(value => value.isOpen);

            this.changeDetector.detectChanges();

            this.storageFull = await this.storageQuota(value) == false;
            this.changeDetector.markForCheck();
        });
    }

}
