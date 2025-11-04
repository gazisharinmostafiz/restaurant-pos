import * as api from './api.js';
import * as ui from './ui.js';
import { getState, setState, setCurrentOrder, addItemToOrder, clearCurrentOrder } from './state.js';
import * as handlers from './handlers.clean.js';

export function initializeEventListeners() {
    // Element cache
    const DOMElements = {
        loginForm: document.getElementById('login-form'),
        logoutBtn: document.getElementById('logout-btn'),
        addOrderBtn: document.getElementById('add-order-btn'),
        placeOrderBtn: document.getElementById('place-order-btn'),
        payCashBtn: document.getElementById('pay-cash-btn'),
        payCardBtn: document.getElementById('pay-card-btn'),
        suspendSaleBtn: document.getElementById('suspend-sale-btn'),
        resumeSaleBtn: document.getElementById('resume-sale-btn'),
        printReceiptBtn: document.getElementById('print-receipt-btn'),
        emailReceiptBtn: document.getElementById('email-receipt-btn'),
        lookupInput: document.getElementById('lookup-input'),
        lookupAddBtn: document.getElementById('lookup-add-btn'),
        viewOldOrdersBtn: document.getElementById('view-old-orders-btn'),
        zReportBtn: document.getElementById('z-report-btn'),
        zReportModal: document.getElementById('z-report-modal'),
        profitLossBtn: document.getElementById('profit-loss-btn'),
        profitLossModal: document.getElementById('profit-loss-modal'),
        generateProfitLossBtn: document.getElementById('generate-profit-loss-btn'),
        confirmPaymentBtn: document.getElementById('confirm-payment-btn'),
        saveStockBtn: document.getElementById('save-stock-btn'),
        filterOrdersBtn: document.getElementById('filter-orders-btn'),
        showAllOrdersBtn: document.getElementById('show-all-orders-btn'),
        stockSearchInput: document.getElementById('stock-search-input'),
        
        menuCategoriesContainer: document.querySelector('.menu-categories'),
        menuItemsContainer: document.getElementById('menu-items'),
        orderList: document.getElementById('order-list'),
        pendingOrdersList: document.getElementById('pending-orders-list'),
        orderQueueList: document.getElementById('order-queue-list'),
        orderTypeSelect: document.getElementById('order-type-select'),
        
        amountTenderedInput: document.getElementById('amount-tendered'),
        discountInput: document.getElementById('discount-amount'),
        oldOrdersDateFilter: document.getElementById('old-orders-date-filter'),
        tableSelect: document.getElementById('table-select'),

        // Modals
        oldOrdersModal: document.getElementById('old-orders-modal'),
        paymentModal: document.getElementById('payment-modal'),
        zReportModal: document.getElementById('z-report-modal'),
        stockModal: document.getElementById('stock-modal'),
        suspendedSalesModal: document.getElementById('suspended-sales-modal'),
        suspendedSalesList: document.getElementById('suspended-sales-list'),
        orderViewModal: document.getElementById('order-view-modal'),
        tableOrderConfirmModal: document.getElementById('table-order-confirm-modal'),
        tableOrderConfirmText: document.getElementById('table-order-confirm-text'),
        addToExistingBtn: document.getElementById('btn-add-to-existing-order'),
        createNewOrderBtn: document.getElementById('btn-create-new-order'),
        manageStockSidebarItem: document.getElementById('manage-stock-sidebar-item'),
        stockListAccordion: document.getElementById('stock-list-accordion'),
    };

    // --- Event Listeners ---

    // Authentication
    DOMElements.loginForm.addEventListener('submit', handlers.handleLogin);
    DOMElements.logoutBtn.addEventListener('click', handlers.handleLogout);

    // Order Creation & Management
    DOMElements.addOrderBtn.addEventListener('click', handlers.handleNewOrder);
    DOMElements.placeOrderBtn.addEventListener('click', handlers.handlePlaceOrder);
    DOMElements.orderTypeSelect.addEventListener('change', (e) => {
        DOMElements.tableSelect.style.display = (e.target.value === 'table') ? 'inline-block' : 'none';
    });

    // Menu Interaction
    DOMElements.menuCategoriesContainer.addEventListener('click', (e) => {
        const link = e.target.closest('.menu-category-btn');
        if (link) {
            e.preventDefault(); // Prevent default anchor behavior
            handlers.handleCategorySelect(link.dataset.category);
        }
    });
    DOMElements.menuItemsContainer.addEventListener('click', (e) => {
        const itemElement = e.target.closest('.menu-item');
        if (itemElement) {
            handlers.handleAddItemToOrder(itemElement);
        }
    });

    // Current Order List Interaction
    DOMElements.orderList.addEventListener('click', (e) => {
        const itemElement = e.target.closest('.list-group-item');
        if (!itemElement) return;
        const itemIndex = parseInt(itemElement.dataset.index, 10);

        if (e.target.classList.contains('remove-item-btn')) {
            handlers.handleRemoveItem(itemIndex);
        } else if (e.target.classList.contains('quantity-btn')) {
            handlers.handleUpdateQuantity(itemIndex, e.target.dataset.action);
        }
    });

    // Pending Orders & Payment
    DOMElements.pendingOrdersList.addEventListener('click', (e) => {
        const target = e.target.closest('.pending-order-item');
        if (target) {
            handlers.handleSelectPendingOrder(target);
        }
    });
    DOMElements.payCashBtn.addEventListener('click', () => handlers.openPaymentModal('cash'));
    DOMElements.payCardBtn.addEventListener('click', () => handlers.openPaymentModal('card'));
    DOMElements.confirmPaymentBtn.addEventListener('click', handlers.processPayment);
    DOMElements.amountTenderedInput.addEventListener('input', handlers.updatePaymentDetails);
    DOMElements.discountInput.addEventListener('input', handlers.updatePaymentDetails);

    // Suspend / Resume / Receipt
    if (DOMElements.suspendSaleBtn) DOMElements.suspendSaleBtn.addEventListener('click', handlers.suspendCurrentSale);
    if (DOMElements.resumeSaleBtn) DOMElements.resumeSaleBtn.addEventListener('click', handlers.openSuspendedSalesModal);
    if (DOMElements.printReceiptBtn) DOMElements.printReceiptBtn.addEventListener('click', handlers.printReceipt);
    if (DOMElements.emailReceiptBtn) DOMElements.emailReceiptBtn.addEventListener('click', handlers.emailReceipt);

    // Lookup / Scan
    if (DOMElements.lookupInput) {
        DOMElements.lookupInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handlers.handleLookupAdd();
        });
    }
    if (DOMElements.lookupAddBtn) DOMElements.lookupAddBtn.addEventListener('click', handlers.handleLookupAdd);

    // Kitchen Queue
    DOMElements.orderQueueList.addEventListener('click', (e) => {
        if (e.target.classList.contains('mark-ready-btn')) {
            const orderId = e.target.dataset.orderId;
            handlers.updateOrderStatus(orderId, 'ready');
        }
    });

    // Reports and History
    DOMElements.viewOldOrdersBtn.addEventListener('click', () => handlers.fetchAndShowOldOrders());
    DOMElements.zReportBtn.addEventListener('click', handlers.generateZReport);
    DOMElements.profitLossBtn.addEventListener('click', handlers.openProfitLossModal);
    DOMElements.generateProfitLossBtn.addEventListener('click', handlers.handleGenerateProfitLossReport);
    DOMElements.filterOrdersBtn.addEventListener('click', () => {
        const date = DOMElements.oldOrdersDateFilter.value;
        const paymentMethod = document.getElementById('old-orders-payment-filter').value;
        handlers.fetchAndShowOldOrders(date || null, paymentMethod || null);
    });
    DOMElements.showAllOrdersBtn.addEventListener('click', () => handlers.fetchAndShowOldOrders(null, null));

    // Stock Management
    DOMElements.manageStockSidebarItem.addEventListener('click', handlers.openStockModal);
    DOMElements.saveStockBtn.addEventListener('click', handlers.saveStockChanges);
    DOMElements.stockSearchInput.addEventListener('input', handlers.handleStockSearch);
    DOMElements.stockListAccordion.addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('stock-adj-btn')) {
            handlers.handleStockAdjustment(target);
        } else if (target.classList.contains('set-stock-btn')) {
            handlers.handleSetStock(target);
        } else if (target.classList.contains('edit-item-btn')) {
            const itemId = parseInt(target.closest('.stock-item').dataset.itemId, 10);
            handlers.handleEditMenuItem(itemId);
        } else if (target.classList.contains('delete-item-btn')) {
            const itemId = parseInt(target.closest('.stock-item').dataset.itemId, 10);
            handlers.handleDeleteMenuItem(itemId);
        }
    });

    const menuItemForm = document.getElementById('menu-item-form');
    if (menuItemForm) {
        menuItemForm.addEventListener('submit', handlers.handleMenuItemFormSubmit);
    }

    const clearMenuItemFormBtn = document.getElementById('clear-menu-item-form-btn');
    if (clearMenuItemFormBtn) {
        clearMenuItemFormBtn.addEventListener('click', ui.clearMenuItemForm);
    }

    // Modal Closing
    [DOMElements.oldOrdersModal, DOMElements.paymentModal, DOMElements.zReportModal, DOMElements.stockModal, DOMElements.profitLossModal, DOMElements.suspendedSalesModal, DOMElements.tableOrderConfirmModal, DOMElements.orderViewModal, document.getElementById('manage-users-modal')].forEach(modal => {
        if (!modal) return;
        modal.addEventListener('click', e => {
            if (e.target === modal || e.target.classList.contains('close-btn')) {
                modal.style.display = 'none';
            }
        });
    });

    // Table order confirm actions
    if (DOMElements.addToExistingBtn) DOMElements.addToExistingBtn.addEventListener('click', handlers.confirmAddToExistingTableOrder);
    if (DOMElements.createNewOrderBtn) DOMElements.createNewOrderBtn.addEventListener('click', handlers.confirmCreateNewTableOrder);
}
