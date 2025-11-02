import { initializeEventListeners } from './events.js';
import { initializeApp } from './handlers.js';
import { initializeUserManagement } from './manage-users.js';
import * as handlers from './handlers.clean.js';
import { initRouter } from './router.js';

// Run on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    initializeApp();
    initializeUserManagement();
    initRouter();
});

// Expose handlers for inline onclick usage (for reliability across encodings)
// This allows buttons in HTML to call e.g., handlers.openPaySelectedModal()
// without depending on additional event wiring.
window.handlers = handlers;
