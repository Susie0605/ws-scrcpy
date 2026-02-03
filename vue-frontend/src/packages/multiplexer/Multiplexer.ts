import { TypedEmitter } from '../../common/TypedEmitter';
import { Message } from './Message';
import { MessageType } from './MessageType';
import { Util } from '../../app/Util';

interface MultiplexerEvents {
    empty: Multiplexer;
    channel: { channel: Multiplexer; data: ArrayBuffer };
    open: Event;
    close: CloseEvent;
    message: MessageEvent;
    error: Event;
}

export class Multiplexer extends TypedEmitter<MultiplexerEvents> {
    readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CLOSING = 2;
    readonly CLOSED = 3;
    public readyState: number;
    private channels: Map<number, Multiplexer> = new Map();
    private nextId = 0;
    private maxId = 4294967296;

    public onclose: ((this: Multiplexer, ev: CloseEvent) => any) | null = null;
    public onerror: ((this: Multiplexer, ev: Event) => any) | null = null;
    public onmessage: ((this: Multiplexer, ev: MessageEvent) => any) | null = null;
    public onopen: ((this: Multiplexer, ev: Event) => any) | null = null;

    public static wrap(ws: WebSocket): Multiplexer {
        return new Multiplexer(ws);
    }

    protected constructor(public readonly ws: WebSocket | Multiplexer, private _id = 0) {
        super();
        this.readyState = this.CONNECTING;
        if (this._id === 0) {
            if (this.ws instanceof WebSocket) {
                this.ws.binaryType = 'arraybuffer';
            }
            this.readyState = this.ws.readyState;
        }

        const onOpenHandler = (event: Event) => {
            this.readyState = this.ws.readyState;
            this.emit('open', event);
            if (this.onopen) this.onopen.call(this, event);
        };

        const onCloseHandler = (event: CloseEvent) => {
            this.readyState = this.ws.readyState;
            this.emit('close', event);
            if (this.onclose) this.onclose.call(this, event);
            this.channels.clear();
        };

        const onErrorHandler = (event: Event) => {
            this.readyState = this.ws.readyState;
            this.emit('error', event);
            if (this.onerror) this.onerror.call(this, event);
            this.channels.clear();
        };

        const onMessageHandler = (event: MessageEvent) => {
            if (this._id !== 0) {
                // Should not happen for channels? 
                // Channels receive messages via dispatchEvent from parent
                return;
            }
            const { data } = event;
            if (!(data instanceof ArrayBuffer)) {
                return;
            }
            const message = Message.parse(data);
            switch (message.type) {
                case MessageType.CreateChannel: {
                    const { channelId, data } = message;
                    if (this.nextId < channelId) {
                        this.nextId = channelId;
                    }
                    const channel = this._createChannel(channelId, false);
                    this.emit('channel', { channel, data: data.buffer as ArrayBuffer });
                    break;
                }
                case MessageType.RawStringData: {
                    const channel = this.channels.get(message.channelId);
                    if (channel) {
                        const msg = new MessageEvent('message', {
                            data: Util.utf8ByteArrayToString(message.data),
                        });
                        channel.dispatchEvent(msg);
                    }
                    break;
                }
                case MessageType.RawBinaryData: {
                    const channel = this.channels.get(message.channelId);
                    if (channel) {
                        const msg = new MessageEvent('message', {
                            data: message.data.buffer,
                        });
                        channel.dispatchEvent(msg);
                    }
                    break;
                }
                case MessageType.Data: {
                    const channel = this.channels.get(message.channelId);
                    if (channel) {
                        const msg = new MessageEvent('message', {
                            data: message.data.buffer,
                        });
                        channel.dispatchEvent(msg);
                    }
                    break;
                }
                case MessageType.CloseChannel: {
                    const channel = this.channels.get(message.channelId);
                    if (channel) {
                        channel.readyState = channel.CLOSING;
                        // Parse close event
                        const data = message.data;
                        let code: number | undefined;
                        let reason: string | undefined;
                        if (data.byteLength >= 2) {
                            const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
                            code = view.getUint16(0, true);
                            if (data.byteLength > 6) {
                                const len = view.getUint32(2, true);
                                reason = Util.utf8ByteArrayToString(data.slice(6, 6 + len));
                            }
                        }

                        channel.dispatchEvent(new CloseEvent('close', { code, reason }));
                        channel.readyState = channel.CLOSED;
                        this.channels.delete(message.channelId);
                    }
                    break;
                }
            }
        };

        if (this._id === 0) {
            this.ws.addEventListener('open', onOpenHandler as EventListener);
            this.ws.addEventListener('error', onErrorHandler as EventListener);
            this.ws.addEventListener('close', onCloseHandler as EventListener);
            this.ws.addEventListener('message', onMessageHandler as EventListener);
        }
    }

    private _createChannel(id: number, sendOpenEvent: boolean): Multiplexer {
        const channel = new Multiplexer(this, id);
        this.channels.set(id, channel);
        if (sendOpenEvent) {
            setTimeout(() => {
                channel.readyState = this.OPEN;
                channel.dispatchEvent(new Event('open'));
            }, 0);
        } else {
            channel.readyState = this.readyState;
        }
        return channel;
    }

    public createChannel(data: Uint8Array): Multiplexer {
        const id = this.getNextId();
        const channel = this._createChannel(id, true);
        const msg = Message.createBuffer(MessageType.CreateChannel, id, data);
        this.sendInternal(msg);
        return channel;
    }

    public send(data: string | ArrayBuffer | Uint8Array): void {
        const isString = typeof data === 'string';
        let u8: Uint8Array;
        if (isString) {
            u8 = Util.stringToUtf8ByteArray(data);
        } else if (data instanceof ArrayBuffer) {
            u8 = new Uint8Array(data);
        } else {
            u8 = data;
        }

        if (this._id === 0) {
            // Root multiplexer sending data... usually shouldn't happen unless wrapping another socket?
            // Actually Multiplexer implementation in original project supports nesting.
            // But here let's assume root just sends data.
            this.ws.send(data);
        } else {
            // Child channel
            const type = isString ? MessageType.RawStringData : MessageType.RawBinaryData;
            const msg = Message.createBuffer(type, this._id, u8);
            (this.ws as Multiplexer).sendInternal(msg);
        }
    }

    public sendInternal(data: Uint8Array | ArrayBuffer): void {
        if (this._id === 0) {
            this.ws.send(data);
        } else {
            (this.ws as Multiplexer).sendInternal(data);
        }
    }

    private getNextId(): number {
        while (this.channels.has(++this.nextId)) {
            if (this.nextId === this.maxId) this.nextId = 0;
        }
        return this.nextId;
    }

    public dispatchEvent(event: Event): boolean {
        if (event.type === 'close') {
            if (this.onclose) this.onclose.call(this, event as CloseEvent);
            this.emit('close', event as CloseEvent);
        } else if (event.type === 'open') {
            if (this.onopen) this.onopen.call(this, event);
            this.emit('open', event);
        } else if (event.type === 'message') {
            if (this.onmessage) this.onmessage.call(this, event as MessageEvent);
            this.emit('message', event as MessageEvent);
        } else if (event.type === 'error') {
            if (this.onerror) this.onerror.call(this, event);
            this.emit('error', event);
        }
        return true;
    }

    public addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
        // Simplified shim
        if (type === 'open') this.on('open', (e) => typeof listener === 'function' ? listener(e) : listener.handleEvent(e));
        if (type === 'close') this.on('close', (e) => typeof listener === 'function' ? listener(e) : listener.handleEvent(e));
        if (type === 'message') this.on('message', (e) => typeof listener === 'function' ? listener(e) : listener.handleEvent(e));
        if (type === 'error') this.on('error', (e) => typeof listener === 'function' ? listener(e) : listener.handleEvent(e));
    }

    public close(): void {
        // ...
    }
}
