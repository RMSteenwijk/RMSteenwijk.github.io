export declare class KeyEvent {
    Key: string;
    Event: () => void;
    constructor(key: string, eventToExecute: () => void);
}
