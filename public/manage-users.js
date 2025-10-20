import * as api from './api.js';
import * as ui from './ui.js';

let users = [];

async function loadUsers() {
    try {
        const data = await api.getUsers();
        users = data.users;
        renderUsers();
    } catch (error) {
        ui.showToast('Failed to load users.', 'error');
    }
}

function renderUsers() {
    const usersList = document.getElementById('users-list');
    usersList.innerHTML = '';
    users.forEach(user => {
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-center';
        li.innerHTML = `
            <span>${user.username} - <strong>${user.role}</strong></span>
            <div>
                <button class="btn btn-sm btn-outline-primary edit-user-btn" data-id="${user.id}">Edit</button>
                <button class="btn btn-sm btn-outline-danger delete-user-btn" data-id="${user.id}">Delete</button>
            </div>
        `;
        usersList.appendChild(li);
    });
}

function populateUserForm(userId) {
    const user = users.find(u => u.id === userId);
    if (user) {
        document.getElementById('user-id').value = user.id;
        document.getElementById('user-username').value = user.username;
        document.getElementById('user-role').value = user.role;
        document.getElementById('user-password').value = '';
    }
}

function clearUserForm() {
    document.getElementById('user-form').reset();
    document.getElementById('user-id').value = '';
}

async function handleUserFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('user-id').value;
    const username = document.getElementById('user-username').value;
    const password = document.getElementById('user-password').value;
    const role = document.getElementById('user-role').value;

    const userData = { username, role };
    if (password) {
        userData.password = password;
    }

    try {
        if (id) {
            await api.updateUser(id, userData);
            ui.showToast('User updated successfully.', 'success');
        } else {
            await api.createUser(userData);
            ui.showToast('User created successfully.', 'success');
        }
        clearUserForm();
        await loadUsers();
    } catch (error) {
        ui.showToast(error.message, 'error');
    }
}

async function handleDeleteUser(userId) {
    if (confirm('Are you sure you want to delete this user?')) {
        try {
            await api.deleteUser(userId);
            ui.showToast('User deleted successfully.', 'success');
            await loadUsers();
        } catch (error) {
            ui.showToast(error.message, 'error');
        }
    }
}

export function initializeUserManagement() {
    const manageUsersModal = document.getElementById('manage-users-modal');
    const userForm = document.getElementById('user-form');
    const usersList = document.getElementById('users-list');
    const clearFormBtn = document.getElementById('clear-user-form-btn');
    const manageUsersSidebarItem = document.getElementById('manage-users-sidebar-item');

    if (manageUsersSidebarItem) {
        manageUsersSidebarItem.addEventListener('click', () => {
            loadUsers();
            ui.showModal('manage-users-modal');
        });
    }

    if (userForm) {
        userForm.addEventListener('submit', handleUserFormSubmit);
    }

    if (usersList) {
        usersList.addEventListener('click', (e) => {
            if (e.target.classList.contains('edit-user-btn')) {
                const userId = parseInt(e.target.dataset.id, 10);
                populateUserForm(userId);
            } else if (e.target.classList.contains('delete-user-btn')) {
                const userId = parseInt(e.target.dataset.id, 10);
                handleDeleteUser(userId);
            }
        });
    }

    if (clearFormBtn) {
        clearFormBtn.addEventListener('click', clearUserForm);
    }
    
    const closeButton = manageUsersModal.querySelector('.close-btn');
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            ui.hideModal('manage-users-modal');
        });
    }
}