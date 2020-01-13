import {Session, Session$Storage, Session$Tab} from './app/domain/session';
import {Message, MESSAGE} from './app/domain/message';

const KEY_ALARM: string = 'alarm';
const KEY_SESSIONS: string = 'sessions';

let onWindowCreatedTimeout: any;
let ports: chrome.runtime.Port[] = [];

async function onSessionChange(id: number, storage: Session$Storage, tabsRemove: boolean = true) {
    console.log('onSessionChange', id, storage);
    let session: Session = Session.byId(id);
    let sessionNew: Session = Session.fromStorage(storage);
        sessionNew.window = session && session.window;

    // If it's a new session, simply store it
    if (session == null)
        return;

    // Otherwise, merge with existing
    if (session.window) {
        let tabs: Session$Tab[] = await new Promise((resolve, reject) => chrome.windows.get(session.window, { populate: true }, (window: chrome.windows.Window) => resolve(window.tabs.map(value => ({ id: value.id, url: value.url })))));
        let tabsNew = sessionNew.tabs.slice(0);

        let tabsAdded = sessionNew.tabs.slice(0);
            tabs.forEach(value => tabsAdded.splice(tabsAdded.findIndex(value2 => value2.url == value.url), 1));

        let tabsRemoved = tabs.slice(0);
            tabsNew.forEach(value => tabsRemoved.splice(tabsRemoved.findIndex(value2 => value2.url == value.url), 1));

        let tabsMoved = tabs.slice(0);
            tabsRemoved.forEach(value => tabsMoved.splice(tabsMoved.findIndex(value2 => value2.url == value.url), 1));
            tabsAdded.forEach(value => tabsMoved.push(value));

        // Add new tabs
        for (let tab of tabsAdded)
            await new Promise((resolve, reject) => chrome.tabs.create({ url: tab.url, windowId: session.window }, (tab: chrome.tabs.Tab) => { tabs.push({ id: tab.id, url: tab.url }); resolve() }));

        // Remove new tabs
        for (let tab of (tabsRemove ? tabsRemoved : []))
            await new Promise((resolve, reject) => chrome.tabs.remove(tab.id, () => resolve()));

        // Move existing tabs
        for (let from = 0; from < tabsMoved.length; from ++) {
            let tab = tabsMoved[from];
            let tabNew = tabsNew[from];

            if (tab.url != tabNew.url) {
                for (let to = 0; to < from; to ++) {
                    let tabOther = tabsNew[to];
                    if (tabOther.url == tab.url) {
                        await new Promise((resolve, reject) => chrome.tabs.move(tab.id, { index: to, windowId: session.window }, () => resolve()));

                        tabsMoved.splice(to, 0, tabsMoved.splice(from, 1)[0]);
                        break;
                    }
                }
            }
        }

        // Store current state in the new session
        sessionNew.tabs = await new Promise((resolve, reject) => chrome.windows.get(session.window, { populate: true }, (window: chrome.windows.Window) => resolve(window.tabs.map(value => ({ id: value.id, url: value.url })))));
    }

    await portBroadcast(MESSAGE.SESSION_LIST_UPDATE);
}

async function onSessionGC() {
    console.log('onSessionGC');
    // Delete empty sessions
    let sessions = Session.values().filter(value => !value.isEmpty);
    let sessionsEmpty = Session.values().filter(value => value.isEmpty);
        sessionsEmpty.forEach(value => value.remove());

    await new Promise((resolve, reject) => chrome.storage.sync.remove(sessionsEmpty.map(value => value.id + ''), () => resolve()));
    await new Promise((resolve, reject) => chrome.storage.sync.set({ [KEY_SESSIONS]: sessions.map(value => value.id) }, () => resolve()));
}

async function onSessionMerge() {
    console.log('onSessionMerge');
    onWindowCreatedTimeout && clearTimeout(onWindowCreatedTimeout);

    for (let session of Session.values()) {
        let sessionEqual = Session.values().filter(value => value.isEqual(session.tabs.map(value => value.url)));
        if (sessionEqual.length == 1)
            continue;

        let sessionWindow = sessionEqual.find(value => value.window != undefined);
        let sessionMerged: Session = sessionEqual.find(value => value.window == undefined);
            sessionMerged.dirty = true;
            sessionMerged.replace(sessionWindow);

        // Delete all the remaining duplicate sessions
        sessionEqual.filter(value => value.id != sessionMerged.id).forEach(value => value.remove());
    }

    await onSessionGC();
    await portBroadcast(MESSAGE.SESSION_LIST_UPDATE);
}
async function onSessionMergeDelayed() {
    console.log('onSessionMergeDelayed');
    onWindowCreatedTimeout && clearTimeout(onWindowCreatedTimeout);
    onWindowCreatedTimeout = setTimeout(onSessionMerge, 1000);
}

async function onSessionSave() {
    let sessions = Session.values();
    let sessionsDirty = sessions.filter(value => value.isDirty);

    if (sessionsDirty.length == 0)
        return;

    console.log('onSessionSave dirty', sessionsDirty.length);

    // Save dirty sessions
    let storage = {};

    for (let session of sessionsDirty) {
        session.tabs = session.isOpen
          ? await new Promise((resolve, reject) => chrome.windows.get(session.window, { populate: true }, (window: chrome.windows.Window) => resolve(window.tabs.map(value => ({ id: value.id, url: value.url })))))
          : session.tabs;

        storage[session.id] = JSON.stringify(session.toStorage());
    }

    await new Promise((resolve, reject) => chrome.storage.sync.set(storage, () => {
        if (chrome.runtime.lastError == undefined) {
            sessionsDirty.forEach(value => value.dirty = false);
            resolve();
        } else {
            reject(chrome.runtime.lastError);
        }
    }));
}

async function onTabAttached(tabId: number, attachInfo: chrome.tabs.TabAttachInfo) {
    console.log('onTabAttached', tabId, attachInfo);
    let tab: chrome.tabs.Tab = await new Promise((resolve, reject) => chrome.tabs.get(tabId, (tab: chrome.tabs.Tab) => resolve(tab)));
    let session = Session.byWindow(attachInfo.newWindowId);
    if (session != undefined) {
        session.dirty = true;
        session.tabs.splice(attachInfo.newPosition, 0, {id: tabId, url: tab.url});
    }

    await onSessionGC();
    await portBroadcast(MESSAGE.SESSION_LIST_UPDATE);
}
async function onTabDetached(tabId: number, detachInfo: chrome.tabs.TabDetachInfo) {
    console.log('onTabDetacched', tabId, detachInfo);
    let session = Session.byWindow(detachInfo.oldWindowId);
    if (session != undefined) {
        session.dirty = true;
        session.tabs.splice(detachInfo.oldPosition, 1);
    }
}
async function onTabCreated(tab: chrome.tabs.Tab) {
  console.log('onTabCreated', tab);
  let session = Session.byWindow(tab.windowId);
  if (session != undefined) {
      session.dirty = true;
      session.tabs.push({ id: tab.id, url: tab.url || tab['pendingUrl'] });
      await onSessionMergeDelayed();
      await portBroadcast(MESSAGE.SESSION_LIST_UPDATE);
  }
}
async function onTabMoved(tabId: number, moveInfo: chrome.tabs.TabMoveInfo) {
    console.log('onTabMoved', tabId, moveInfo);
    let session = Session.byWindow(moveInfo.windowId);
    if (session != undefined) {
        session.dirty = true;
        session.tabs.splice(moveInfo.toIndex, 0, session.tabs.splice(moveInfo.fromIndex, 1)[0]);
    }
}
async function onTabRemoved(tabId: number, removeInfo: chrome.tabs.TabRemoveInfo) {
    if (removeInfo.isWindowClosing)
        return;

    console.log('onTabRemoved', tabId, removeInfo);
    let session = Session.byWindow(removeInfo.windowId);
    if (session != undefined) {
        session.dirty = true;
        session.tabs = session.tabs.filter(value => value.id != tabId);
    }

    await onSessionGC();
    await portBroadcast(MESSAGE.SESSION_LIST_UPDATE);
}
async function onTabReplaced(addedTabId: number, removedTabId: number) {
    let tab: chrome.tabs.Tab = await new Promise((resolve, reject) => chrome.tabs.get(addedTabId, (tab: chrome.tabs.Tab) => resolve(tab)));
    let session = Session.byWindow(tab.windowId);
    console.log('onTabReplaced add', addedTabId, 'removed', removedTabId, 'window', tab.windowId);
    if (session != undefined) {
        let t = session.tabs.findIndex(value => value.id == removedTabId);

        session.tabs[t].id = tab.id;
        session.tabs[t].url = tab.url;
    }
}
async function onTabUpdated(tab: chrome.tabs.Tab, changeInfo: chrome.tabs.TabChangeInfo) {
    if (changeInfo.discarded == true)
        return;

    console.log('onTabUpdated', tab, changeInfo);
    let session = Session.byWindow(tab.windowId);
    if (session != undefined) {
        session.dirty = true;

        let t = session.tabs.find(value => value.id == tab.id);
            t.url = changeInfo.url || t.url;
    }
}

async function onWindowCreated(window: chrome.windows.Window) {
    console.log('onWindowCreated', window.id, window.tabs);

    // Find existing/similar session
    if (window.tabs) {
        let sessionSimilar: Session = null;
        let urls = window.tabs.map(value => value.url);

        for (let session of Session.values().filter(value => value.window == undefined))
            if (session.isSimilar(urls))
                if (sessionSimilar == null || session.similarity(urls) > sessionSimilar.similarity(urls))
                    sessionSimilar = session;

        if (sessionSimilar) {
            console.log('\t> resuming session', sessionSimilar.id);

            // Merge with window
            sessionSimilar.window = window.id;
            await onSessionChange(sessionSimilar.id, sessionSimilar.toStorage(), false);

            sessionSimilar = Session.byId(sessionSimilar.id);
            sessionSimilar.dirty = true;
            return;
        }
    }

    // Create a new session
    console.log('\t> creating session', window.id);
    Session.fromWindow(window);
    await onSessionMergeDelayed();
    await portBroadcast(MESSAGE.SESSION_LIST_UPDATE);
}

async function onWindowRemoved(windowId: number) {
  console.log('onWindowRemoved', windowId);
  let session: Session = Session.byWindow(windowId);
  if (session != undefined) {
      session.dirty = true;
      session.tabs.forEach(value => value.id = undefined);
      session.window = undefined;
      await portBroadcast(MESSAGE.SESSION_LIST_UPDATE);
  }
}

async function portBroadcast(message: MESSAGE, payload: object = {}) {
    ports.forEach(value => value.postMessage({ message, payload }));
}

async function sessionClose(id: number) {
    let session = Session.byId(id);
    if (session && session.isOpen) {
        await new Promise((resolve, reject) => chrome.windows.remove(session.window, () => resolve()));
        await onWindowRemoved(session.window);
    }

    await portBroadcast(MESSAGE.SESSION_LIST_UPDATE);
}

async function sessionNew() {
    await new Promise((resolve, reject) => chrome.windows.create({ focused: true, state: 'maximized' }, window => resolve(window)));
    await portBroadcast(MESSAGE.SESSION_LIST_UPDATE);
}

async function sessionOpen(id: number) {
    let session = Session.byId(id);
    if (session && !session.isOpen) {
        let window: chrome.windows.Window = await new Promise((resolve, reject) => chrome.windows.create({ focused: true, state: 'maximized', url: session.tabs.map(value => value.url) }, window => resolve(window)))

        // Remove session that was just created due to it being a new window
        let windowSession = Session.byWindow(window.id);
            windowSession.remove();

        session.dirty = true;
        session.replace(windowSession);
    }

    await portBroadcast(MESSAGE.SESSION_LIST_UPDATE);
}

async function sessionRemove(id: number) {
    let session = Session.byId(id);
    if (session)
        session.remove();

    await portBroadcast(MESSAGE.SESSION_LIST_UPDATE);
}

async function sessionRename(id: number, name: string) {
    let session = Session.byId(id);
    if (session) {
        session.dirty = true;
        session.name = name || session.name;
    }

    await portBroadcast(MESSAGE.SESSION_LIST_UPDATE);
}

async function sessionSwitch(id: number) {
    let session = Session.byId(id);
    if (session && !session.isOpen) {
        await sessionOpen(id);
        await Promise.all(Session.values().filter(value => value.id != id && value.isOpen).map(value => sessionClose(value.id)));
    }

    await portBroadcast(MESSAGE.SESSION_LIST_UPDATE);
}

(async function() {

    // Initialize
    Session.reset();

    await new Promise((resolve, reject) => chrome.storage.sync.get(KEY_SESSIONS, async (result: object) => {
        // Load stored sessions
        let ids: number[] = result[KEY_SESSIONS] || [];
        let sessions: Session[] = [];

        for (let id of ids) {
            console.log('loading session', id);
            await new Promise((resolve, reject) => chrome.storage.sync.get(`${id}`, (result: object) => resolve(result[id] && sessions.push(Session.fromStorage(JSON.parse(result[id]))))));
        }

        // Associate existing windows with stored sessions, create new sessions for the new windows
        await new Promise((resolve, reject) => chrome.windows.getAll({ populate: true, windowTypes: ['normal'] }, async (windows: chrome.windows.Window[]) => {
            console.log('loading windows', windows);
            for (let window of windows)
                await onWindowCreated(window);

            resolve();
        }));

        console.log('Initialize complete!');
        console.log('Sessions:', Session.values());
        chrome.storage.sync.getBytesInUse(['0'], (bytesInUse: number) => console.log('Bytes in use', bytesInUse));
        resolve();
    }));

    chrome.alarms.create(KEY_ALARM, { periodInMinutes: 1 });
    chrome.alarms.onAlarm.addListener((alarm: chrome.alarms.Alarm) => alarm.name == KEY_ALARM && onSessionSave());

    chrome.runtime.onConnect.addListener((port: chrome.runtime.Port) => {
        ports.push(port);
        port.onDisconnect.addListener(() => ports = ports.filter(value => value != port));
    });
    chrome.runtime.onMessage.addListener((message: Message<any>, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
        console.log('onMessage', message);
        switch (message.message) {
            case MESSAGE.SESSION_CLOSE: sendResponse(sessionClose(message.payload)); return true;
            case MESSAGE.SESSION_OPEN: sendResponse(sessionOpen(message.payload)); return true;
            case MESSAGE.SESSION_LIST: sendResponse(Session.values().sort(Session.compare)); return true;
            case MESSAGE.SESSION_NEW: sendResponse(sessionNew()); return true;
            case MESSAGE.SESSION_REMOVE: sendResponse(sessionRemove(message.payload)); return true;
            case MESSAGE.SESSION_RENAME: sendResponse(sessionRename(message.payload.id, message.payload.name)); return true;
            case MESSAGE.SESSION_SWITCH: sendResponse(sessionSwitch(message.payload)); return true;
        }
    });

    // If a session changes remotely, update our local version
    chrome.storage.onChanged.addListener(async (changes: { [key: string]: chrome.storage.StorageChange }) => {
        for (let key of Object.keys(changes)) {
            if (key == KEY_SESSIONS)
                Session.values()
                    .filter(value => changes[KEY_SESSIONS].newValue.indexOf(value.id) == -1)
                    .forEach(value => value.remove());
            else
                await onSessionChange(+key, JSON.parse(changes[key].newValue));
        }
    });

    chrome.tabs.onCreated.addListener((tab: chrome.tabs.Tab) => onTabCreated(tab));
    chrome.tabs.onUpdated.addListener((tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => onTabUpdated(tab, changeInfo));
    chrome.tabs.onMoved.addListener((tabId: number,  moveInfo: chrome.tabs.TabMoveInfo) => onTabMoved(tabId, moveInfo));
    chrome.tabs.onRemoved.addListener((tabId: number, removeInfo: chrome.tabs.TabRemoveInfo) => onTabRemoved(tabId, removeInfo));
    chrome.tabs.onDetached.addListener((tabId: number, detachInfo: chrome.tabs.TabDetachInfo) => onTabDetached(tabId, detachInfo));
    chrome.tabs.onAttached.addListener((tabId: number, attachInfo: chrome.tabs.TabAttachInfo) => onTabAttached(tabId, attachInfo));
    chrome.tabs.onReplaced.addListener((addedTabId: number, removedTabId: number) => onTabReplaced(addedTabId, removedTabId));
    chrome.windows.onCreated.addListener((window: chrome.windows.Window) => onWindowCreated(window));
    chrome.windows.onRemoved.addListener((windowId: number) => onWindowRemoved(windowId));

})();
