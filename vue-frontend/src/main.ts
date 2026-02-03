import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import { Buffer } from 'buffer'

// @ts-ignore
window.Buffer = Buffer;

createApp(App).use(router).mount('#app')
