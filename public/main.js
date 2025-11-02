import { initializeEventListeners } from './events.js';
import { initializeApp } from './handlers.js';
import { initializeUserManagement } from './manage-users.js';
import { initRouter } from './router.js';

// Run on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    initializeApp();
    initializeUserManagement();
    initRouter();
});
