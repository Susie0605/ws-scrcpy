import { createRouter, createWebHistory } from 'vue-router';
import DeviceListView from '../views/DeviceListView.vue';
import DeviceControlView from '../views/DeviceControlView.vue';
import LoginView from '../views/LoginView.vue';

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: '/login',
            name: 'login',
            component: LoginView,
            meta: { requiresAuth: false }
        },
        {
            path: '/',
            name: 'home',
            component: DeviceListView,
            meta: { requiresAuth: true }
        },
        {
            path: '/device/:udid',
            name: 'device-control',
            component: DeviceControlView,
            meta: { requiresAuth: true }
        }
    ]
});

// Navigation guard
router.beforeEach((to, from, next) => {
    const isAuthenticated = sessionStorage.getItem('isAuthenticated') === 'true';

    if (to.meta.requiresAuth && !isAuthenticated) {
        // Redirect to login if not authenticated
        next({ name: 'login' });
    } else if (to.name === 'login' && isAuthenticated) {
        // Redirect to home if already logged in
        next({ name: 'home' });
    } else {
        next();
    }
});

export default router;
