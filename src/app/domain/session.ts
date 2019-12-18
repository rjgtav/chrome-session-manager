import * as LZMA from "../../lib/lzma_worker";

const COMPRESS = (data: string) => btoa(String.fromCharCode(...new Uint8Array(LZMA.compress(data, 9))));
const DECOMPRESS = (data: string) => LZMA.decompress(Uint8Array.from(atob(data), c => c.charCodeAt(0)));
const PREFIX = 'Untitled';

export class Session {

    private static ID: number = 0;
    private static SESSIONS: { [key: number]: Session } = {};

    dirty: boolean;
    id: number;
    name: string;
    tabs: Session$Tab[];
    window: number;

    private $editing: boolean;

    get isDirty() { return this.dirty && !this.isEmpty }
    get isEditing() { return this.$editing }
    get isEmpty() { return this.tabs.length == 0 }
    get isOpen() { return this.window != undefined }

    isEqual(urlsOther: string[]) {
        return this.similarity(urlsOther) == 1;
    }
    isSimilar(urlsOther: string[]) {
        return this.similarity(urlsOther) > 0.8;
    }

    edit() { this.$editing = true }
    editCancel() { this.$editing = false }

    remove() {
      delete Session.SESSIONS[this.id];
    }

    replace(other: Session) {
        if (other  == undefined) return;
        if (this.isEqual(other.tabs.map(value => value.url)) == false) throw new Error("Can't replace a non-equal session");

        this.tabs.forEach((tab, i) => tab.id = other.tabs[i].id);
        this.window = other.window;
    }

    similarity(urlsOther: string[]) {
        let urls = this.tabs.map(value => value.url);
        let similarity = urls.filter(value => urlsOther.indexOf(value) != -1).length / Math.max(urls.length, urlsOther.length);

        return similarity;
    }

    toJSON(): Session$JSON {
        return {
            dirty: this.dirty,
            id: this.id,
            name: this.name,
            tabs: this.tabs,
            window: this.window,
        }
    }

    toStorage(): Session$Storage {
        return {
            i: this.id,
            n: this.name,
            t: COMPRESS(JSON.stringify(this.tabs.map(value => value.url))),
        }
    }

    static byId(id: number): Session {
        return Session.SESSIONS[id];
    }
    static byWindow(windowId: number) {
        return Object.values(Session.SESSIONS).find(value => value.window == windowId);
    }

    static compare(a: Session, b: Session) {
        return a.name.startsWith(PREFIX) && b.name.startsWith(PREFIX)
            ? a.id - b.id
            : a.name.localeCompare(b.name)
            ;
    }

    static fromJSON(json: Session$JSON): Session {
        let session = new Session();
            session.dirty = json.dirty;
            session.id = json.id;
            session.name = json.name;
            session.tabs = json.tabs;
            session.window = json.window;

        Session.SESSIONS[session.id] = session;

        return session;
    }

    static fromStorage(storage: Session$Storage): Session {
        let session = new Session();
            session.dirty = false;
            session.id = storage.i;
            session.name = storage.n;
            session.tabs = (JSON.parse(DECOMPRESS(storage.t)) as string[]).map(value => ({ id: undefined, url: value }));

        Session.ID = Math.max(Session.ID, session.id + 1);
        Session.SESSIONS[session.id] = session;

        return session;
    }

    static fromWindow(window: chrome.windows.Window): Session {
        let session = new Session();
            session.dirty = true;
            session.id = Session.ID ++;
            session.name = `${ PREFIX }-${ session.id + 1 }`;
            session.tabs = (window.tabs || []).map(value => ({ id: value.id, url: value.url }));
            session.window = window.id;

        Session.SESSIONS[session.id] = session;

        return session;
    }

    static reset() {
        Session.ID = 0;
        Session.SESSIONS = {};
    }

    static values(): Session[] {
        return Object.values(Session.SESSIONS);
    }

}

export interface Session$Tab {
  id: number;
  url: string;
}

export interface Session$JSON {
    dirty: boolean;
    id: number;
    name: string;
    tabs: Session$Tab[];
    window: number;
}

export interface Session$Storage {
    i: number;
    n: string;
    t: string;
}
