<template>
  <div class="device-list">
    <h1>设备列表</h1>
    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="!connected" class="connecting">连接到服务器...</div>
    
    <table v-if="devices.length > 0">
      <thead>
        <tr>
          <th>厂商</th>
          <th>型号</th>
          <th>序列号(UDID)</th>
          <th>版本</th>
          <th>状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="device in devices" :key="device.udid" :class="{ active: device.state === 'device' }">
          <td>{{ device['ro.product.manufacturer'] }}</td>
          <td>{{ device['ro.product.model'] }}</td>
          <td>{{ device.udid }}</td>
          <td>{{ device['ro.build.version.release'] }} (SDK {{ device['ro.build.version.sdk'] }})</td>
          <td>{{ device.state }}</td>
          <td>
            <button 
              v-if="device.state === 'device'" 
              @click="controlDevice(device.udid)"
              class="control-btn"
            >
              控制
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-else-if="connected" class="no-devices">
      没有找到设备。
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import type { Device, Message, DeviceTrackerEventList, DeviceTrackerEvent } from '../types/Device';
import { Multiplexer } from '../packages/multiplexer/Multiplexer';
import { ChannelCode } from '../common/ChannelCode';
import { Util } from '../app/Util';

const devices = ref<Device[]>([]);
const connected = ref(false);
const error = ref('');
let multiplexer: Multiplexer | null = null;
let deviceChannel: Multiplexer | null = null;
const router = useRouter();

const ACTION_LIST = 'devicelist';
const ACTION_DEVICE = 'device';

const connect = () => {
    try {
        // Connect to the backend
        const wsUrl = 'wss://zzz666.top:38169/ws/?action=multiplex';
        const ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';

        multiplexer = Multiplexer.wrap(ws);

        multiplexer.on('open', () => {
            console.log('Multiplexer connected');
            status.value = 'Multiplexer connected, opening channel...';
            // Open channel for Device List (GTRC)
            const channelInitData = Util.stringToUtf8ByteArray(ChannelCode.GTRC);
            deviceChannel = multiplexer!.createChannel(channelInitData);

            deviceChannel.on('open', () => {
                console.log('Device Channel Opened');
                connected.value = true;
                error.value = '';
            });

            deviceChannel.on('message', (event: MessageEvent) => {
                try {
                   // event.data should be string or arraybuffer, usually text for device list
                   // but based on BaseDeviceTracker.ts it parses JSON from event.data
                   let dataString: string;
                   if (typeof event.data === 'string') {
                       dataString = event.data;
                   } else {
                       dataString = Util.utf8ByteArrayToString(new Uint8Array(event.data));
                   }

                   const message: Message = JSON.parse(dataString);
                   if (message.type === ACTION_LIST) {
                       const data = message.data as DeviceTrackerEventList;
                       devices.value = data.list;
                   } else if (message.type === ACTION_DEVICE) {
                       const data = message.data as DeviceTrackerEvent;
                       updateDevice(data.device);
                   }
                } catch (e) {
                    console.error('Failed to parse message', e);
                }
            });
            
            deviceChannel.on('close', () => {
                console.log('Device Channel Closed');
                connected.value = false;
            });
        });

        multiplexer.on('close', () => {
            console.log('Multiplexer disconnected');
            connected.value = false;
            // Try to reconnect after a delay
            setTimeout(connect, 3000);
        });

        multiplexer.on('error', (e) => {
            console.error('WebSocket error', e);
            error.value = 'Connection error';
        });

    } catch (e) {
        error.value = 'Failed to create WebSocket connection';
    }
};

const updateDevice = (device: Device) => {
    const index = devices.value.findIndex(d => d.udid === device.udid);
    if (index !== -1) {
        devices.value[index] = device;
    } else {
        devices.value.push(device);
    }
};

const controlDevice = (udid: string) => {
    router.push({ name: 'device-control', params: { udid } });
};

const status = ref('');

onMounted(() => {
    connect();
});

onUnmounted(() => {
    if (multiplexer) {
        multiplexer.close();
    }
});
</script>

<style scoped>
.device-list {
  padding: 20px;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 20px;
}
th, td {
  border: 1px solid #ddd;
  padding: 8px;
  text-align: left;
}
th {
  background-color: #f2f2f2;
}
tr.active:hover {
  background-color: #f5f5f5;
}
.control-btn {
  background-color: #4CAF50;
  color: white;
  padding: 6px 12px;
  border: none;
  cursor: pointer;
  border-radius: 4px;
}
.control-btn:hover {
  background-color: #45a049;
}
.error {
    color: red;
    margin-bottom: 10px;
}
</style>
