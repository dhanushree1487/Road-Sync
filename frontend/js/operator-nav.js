/**
 * Road Sync — Municipal Operator Portal Shared Navigation & Drawer
 * 
 * Provides:
 * - Session validation: protects Municipal Operator pages and redirects unauthenticated visits to operator login
 * - Hamburger drawer open/close with keyboard and backdrop support
 * - Clean role-specific navigation: Dashboard, Manage Complaints, Repair Jobs, Maintenance Teams, Logout
 * - Logout handler: securely clears user session and redirects to the public homepage (index.html)
 * - Strict role isolation: prevents cross-role access from operator portal
 */

document.addEventListener('DOMContentLoaded', () => {

  const isInSubfolder = window.location.pathname.includes('/municipal-operator/');

  // 1. Session Authentication Check & Profile Display
  const rawUser = sessionStorage.getItem('roadsync_logged_user');
  let currentUser = null;

  try {
    if (rawUser) {
      currentUser = JSON.parse(rawUser);
    }
  } catch (e) {
    console.warn('Session parse error:', e);
  }

  // Enforce page protection: User must be authenticated as 'operator'
  if (!currentUser || currentUser.role !== 'operator') {
    // If not authenticated, redirect to dedicated operator login page
    window.location.href = isInSubfolder ? '../login.html?role=operator' : 'login.html?role=operator';
    return;
  }

  // Populate operator name in UI elements
  const displayNameEl = document.querySelector('.user-display-name');
  const dropdownNameEl = document.querySelector('.dropdown-user-name');
  const drawerUserNameEl = document.querySelector('.drawer-user-name');
  const userInitialsEls = document.querySelectorAll('.user-avatar-initials');

  const nameToDisplay = currentUser.displayName || 'Municipal Operator';
  const initials = 'MO';

  if (displayNameEl) {
    displayNameEl.textContent = currentUser.username || 'operator';
  }
  if (dropdownNameEl) {
    dropdownNameEl.textContent = nameToDisplay;
  }
  if (drawerUserNameEl) {
    drawerUserNameEl.textContent = nameToDisplay;
  }
  userInitialsEls.forEach(el => {
    el.textContent = initials;
  });

  // 2. Hamburger Drawer Elements & Controls
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const navDrawer = document.getElementById('navDrawer');
  const drawerBackdrop = document.getElementById('drawerBackdrop');
  const closeDrawerBtn = document.getElementById('closeDrawerBtn');

  function openDrawer() {
    if (!navDrawer) return;
    navDrawer.classList.add('is-open');
    if (drawerBackdrop) drawerBackdrop.classList.add('is-visible');
    if (hamburgerBtn) hamburgerBtn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('drawer-locked');

    // Focus first focusable item in drawer
    const firstFocusable = navDrawer.querySelector('button, [href], input');
    if (firstFocusable) firstFocusable.focus();
  }

  function closeDrawer() {
    if (!navDrawer) return;
    navDrawer.classList.remove('is-open');
    if (drawerBackdrop) drawerBackdrop.classList.remove('is-visible');
    if (hamburgerBtn) {
      hamburgerBtn.setAttribute('aria-expanded', 'false');
      hamburgerBtn.focus();
    }
    document.body.classList.remove('drawer-locked');
  }

  if (hamburgerBtn) {
    hamburgerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (navDrawer && navDrawer.classList.contains('is-open')) {
        closeDrawer();
      } else {
        openDrawer();
      }
    });
  }

  if (closeDrawerBtn) {
    closeDrawerBtn.addEventListener('click', closeDrawer);
  }

  if (drawerBackdrop) {
    drawerBackdrop.addEventListener('click', closeDrawer);
  }

  // Close drawer on Escape key press
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && navDrawer && navDrawer.classList.contains('is-open')) {
      closeDrawer();
    }
  });

  // 3. Secure Logout Handler (Clears operator session via backend & redirects to public homepage index.html)
  const logoutButtons = document.querySelectorAll('.js-logout-btn, #drawerLogoutBtn, #btnLogoutTop');
  logoutButtons.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        if (typeof ApiClient !== 'undefined') {
          await ApiClient.logout();
        }
      } catch (err) {
        console.warn('Backend logout notice:', err);
      } finally {
        try {
          sessionStorage.removeItem('roadsync_logged_user');
          sessionStorage.removeItem('roadsync_token');
        } catch (err) {}
        window.location.href = '../index.html';
      }
    });
  });

});
