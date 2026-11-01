/**
 * Road Sync — Stage 2: Authentication & Dedicated Role Portals
 * Client-side validation, dedicated role display, show/hide password, and development-mode messaging.
 * Architecture Note: Preserves future integration boundary with Main.java backend.
 */

document.addEventListener('DOMContentLoaded', () => {

  // --------------------------------------------------------------------------
  // TEMPORARY DEMO AUTHENTICATION CONFIGURATION (LOCAL DEVELOPMENT ONLY)
  // Aligned with Main.java OOP sample users (public, operator, team01)
  // NOTE: For local testing prior to Stage 4+ backend API integration.
  // Real authentication will connect to Java backend endpoints in later stages.
  // --------------------------------------------------------------------------
  const DEMO_ACCOUNTS = {
    public: {
      role: 'public',
      validUsernames: ['public', 'resident_user', 'priya_ward4', 'citizen@example.com'],
      validPasswords: ['1234', 'password123'],
      displayName: 'Priya Sharma (Citizen)',
      redirectUrl: 'users/dashboard-public.html'
    },
    operator: {
      role: 'operator',
      validUsernames: ['operator', 'op_central', 'operator@citygov.org'],
      validPasswords: ['1234', 'password123'],
      displayName: 'Municipal Operator (Central Triage)',
      redirectUrl: 'municipal-operator/dashboard-operator.html'
    },
    crew: {
      role: 'crew',
      validUsernames: ['team01', 'team02', 'team03', 'crew_lead', 'team_asphalt_01'],
      validPasswords: ['1234', 'password123'],
      displayName: 'Maintenance Team T01 (Field Unit)',
      redirectUrl: 'teams/dashboard-crew.html'
    }
  };

  // --------------------------------------------------------------------------
  // 1. Dedicated Role State & DOM Elements
  // --------------------------------------------------------------------------
  const rolePanels = {
    public: document.getElementById('panelPublic'),
    operator: document.getElementById('panelOperator'),
    crew: document.getElementById('panelCrew')
  };

  const brandRoleText = document.getElementById('brandRoleText');

  const roleMeta = {
    public: {
      callout: 'Dedicated Citizen Reporting Portal',
      title: 'Road Sync — Public User Portal'
    },
    operator: {
      callout: 'Dedicated Municipal Operations Console',
      title: 'Road Sync — Municipal Operator Portal'
    },
    crew: {
      callout: 'Dedicated Field Maintenance Portal',
      title: 'Road Sync — Maintenance Team Portal'
    }
  };

  const publicModeTabs = document.querySelectorAll('.public-mode-tab');
  const publicForms = {
    login: document.getElementById('formPublicLogin'),
    register: document.getElementById('formPublicRegister')
  };

  const devFeedbackBox = document.getElementById('devFeedbackBox');
  const devFeedbackMeta = document.getElementById('devFeedbackMeta');
  const devFeedbackClose = document.getElementById('devFeedbackClose');

  // Determine dedicated role from URL query string (?role=public|operator|crew)
  const urlParams = new URLSearchParams(window.location.search);
  const initialRoleParam = urlParams.get('role');
  const currentRole = ['public', 'operator', 'crew'].includes(initialRoleParam) ? initialRoleParam : 'public';
  let currentPublicMode = 'login'; // 'login' or 'register'

  // --------------------------------------------------------------------------
  // 2. Dedicated Role Initialization (No Role Tabs on Individual Pages)
  // --------------------------------------------------------------------------
  function applyDedicatedRole(roleKey) {
    if (!rolePanels[roleKey]) return;

    // Show only the selected role panel; keep all others hidden
    Object.keys(rolePanels).forEach(key => {
      if (rolePanels[key]) {
        rolePanels[key].style.display = key === roleKey ? 'block' : 'none';
      }
    });

    // Update left branding panel indicator and document title
    if (brandRoleText && roleMeta[roleKey]) {
      brandRoleText.textContent = roleMeta[roleKey].callout;
    }
    if (roleMeta[roleKey]) {
      document.title = roleMeta[roleKey].title;
    }

    // Reset feedback and validation errors
    clearAllValidationErrors();
    hideDevFeedback();
  }

  // --------------------------------------------------------------------------
  // 3. Quick-Fill Demo Credentials Buttons (Local Testing Support)
  // --------------------------------------------------------------------------
  const fillDemoButtons = document.querySelectorAll('.fill-demo-btn');
  fillDemoButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const role = btn.getAttribute('data-fill-role');
      if (role === 'public') {
        const u = document.getElementById('publicLoginUser');
        const p = document.getElementById('publicLoginPass');
        if (u) u.value = 'public';
        if (p) p.value = '1234';
      } else if (role === 'operator') {
        const u = document.getElementById('operatorLoginUser');
        const p = document.getElementById('operatorLoginPass');
        if (u) u.value = 'operator';
        if (p) p.value = '1234';
      } else if (role === 'crew') {
        const u = document.getElementById('crewLoginUser');
        const p = document.getElementById('crewLoginPass');
        if (u) u.value = 'team01';
        if (p) p.value = '1234';
      }
      clearAllValidationErrors();
    });
  });

  // --------------------------------------------------------------------------
  // 4. Public User Mode Switch (Sign In vs Register - Public User Only)
  // --------------------------------------------------------------------------
  function setPublicMode(mode) {
    currentPublicMode = mode;
    publicModeTabs.forEach(tab => {
      const isTarget = tab.getAttribute('data-public-mode') === mode;
      tab.classList.toggle('active', isTarget);
      tab.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    });

    if (publicForms.login) {
      publicForms.login.style.display = mode === 'login' ? 'flex' : 'none';
    }
    if (publicForms.register) {
      publicForms.register.style.display = mode === 'register' ? 'flex' : 'none';
    }

    clearAllValidationErrors();
    hideDevFeedback();
  }

  publicModeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const mode = tab.getAttribute('data-public-mode');
      setPublicMode(mode);
    });
  });

  // Toggle links (e.g., "Don't have an account? Sign up")
  const switchLinks = document.querySelectorAll('[data-switch-to]');
  switchLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetMode = link.getAttribute('data-switch-to');
      setPublicMode(targetMode);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Show / Hide Password Controls
  // --------------------------------------------------------------------------
  const eyeIconSvg = `
    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>`;
  
  const eyeOffIconSvg = `
    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
      <line x1="1" y1="1" x2="23" y2="23"></line>
    </svg>`;

  const passwordToggleButtons = document.querySelectorAll('.password-toggle-btn');
  passwordToggleButtons.forEach(btn => {
    btn.innerHTML = eyeIconSvg;
    btn.addEventListener('click', () => {
      const targetInputId = btn.getAttribute('data-target-input');
      const input = document.getElementById(targetInputId);
      if (!input) return;

      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      btn.innerHTML = isPassword ? eyeOffIconSvg : eyeIconSvg;
      btn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
    });
  });

  // --------------------------------------------------------------------------
  // 6. Validation Utilities
  // --------------------------------------------------------------------------
  function setFieldError(field, errorId, message) {
    if (!field) return;
    field.classList.add('is-invalid');
    field.setAttribute('aria-invalid', 'true');
    const errorEl = document.getElementById(errorId);
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add('is-visible');
    }
  }

  function clearAllValidationErrors() {
    document.querySelectorAll('.form-input').forEach(input => {
      input.classList.remove('is-invalid');
      input.removeAttribute('aria-invalid');
    });
    document.querySelectorAll('.field-error-text').forEach(err => {
      err.textContent = '';
      err.classList.remove('is-visible');
    });
  }

  // Real-time clearance of error styling on input
  document.querySelectorAll('.form-input').forEach(input => {
    input.addEventListener('input', () => {
      input.classList.remove('is-invalid');
      input.removeAttribute('aria-invalid');
      const errorEl = input.closest('.form-group')?.querySelector('.field-error-text');
      if (errorEl) {
        errorEl.textContent = '';
        errorEl.classList.remove('is-visible');
      }
    });
  });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // --------------------------------------------------------------------------
  // 7. Development Mode Feedback Display
  // --------------------------------------------------------------------------
  function showDevFeedback(title, roleName, details, redirectUrl = null) {
    if (!devFeedbackBox) return;
    const headerEl = devFeedbackBox.querySelector('.dev-feedback-header span');
    if (headerEl) headerEl.textContent = title;

    if (devFeedbackMeta) {
      let metaHtml = `
        <strong>Role:</strong> ${escapeHtml(roleName)} &nbsp;|&nbsp; 
        <strong>Identifier:</strong> ${escapeHtml(details.identifier || 'N/A')} &nbsp;|&nbsp; 
        <strong>Action:</strong> ${escapeHtml(details.action || 'Login')}
      `;

      if (redirectUrl) {
        metaHtml += `
          <div style="margin-top: 0.75rem; padding-top: 0.65rem; border-top: 1px dashed rgba(24, 59, 50, 0.2); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
            <span>Demo authentication verified. Redirecting to dashboard...</span>
            <a href="${escapeHtml(redirectUrl)}" class="btn btn-primary btn-sm" id="btnGoToDashboard" style="text-decoration: none;">
              Open Dashboard &rarr;
            </a>
          </div>
        `;
      }

      devFeedbackMeta.innerHTML = metaHtml;
    }

    devFeedbackBox.classList.add('is-visible');
    devFeedbackBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    if (redirectUrl) {
      setTimeout(() => {
        window.location.href = redirectUrl;
      }, 1200);
    }
  }

  function hideDevFeedback() {
    if (devFeedbackBox) {
      devFeedbackBox.classList.remove('is-visible');
    }
  }

  if (devFeedbackClose) {
    devFeedbackClose.addEventListener('click', hideDevFeedback);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[m]);
  }

  // --------------------------------------------------------------------------
  // 8. Form Handlers with Temporary Demo Authentication
  // --------------------------------------------------------------------------

  // A. Public User Login
  const formPublicLogin = document.getElementById('formPublicLogin');
  if (formPublicLogin) {
    formPublicLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAllValidationErrors();

      const userField = document.getElementById('publicLoginUser');
      const passField = document.getElementById('publicLoginPass');
      const u = userField.value.trim();
      const p = passField.value;
      let isValid = true;

      if (!u) {
        setFieldError(userField, 'errPublicLoginUser', 'Username or email address is required.');
        isValid = false;
      }

      if (!p) {
        setFieldError(passField, 'errPublicLoginPass', 'Password is required.');
        isValid = false;
      }

      if (isValid) {
        try {
          const auth = (typeof ApiClient !== 'undefined') 
            ? await ApiClient.login(u, p)
            : { role: 'public', username: u, displayName: 'Priya Sharma (Citizen)' };

          if (auth.role !== 'public') {
            setFieldError(userField, 'errPublicLoginUser', `This account belongs to ${auth.role}. Please use the dedicated portal login.`);
            return;
          }

          showDevFeedback(
            'Authentication Verified (Public User)',
            'Public User',
            { identifier: u, action: 'Citizen Portal Access' },
            'users/dashboard-public.html'
          );
        } catch (err) {
          setFieldError(userField, 'errPublicLoginUser', err.message || 'Authentication failed. Please verify credentials.');
        }
      }
    });
  }

  // B. Public User Registration (Local Demo)
  const formPublicRegister = document.getElementById('formPublicRegister');
  if (formPublicRegister) {
    formPublicRegister.addEventListener('submit', (e) => {
      e.preventDefault();
      clearAllValidationErrors();

      const nameField = document.getElementById('publicRegName');
      const emailField = document.getElementById('publicRegEmail');
      const userField = document.getElementById('publicRegUser');
      const passField = document.getElementById('publicRegPass');
      const confirmField = document.getElementById('publicRegConfirm');
      let isValid = true;

      if (!nameField.value.trim()) {
        setFieldError(nameField, 'errPublicRegName', 'Full name is required.');
        isValid = false;
      } else if (nameField.value.trim().length < 2) {
        setFieldError(nameField, 'errPublicRegName', 'Full name must be at least 2 characters.');
        isValid = false;
      }

      if (!emailField.value.trim()) {
        setFieldError(emailField, 'errPublicRegEmail', 'Email address is required.');
        isValid = false;
      } else if (!emailRegex.test(emailField.value.trim())) {
        setFieldError(emailField, 'errPublicRegEmail', 'Please enter a valid email address.');
        isValid = false;
      }

      if (!userField.value.trim()) {
        setFieldError(userField, 'errPublicRegUser', 'Username is required.');
        isValid = false;
      } else if (userField.value.trim().length < 3) {
        setFieldError(userField, 'errPublicRegUser', 'Username must be at least 3 characters.');
        isValid = false;
      }

      if (!passField.value) {
        setFieldError(passField, 'errPublicRegPass', 'Password is required.');
        isValid = false;
      } else if (passField.value.length < 4) {
        setFieldError(passField, 'errPublicRegPass', 'Password must be at least 4 characters.');
        isValid = false;
      }

      if (!confirmField.value) {
        setFieldError(confirmField, 'errPublicRegConfirm', 'Please confirm your password.');
        isValid = false;
      } else if (confirmField.value !== passField.value) {
        setFieldError(confirmField, 'errPublicRegConfirm', 'Passwords do not match. Please re-enter.');
        isValid = false;
      }

      if (isValid) {
        // Save registered user to session for demonstration
        sessionStorage.setItem('roadsync_logged_user', JSON.stringify({
          role: 'public',
          username: userField.value.trim(),
          displayName: nameField.value.trim(),
          email: emailField.value.trim(),
          isDemo: true
        }));

        showDevFeedback(
          'Registration Verified (Public User Demo)',
          'Public User',
          { identifier: emailField.value.trim() + ' (' + userField.value.trim() + ')', action: 'Account Provisioning' },
          'users/dashboard-public.html'
        );
      }
    });
  }

  // C. Municipal Operator Login
  const formOperatorLogin = document.getElementById('formOperatorLogin');
  if (formOperatorLogin) {
    formOperatorLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAllValidationErrors();

      const userField = document.getElementById('operatorLoginUser');
      const passField = document.getElementById('operatorLoginPass');
      const u = userField.value.trim();
      const p = passField.value;
      let isValid = true;

      if (!u) {
        setFieldError(userField, 'errOperatorLoginUser', 'Operator username or employee ID is required.');
        isValid = false;
      }

      if (!p) {
        setFieldError(passField, 'errOperatorLoginPass', 'Operator password is required.');
        isValid = false;
      }

      if (isValid) {
        try {
          const auth = (typeof ApiClient !== 'undefined')
            ? await ApiClient.login(u, p)
            : { role: 'operator', username: u, displayName: 'Municipal Operator' };

          if (auth.role !== 'operator') {
            setFieldError(userField, 'errOperatorLoginUser', `This account belongs to ${auth.role}. Please use the dedicated portal login.`);
            return;
          }

          showDevFeedback(
            'Authentication Verified (Municipal Operator)',
            'Municipal Operator',
            { identifier: u, action: 'Administrative Console Access' },
            'municipal-operator/dashboard-operator.html'
          );
        } catch (err) {
          setFieldError(userField, 'errOperatorLoginUser', err.message || 'Authentication failed. Please verify operator credentials.');
        }
      }
    });
  }

  // D. Maintenance Team Login
  const formCrewLogin = document.getElementById('formCrewLogin');
  if (formCrewLogin) {
    formCrewLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAllValidationErrors();

      const userField = document.getElementById('crewLoginUser');
      const passField = document.getElementById('crewLoginPass');
      const u = userField.value.trim();
      const p = passField.value;
      let isValid = true;

      if (!u) {
        setFieldError(userField, 'errCrewLoginUser', 'Maintenance Crew ID or username is required.');
        isValid = false;
      }

      if (!p) {
        setFieldError(passField, 'errCrewLoginPass', 'Team access password is required.');
        isValid = false;
      }

      if (isValid) {
        try {
          const auth = (typeof ApiClient !== 'undefined')
            ? await ApiClient.login(u, p)
            : { role: 'crew', username: u, teamId: 'T01', displayName: 'Maintenance Team' };

          if (auth.role !== 'crew') {
            setFieldError(userField, 'errCrewLoginUser', `This account belongs to ${auth.role}. Please use the dedicated portal login.`);
            return;
          }

          showDevFeedback(
            'Authentication Verified (Maintenance Team)',
            'Maintenance Team',
            { identifier: u, action: 'Field Operations Login' },
            'teams/dashboard-crew.html'
          );
        } catch (err) {
          setFieldError(userField, 'errCrewLoginUser', err.message || 'Authentication failed. Please verify crew credentials.');
        }
      }
    });
  }

  // --------------------------------------------------------------------------
  // 9. Apply initial dedicated role on page load
  // --------------------------------------------------------------------------
  applyDedicatedRole(currentRole);
});
