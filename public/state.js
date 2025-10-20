let state = {
    menu: {},
    currentUserRole: '',
    currentUser: null,
    selectedOrderId: null,
    activePaymentMethod: null,
    currentOrder: [],
};

export function getState() {
    return state;
}

export function setState(newState) {
    state = { ...state, ...newState };
}

export function getCurrentOrder() {
    return state.currentOrder;
}

export function setCurrentOrder(order) {
    state.currentOrder = order;
}

export function addItemToOrder(item) {
    const existingItem = state.currentOrder.find(i => i.name === item.name);
    if (existingItem) {
        existingItem.quantity++;
    } else {
        state.currentOrder.push({ ...item, quantity: 1 });
    }
}

export function clearCurrentOrder() {
    state.currentOrder = [];
    state.selectedOrderId = null;
}

export default state;