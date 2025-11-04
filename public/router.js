import * as sections from './sections.js';

// Path-based router to toggle main POS sections
const routes = {
  '/sales': 'section-sales',
  '/orders': 'section-orders',
  '/inventory': 'section-inventory',
  // Product/Inventory subpages
  '/products/categories': 'section-product-categories',
  '/products/list': 'section-product-list',
  '/products/add': 'section-product-add',
  '/products/barcodes': 'section-product-barcodes',
  '/products/adjustments': 'section-product-adjustments',
  '/products/adjustments/add': 'section-product-adjustment-add',
  '/products/stock-count': 'section-product-stock-count',
  // Expenses
  '/expenses': 'section-expense-list',
  '/expenses/categories': 'section-expense-categories',
  '/expenses/list': 'section-expense-list',
  '/expenses/add': 'section-expense-add',
  '/customers': 'section-customers',
  '/employees': 'section-employees',
  '/reports': 'section-reports',
  '/settings': 'section-settings',
  // Settings subpages
  '/settings/printers': 'section-settings-printers',
  '/settings/invoice': 'section-settings-invoice',
  '/settings/roles': 'section-settings-roles',
  '/settings/discounts': 'section-settings-discounts',
  '/settings/discounts/add': 'section-settings-discount-add',
  '/accounting': 'section-accounting',
  '/system': 'section-system',
  '/help': 'section-help',
  '/menu': 'section-menu',
  '/tables': 'section-tables',
  '/kitchen': 'section-kitchen',
};

function showSection(id) {
  const container = document.getElementById('app-sections');
  if (!container) return;
  const showingSales = (id === routes['/sales']);
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
  let path = window.location.pathname || '/sales';
  if (path === '/') path = '/sales';
  const id = routes[path];
  if (!id) return;
  showSection(id);
  switch (path) {
    case '/sales': sections.renderSales(); break;
    case '/orders': sections.renderOrders(); break;
    case '/inventory': sections.renderInventory(); break;
    case '/products/categories': sections.renderProductCategories(); break;
    case '/products/list': sections.renderProductList(); break;
    case '/products/add': sections.renderProductAdd(); break;
    case '/products/barcodes': sections.renderProductBarcodes(); break;
    case '/products/adjustments': sections.renderProductAdjustments(); break;
    case '/products/adjustments/add': sections.renderProductAdjustmentAdd(); break;
    case '/products/stock-count': sections.renderProductStockCount(); break;
    case '/expenses':
    case '/expenses/list': sections.renderExpenseList(); break;
    case '/expenses/categories': sections.renderExpenseCategories(); break;
    case '/expenses/add': sections.renderExpenseAdd(); break;
    case '/customers': sections.renderCustomers(); break;
    case '/employees': sections.renderEmployees(); break;
    case '/reports': sections.renderReports(); break;
    case '/settings': sections.renderSettings(); break;
    case '/settings/printers': sections.renderSettingsPrinters(); break;
    case '/settings/invoice': sections.renderSettingsInvoice(); break;
    case '/settings/roles': sections.renderSettingsRoles(); break;
    case '/settings/discounts': sections.renderSettingsDiscounts(); break;
    case '/settings/discounts/add': sections.renderSettingsDiscountAdd(); break;
    case '/accounting': sections.renderAccounting(); break;
    case '/system': sections.renderSystem(); break;
    case '/help': sections.renderHelp(); break;
    case '/menu': sections.renderMenuMgmt(); break;
    case '/tables': sections.renderTables(); break;
    case '/kitchen': sections.renderKitchen(); break;
  }
}

export function navigate(path){
  if (!routes[path]) return;
  if (window.location.pathname !== path) {
    window.history.pushState({}, '', path);
  }
  handleRoute();
}

export function initRouter() {
  // Intercept clicks on internal nav links
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href');
    // Ignore external/admin/api links
    if (!href || href.startsWith('http') || href.startsWith('/admin/') || href.startsWith('/api/')) return;
    if (routes[href]) {
      e.preventDefault();
      navigate(href);
    }
  });
  window.addEventListener('popstate', handleRoute);
  // Expose for other modules
  window.clientNavigate = navigate;
  handleRoute();
}
