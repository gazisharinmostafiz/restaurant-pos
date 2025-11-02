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
}

export function applyRoleUI(role){
  hideAllSections();
  switch (role) {
    case 'admin':
      show('#admin-dashboard-section');
      show('#z-report-btn');
      show('#profit-loss-btn');
      show('#manage-stock-sidebar-item');
      show('#manage-users-sidebar-item');
      // super admin links remain visible
      break;
    case 'front':
      show('#menu-section');
      show('#pending-orders-section');
      show('#order-section');
      show('#add-order-btn');
      show('#view-old-orders-btn');
      hideAdminNav();
      break;
    case 'waiter':
      show('#menu-section');
      show('#order-section');
      show('#add-order-btn');
      hideAdminNav();
      break;
    case 'kitchen':
      show('#queue-section');
      hideAdminNav();
      break;
    default:
      // fallback: minimal
      show('#menu-section');
      show('#order-section');
      hideAdminNav();
  }
}

