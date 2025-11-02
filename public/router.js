import * as sections from './sections.js';

// Simple hash-based router to toggle main POS sections
const routes = {
  '#/sales': 'section-sales',
  '#/orders': 'section-orders',
  '#/inventory': 'section-inventory',
  '#/customers': 'section-customers',
  '#/employees': 'section-employees',
  '#/reports': 'section-reports',
  '#/settings': 'section-settings',
  '#/accounting': 'section-accounting',
  '#/system': 'section-system',
  '#/help': 'section-help',
  '#/menu': 'section-menu',
  '#/tables': 'section-tables',
  '#/kitchen': 'section-kitchen',
};

function showSection(id) {
  const container = document.getElementById('app-sections');
  if (!container) return;
  const showingSales = (id === routes['#/sales']);
  container.style.display = showingSales ? 'none' : 'block';
  document.querySelectorAll('#app-sections .pos-section').forEach(s => {
    s.style.display = (s.id === id) ? '' : 'none';
  });
  // highlight tab
  document.querySelectorAll('#pos-tabs .nav-link').forEach(a => {
    if (a.getAttribute('href') && routes[a.getAttribute('href')] === id) {
      a.classList.add('active');
    } else {
      a.classList.remove('active');
    }
  });
  // highlight sidebar nav
  document.querySelectorAll('#sidebar-nav .pos-nav-link').forEach(a => {
    if (a.getAttribute('href') && routes[a.getAttribute('href')] === id) {
      a.classList.add('active');
    } else {
      a.classList.remove('active');
    }
  });
  // Toggle legacy Home blocks: show for Sales, hide for others
  const homeRow = document.querySelector('#menu-section')?.closest('.row') || null;
  const menuSection = document.getElementById('menu-section');
  const pending = document.getElementById('pending-orders-section');
  const order = document.getElementById('order-section');
  if (showingSales) {
    if (homeRow) homeRow.style.display = '';
    if (menuSection) menuSection.style.display = '';
    if (pending) pending.style.display = '';
    if (order) order.style.display = '';
  } else {
    if (homeRow) homeRow.style.display = 'none';
    if (menuSection) menuSection.style.display = 'none';
    if (pending) pending.style.display = 'none';
    if (order) order.style.display = 'none';
  }
}

function handleRoute() {
  const hash = window.location.hash || '#/sales';
  const id = routes[hash];
  if (id) {
    showSection(id);
    // Render section content on navigation
    switch (hash) {
      case '#/sales':
        sections.renderSales();
        break;
      case '#/orders':
        sections.renderOrders();
        break;
      case '#/inventory':
        sections.renderInventory();
        break;
      case '#/customers':
        sections.renderCustomers();
        break;
      case '#/employees':
        sections.renderEmployees();
        break;
      case '#/reports':
        sections.renderReports();
        break;
      case '#/settings':
        sections.renderSettings();
        break;
      case '#/accounting':
        sections.renderAccounting();
        break;
      case '#/system':
        sections.renderSystem();
        break;
      case '#/help':
        sections.renderHelp();
        break;
      case '#/menu':
        sections.renderMenuMgmt();
        break;
      case '#/tables':
        sections.renderTables();
        break;
      case '#/kitchen':
        sections.renderKitchen();
        break;
    }
  }
}

export function initRouter() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}
