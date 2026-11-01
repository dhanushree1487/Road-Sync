/**
 * Road Sync — Stage 1: Public Homepage & Brand Identity
 * Vanilla JavaScript interactions: Navigation, Dialog Modals, and Accessible Handlers.
 */

document.addEventListener('DOMContentLoaded', () => {
  // --------------------------------------------------------------------------
  // 1. Mobile Navigation Toggle
  // --------------------------------------------------------------------------
  const navToggle = document.getElementById('navToggle');
  const navMenu = document.getElementById('navMenu');
  const navLinks = document.querySelectorAll('.nav-link, .nav-menu .btn');

  if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
      const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', !isExpanded);
      navMenu.classList.toggle('is-open');
    });

    // Close menu when any nav link is clicked
    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        navToggle.setAttribute('aria-expanded', 'false');
        navMenu.classList.remove('is-open');
      });
    });

    // Close menu when Escape key is pressed
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && navMenu.classList.contains('is-open')) {
        navToggle.setAttribute('aria-expanded', 'false');
        navMenu.classList.remove('is-open');
        navToggle.focus();
      }
    });
  }

  // --------------------------------------------------------------------------
  // 2. Role-Selection Interactive Modal Dialog
  // --------------------------------------------------------------------------
  const roleModal = document.getElementById('roleModal');
  const modalBadge = document.getElementById('modalRoleBadge');
  const modalTitle = document.getElementById('modalRoleTitle');
  const modalBody = document.getElementById('modalRoleBody');
  const modalNotice = document.getElementById('modalRoleNotice');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const modalActionBtn = document.getElementById('modalActionBtn');

  // Role Configuration Data (Stage 1 Informational Previews)
  const roleData = {
    public: {
      badgeText: 'Citizen Login Preview',
      badgeClass: 'public',
      title: 'Public User Login (Stage 1 Notice)',
      description: 'Thank you for your interest in citizen reporting. In Stage 2, public users will be able to log in to submit road damage reports, attach geolocation and photos, and track resolution tickets in real time.',
      notice: 'Stage 1 Demonstration: Role authentication and complaint submission forms will be introduced in Stage 2.'
    },
    operator: {
      badgeText: 'Municipal Administration Login',
      badgeClass: 'operator',
      title: 'Municipal Operator Login (Stage 1 Notice)',
      description: 'The municipal operator console is scheduled for Stage 2. Once operational, municipal officers will log in to review incoming citizen reports, verify severity, prioritize road repairs, and dispatch work orders.',
      notice: 'Stage 1 Demonstration: Operator dashboard and triage workflows will be implemented in Stage 2.'
    },
    crew: {
      badgeText: 'Field Operations Login',
      badgeClass: 'crew',
      title: 'Maintenance Team Login (Stage 1 Notice)',
      description: 'The maintenance crew portal is scheduled for Stage 2. Field teams will log in to review assigned repair tickets, check equipment readiness (asphalt mixers, rollers, and pavers), and log completion status.',
      notice: 'Stage 1 Demonstration: Field team job tracking and resource checklists will be added in Stage 2.'
    },
    contact: {
      badgeText: 'Academic Demo Inquiry',
      badgeClass: 'operator',
      title: 'Municipal Partner & Academic Inquiry',
      description: 'Road Sync is an academic project designed for municipal road maintenance and resource allocation. Live telephone lines and municipal database connections are not active in this Stage 1 demonstration.',
      notice: 'System Note: Stage 1 focuses on brand identity, civic architecture, and public presentation.'
    }
  };

  // Function to open modal with specific role data
  function openRoleModal(roleKey) {
    const data = roleData[roleKey] || roleData.public;

    if (modalBadge) {
      modalBadge.textContent = data.badgeText;
      modalBadge.className = `modal-badge ${data.badgeClass}`;
    }
    if (modalTitle) modalTitle.textContent = data.title;
    if (modalBody) modalBody.textContent = data.description;
    if (modalNotice) modalNotice.textContent = data.notice;

    if (roleModal && typeof roleModal.showModal === 'function') {
      roleModal.showModal();
    }
  }

  // Bind role action buttons
  const roleButtons = document.querySelectorAll('[data-role-action]');
  roleButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      const roleKey = button.getAttribute('data-role-action');
      openRoleModal(roleKey);
    });
  });

  // Modal Close Handlers
  function closeModal() {
    if (roleModal && roleModal.open) {
      roleModal.close();
    }
  }

  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
  if (modalActionBtn) modalActionBtn.addEventListener('click', closeModal);

  // Close modal when clicking on backdrop
  if (roleModal) {
    roleModal.addEventListener('click', (e) => {
      if (e.target === roleModal) {
        closeModal();
      }
    });
  }

  // --------------------------------------------------------------------------
  // 3. Hero Aerial Image Fallback Detection
  // --------------------------------------------------------------------------
  const heroImage = document.getElementById('heroAerialImg');
  const heroStage = document.querySelector('.hero-image-stage');

  if (heroImage && heroStage) {
    heroImage.addEventListener('error', () => {
      heroStage.classList.add('fallback-active');
    });
  }
});
