import { ControlMessage } from './ControlMessage';
import VideoSettings from '../VideoSettings';
import { Util } from '../Util';
import { Buffer } from '../../common/BufferShim';

export enum FilePushState {
    NEW,
    START,
    APPEND,
    FINISH,
    CANCEL,
}

type FilePushParams = {
    id: number;
    state: FilePushState;
    chunk?: Uint8Array;
    fileName?: string;
    fileSize?: number;
};

export class CommandControlMessage extends ControlMessage {
    public static PAYLOAD_LENGTH = 0;

    public static Commands: Map<number, string> = new Map([
        [ControlMessage.TYPE_EXPAND_NOTIFICATION_PANEL, 'Expand notifications'],
        [ControlMessage.TYPE_EXPAND_SETTINGS_PANEL, 'Expand settings'],
        [ControlMessage.TYPE_COLLAPSE_PANELS, 'Collapse panels'],
        [ControlMessage.TYPE_GET_CLIPBOARD, 'Get clipboard'],
        [ControlMessage.TYPE_SET_CLIPBOARD, 'Set clipboard'],
        [ControlMessage.TYPE_ROTATE_DEVICE, 'Rotate device'],
        [ControlMessage.TYPE_CHANGE_STREAM_PARAMETERS, 'Change video settings'],
    ]);

    public static createSetVideoSettingsCommand(videoSettings: VideoSettings): CommandControlMessage {
        const temp = videoSettings.toBuffer();
        const event = new CommandControlMessage(ControlMessage.TYPE_CHANGE_STREAM_PARAMETERS);
        const offset = CommandControlMessage.PAYLOAD_LENGTH + 1;
        const buffer = Buffer.alloc(offset + temp.length);
        buffer.writeUInt8(event.type, 0);

        // temp is Buffer from VideoSettings.toBuffer(), but BufferShim might return Uint8Array or Buffer
        // Assuming BufferShim behaves like Buffer, iterate or copy
        for (let i = 0; i < temp.length; i++) {
            buffer.writeUInt8(temp[i], i + offset);
        }
        event.buffer = buffer;
        return event;
    }

    private buffer?: Buffer;

    constructor(readonly type: number) {
        super(type);
    }

    public toBuffer(): Buffer {
        if (!this.buffer) {
            const buffer = Buffer.alloc(CommandControlMessage.PAYLOAD_LENGTH + 1);
            buffer.writeUInt8(this.type, 0);
            this.buffer = buffer;
        }
        return this.buffer;
    }
}
