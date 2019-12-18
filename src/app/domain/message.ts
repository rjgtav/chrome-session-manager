export enum MESSAGE {
    SESSION_CLOSE = 'session.close',
    SESSION_OPEN = 'session.open',
    SESSION_LIST = 'session.list',
    SESSION_LIST_UPDATE = 'session.list.update',
    SESSION_REMOVE = 'session.remove',
    SESSION_RENAME = 'session.rename',
    SESSION_SWITCH = 'session.switch',
}

export interface Message<PAYLOAD extends any> {
    message: MESSAGE;
    payload: PAYLOAD;
}
