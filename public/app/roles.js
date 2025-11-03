// Role-based UI controls for sections, header actions, and sidebar entries

function q(sel){ return document.querySelector(sel); }
function qa(sel){ return Array.from(document.querySelectorAll(sel)); }

function show(sel){ const el=q(sel); if (el) el.style.display=''; }
function hide(sel){ const el=q(sel); if (el) el.style.display='none'; }

function hideAllSections(){
  ['#menu-section', '#pending-orders-section', '#order-section', '#queue-section', '#admin-dashboard-section']
    .forEach(hide);
  // hide header actions by default
  ['#add-order-btn', '#view-old-orders-btn', '#z-report-btn', '#profit-loss-btn']
    .forEach(sel => hide(sel));
}

function hideAdminNav(){
  ['#manage-stock-sidebar-item', '#manage-users-sidebar-item'].forEach(sel => hide(sel));
  qa("a[href*='/admin/']").forEach(a => { const li=a.closest('.nav-item'); if (li) li.style.display='none'; });
  qa('#sidebar-nav .nav-title').forEach(title => {
    const text = (title.textContent || '').toLowerCase();
    if (text.includes('admin')) title.style.display = 'none';
  });
}

function setSuperAdminNavVisible(visible){
  qa('#sidebar-nav .nav-title').forEach(title => {
    const text = (title.textContent || '').toLowerCase();
    if (text.includes('super admin')) title.style.display = visible ? '' : 'none';
  });
  qa("#sidebar-nav a[href^='/admin/']").forEach(link => {
    const li = link.closest('.nav-item');
    if (li) li.style.display = visible ? '' : 'none';
  });
}

export function applyRoleUI(role){
  hideAllSections();
  // Sidebar visibility control for app sections
  const toggleNav = (hash, visible) => {
    const apply = (rootSelector, selector) => {
      qa(`${rootSelector} ${selector}`).forEach(link => {
        const li = link.closest('.nav-item');
        if (li) li.style.display = visible ? '' : 'none';
      });
    };
    apply('#sidebar-nav', `a.pos-nav-link[href='${hash}']`);
    apply('#pos-tabs', `a.nav-link[href='${hash}']`);
  };
  switch (role) {
    case 'admin':
      show('#admin-dashboard-section');
      show('#z-report-btn');
      show('#profit-loss-btn');
      show('#manage-stock-sidebar-item');
      show('#manage-users-sidebar-item');
      // super admin links remain visible
      // Admin sees all nav entries
      ['#/sales','#/orders','#/inventory','#/customers','#/employees','#/reports','#/settings','#/accounting','#/system','#/help','#/menu','#/tables','#/kitchen']
        .forEach(h => toggleNav(h, true));
      setSuperAdminNavVisible(false);
      break;
    case 'superadmin':
      show('#admin-dashboard-section');
      show('#z-report-btn');
      show('#profit-loss-btn');
      show('#manage-stock-sidebar-item');
      show('#manage-users-sidebar-item');
      ['#/sales','#/orders','#/inventory','#/customers','#/employees','#/reports','#/settings','#/accounting','#/system','#/help','#/menu','#/tables','#/kitchen']
        .forEach(h => toggleNav(h, true));
      setSuperAdminNavVisible(true);
      break;
    case 'front':
      show('#menu-section');
      show('#pending-orders-section');
      show('#order-section');
      show('#add-order-btn');
      show('#view-old-orders-btn');
      hideAdminNav();
      setSuperAdminNavVisible(false);
      // Front: sales, orders, customers, help
      ['#/sales','#/orders','#/customers','#/help'].forEach(h => toggleNav(h, true));
      ['#/inventory','#/employees','#/reports','#/settings','#/accounting','#/system','#/menu','#/tables','#/kitchen'].forEach(h => toggleNav(h, false));
      break;
    case 'waiter':
      show('#menu-section');
      show('#order-section');
      show('#add-order-btn');
      hideAdminNav();
      setSuperAdminNavVisible(false);
      // Waiter: sales, orders, tables, help
      ['#/sales','#/orders','#/tables','#/help'].forEach(h => toggleNav(h, true));
      ['#/inventory','#/customers','#/employees','#/reports','#/settings','#/accounting','#/system','#/menu','#/kitchen'].forEach(h => toggleNav(h, false));
      break;
    case 'kitchen':
      // Kitchen display + limited modules
      hideAdminNav();
      setSuperAdminNavVisible(false);
      // Allowed: Orders, Inventory, Tables, Kitchen, Help, Employees (for clock)
      ['#/orders','#/inventory','#/tables','#/kitchen','#/help','#/employees'].forEach(h => toggleNav(h, true));
      // Hide everything else
      ['#/sales','#/customers','#/reports','#/settings','#/accounting','#/system','#/menu'].forEach(h => toggleNav(h, false));
      // Default to Kitchen view if on a hidden section
      if (!['#/orders','#/inventory','#/tables','#/kitchen','#/help','#/employees'].includes(window.location.hash)) {
        window.location.hash = '#/kitchen';
      }
      break;
    default:
      // fallback: minimal
      show('#menu-section');
      show('#order-section');
      hideAdminNav();
      setSuperAdminNavVisible(false);
  }
}
