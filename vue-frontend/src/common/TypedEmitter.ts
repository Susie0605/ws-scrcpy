export class TypedEmitter<T> {
    private listeners: Partial<Record<keyof T, Array<(event: any) => void>>> = {};

    on<K extends keyof T>(event: K, listener: (arg: T[K]) => void): void {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event]!.push(listener);
    }

    off<K extends keyof T>(event: K, listener: (arg: T[K]) => void): void {
        const listeners = this.listeners[event];
        if (listeners) {
            const index = listeners.indexOf(listener);
            if (index !== -1) {
                listeners.splice(index, 1);
            }
        }
    }

    emit<K extends keyof T>(event: K, arg: T[K]): void {
        const listeners = this.listeners[event];
        if (listeners) {
            listeners.forEach(listener => listener(arg));
        }
    }
}
export interface EventMap {
    [key: string]: any;
}
