/**
 * Road Sync — Public User Portal Shared Navigation & Drawer
 * 
 * Provides:
 * - Session validation: protects Public User pages and redirects unauthenticated visits to login
 * - Hamburger drawer open/close with keyboard and backdrop support
 * - Clean role-specific navigation: Dashboard, My Complaints, Track Status, Logout
 * - Logout handler: securely clears user session and redirects to the main public homepage (index.html)
 * - Strict role isolation: prevents cross-role access from public portal
 */

document.addEventListener('DOMContentLoaded', () => {

  const isInSubfolder = window.location.pathname.includes('/users/') || 
                        window.location.pathname.includes('/municipal-operator/') || 
                        window.location.pathname.includes('/teams/');

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

  // Enforce page protection: User must be authenticated as 'public'
  if (!currentUser || currentUser.role !== 'public') {
    // If not authenticated, redirect to login page
    window.location.href = isInSubfolder ? '../login.html?role=public' : 'login.html?role=public';
    return;
  }

  // Populate user name in UI elements
  const displayNameEl = document.querySelector('.user-display-name');
  const dropdownNameEl = document.querySelector('.dropdown-user-name');
  const drawerUserNameEl = document.querySelector('.drawer-user-name');
  const userInitialsEls = document.querySelectorAll('.user-avatar-initials');

  const initials = currentUser.displayName
    ? currentUser.displayName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : 'PS';

  if (displayNameEl && currentUser.displayName) {
    displayNameEl.textContent = currentUser.displayName.split(' ')[0];
  }
  if (dropdownNameEl && currentUser.displayName) {
    dropdownNameEl.textContent = currentUser.displayName;
  }
  if (drawerUserNameEl && currentUser.displayName) {
    drawerUserNameEl.textContent = currentUser.displayName;
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

  // Keyboard accessibility (Escape key closes drawer)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && navDrawer && navDrawer.classList.contains('is-open')) {
      closeDrawer();
    }
  });

  // 3. Highlight Current Page in Drawer
  const currentPath = window.location.pathname.split('/').pop() || 'dashboard-public.html';
  const navItems = document.querySelectorAll('[data-page-link]');
  navItems.forEach(item => {
    const linkTarget = item.getAttribute('href');
    if (linkTarget === currentPath || (linkTarget === 'dashboard-public.html' && currentPath === '')) {
      item.classList.add('active');
      item.setAttribute('aria-current', 'page');
    } else {
      item.classList.remove('active');
      item.removeAttribute('aria-current');
    }
  });

  // 4. Logout Handler (Clears session data via backend and redirects to main public homepage)
  async function handleLogout() {
    if (confirm('Are you sure you want to log out of the Road Sync Public User Portal?')) {
      try {
        if (typeof ApiClient !== 'undefined') {
          await ApiClient.logout();
        }
      } catch (err) {
        console.warn('Backend logout notice:', err);
      } finally {
        sessionStorage.removeItem('roadsync_logged_user');
        sessionStorage.removeItem('roadsync_token');
        sessionStorage.removeItem('roadsync_toast_message');

        const targetHomepage = isInSubfolder ? '../index.html' : 'index.html';
        window.location.href = targetHomepage;
      }
    }
  }

  const logoutButtons = document.querySelectorAll('.js-logout-btn');
  logoutButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      handleLogout();
    });
  });

  // 5. User Profile Dropdown (Top Navigation Bar)
  const userProfileBtn = document.getElementById('userProfileBtn');
  const userDropdownMenu = document.getElementById('userDropdownMenu');

  if (userProfileBtn && userDropdownMenu) {
    userProfileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = userDropdownMenu.classList.contains('is-visible');
      userDropdownMenu.classList.toggle('is-visible', !isOpen);
      userProfileBtn.setAttribute('aria-expanded', !isOpen);
    });

    document.addEventListener('click', (e) => {
      if (!userDropdownMenu.contains(e.target) && e.target !== userProfileBtn) {
        userDropdownMenu.classList.remove('is-visible');
        userProfileBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

});
