import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './styles/app.css';
import './styles/extra.css';
import './styles/mobile.css';

createApp(App).use(router).mount('#app');
