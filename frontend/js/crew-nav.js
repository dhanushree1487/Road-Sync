/**
 * Road Sync — Maintenance Team Portal Shared Navigation & Drawer
 * 
 * Provides:
 * - Session validation: protects Maintenance Team pages and redirects unauthenticated visits to crew login
 * - Hamburger drawer open/close with keyboard and backdrop support
 * - Clean role-specific navigation: Dashboard, Assigned Jobs, Completed Jobs, Logout
 * - Logout handler: securely clears user session and redirects to the public homepage (index.html)
 * - Strict role isolation: prevents access to municipal operator or public user controls
 */

// Helper to resolve currently logged-in Maintenance Team
function getCurrentCrewTeam() {
  const rawUser = sessionStorage.getItem('roadsync_logged_user');
  let user = null;
  try {
    if (rawUser) user = JSON.parse(rawUser);
  } catch (e) {
    console.warn('Session parse error:', e);
  }

  const username = (user && user.username ? user.username : 'team01').toLowerCase();
  let teamId = 'T01';
  if (username.includes('02') || username.includes('team02')) teamId = 'T02';
  else if (username.includes('03') || username.includes('team03')) teamId = 'T03';

  const teams = (typeof PublicComplaintStore !== 'undefined') ? PublicComplaintStore.getTeams() : [];
  return teams.find(t => t.teamId === teamId || t.username === username) || {
    teamId: teamId,
    name: `Team ${teamId}`,
    baseLocation: 'Municipal Operations Depot',
    lead: 'Operations Foreman',
    division: 'Municipal Works Department'
  };
}

document.addEventListener('DOMContentLoaded', () => {

  const isInSubfolder = window.location.pathname.includes('/teams/');

  // 1. Session Authentication Check & Role Protection
  const rawUser = sessionStorage.getItem('roadsync_logged_user');
  let currentUser = null;

  try {
    if (rawUser) {
      currentUser = JSON.parse(rawUser);
    }
  } catch (e) {
    console.warn('Crew session parse error:', e);
  }

  // Enforce page protection: User must be authenticated as 'crew'
  if (!currentUser || currentUser.role !== 'crew') {
    window.location.href = isInSubfolder ? '../login.html?role=crew' : 'login.html?role=crew';
    return;
  }

  const currentTeam = getCurrentCrewTeam();

  // Populate crew identity in UI elements
  const crewBadgeEl = document.getElementById('crewUserBadge');
  const drawerCrewNameEl = document.getElementById('drawerCrewName');
  const drawerCrewInitialsEl = document.getElementById('drawerCrewInitials');
  const crewTeamTitleEl = document.getElementById('crewTeamTitle');
  const crewTeamMetaEl = document.getElementById('crewTeamMeta');

  if (crewBadgeEl) {
    crewBadgeEl.textContent = `${currentUser.username} (${currentTeam.teamId})`;
  }
  if (drawerCrewNameEl) {
    drawerCrewNameEl.textContent = currentTeam.name;
  }
  if (drawerCrewInitialsEl) {
    drawerCrewInitialsEl.textContent = currentTeam.teamId;
  }
  if (crewTeamTitleEl) {
    crewTeamTitleEl.textContent = currentTeam.name;
  }
  if (crewTeamMetaEl) {
    crewTeamMetaEl.innerHTML = `Base Depot: <strong>${currentTeam.baseLocation}</strong> • Lead: <strong>${currentTeam.lead}</strong>`;
  }

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

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && navDrawer && navDrawer.classList.contains('is-open')) {
      closeDrawer();
    }
  });

  // Highlight active drawer link based on current page path
  const currentPath = window.location.pathname;
  document.querySelectorAll('.drawer-nav-link').forEach(link => {
    const href = link.getAttribute('href');
    if (href && currentPath.endsWith(href)) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // 3. Logout Handlers
  const logoutButtons = document.querySelectorAll('.js-crew-logout-btn, #crewLogoutBtn, #drawerLogoutBtn');
  logoutButtons.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        if (typeof ApiClient !== 'undefined') {
          await ApiClient.logout();
        }
      } catch (err) {
        console.warn('Logout session clear notice:', err);
      } finally {
        try {
          sessionStorage.removeItem('roadsync_logged_user');
          sessionStorage.removeItem('roadsync_token');
        } catch (err) {}
        window.location.href = isInSubfolder ? '../index.html' : 'index.html';
      }
    });
  });

});
