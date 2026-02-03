import { MessageType } from './MessageType';
import { Util } from '../../app/Util';

export class Message {
    constructor(
        public readonly type: MessageType,
        public readonly channelId: number,
        public readonly data: Uint8Array
    ) { }

    public static parse(buffer: ArrayBuffer | Uint8Array): Message {
        const view = new DataView(buffer instanceof ArrayBuffer ? buffer : buffer.buffer);
        const type = view.getUint8(0);
        const channelId = view.getUint32(1, true); // Little Endian
        const data = new Uint8Array(buffer instanceof ArrayBuffer ? buffer : buffer.buffer).slice(5);

        return new Message(type, channelId, data);
    }

    public static createBuffer(type: MessageType, channelId: number, data?: Uint8Array): Uint8Array {
        const length = 5 + (data ? data.byteLength : 0);
        const buffer = new ArrayBuffer(length);
        const view = new DataView(buffer);
        const u8 = new Uint8Array(buffer);

        view.setUint8(0, type);
        view.setUint32(1, channelId, true); // Little Endian
        if (data) {
            u8.set(data, 5);
        }
        return u8;
    }

    public static fromCloseEvent(id: number, code: number, reason?: string): Message {
        const reasonBuffer = reason ? Util.stringToUtf8ByteArray(reason) : new Uint8Array(0);
        const length = 2 + 4 + reasonBuffer.byteLength;
        const buffer = new ArrayBuffer(length);
        const view = new DataView(buffer);

        view.setUint16(0, code, true);
        if (reasonBuffer.byteLength) {
            view.setUint32(2, reasonBuffer.byteLength, true);
            new Uint8Array(buffer).set(reasonBuffer, 6);
        }
        return new Message(MessageType.CloseChannel, id, new Uint8Array(buffer));
    }

    public toBuffer(): Uint8Array {
        return Message.createBuffer(this.type, this.channelId, this.data);
    }
}
