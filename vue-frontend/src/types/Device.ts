export interface DeviceInterface {
    name: string;
    ipv4: string;
}

export interface Device {
    udid: string;
    state: string;
    'ro.product.manufacturer': string;
    'ro.product.model': string;
    'ro.build.version.release': string;
    'ro.build.version.sdk': string;
    interfaces: DeviceInterface[];
    pid: number;
    'last.update.timestamp'?: number;
    'wifi.interface'?: string;
}

export interface DeviceTrackerEventList {
    id: string;
    name: string;
    list: Device[];
}

export interface DeviceTrackerEvent {
    id: string;
    name: string;
    device: Device;
}

export interface Message {
    type: string;
    data: any;
    id: number;
}
