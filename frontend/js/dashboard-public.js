/**
 * Road Sync — Dedicated Public User Dashboard Logic
 * 
 * Computes:
 * - Summary values from available session complaint data (Total, Ongoing, Completed)
 * - Empty state if 0 complaints exist
 * - Personalized welcome heading
 * - Submission confirmation alert when returning from Report Hazard
 * - Compact recent complaints list linking to Track Status & My Complaints
 */

document.addEventListener('DOMContentLoaded', () => {

  // 1. Personalize Welcome Heading
  try {
    const rawUser = sessionStorage.getItem('roadsync_logged_user');
    if (rawUser) {
      const user = JSON.parse(rawUser);
      if (user && user.displayName) {
        const firstName = user.displayName.split(' ')[0];
        const welcomeHeading = document.getElementById('welcomeHeading');
        if (welcomeHeading) {
          welcomeHeading.textContent = `Welcome back, ${firstName}`;
        }
      }
    }
  } catch (e) {
    console.warn('User session read error:', e);
  }

  // 2. Compute Summary Metrics & Recent List
  function renderDashboardMetricsAndList() {
    const stats = PublicComplaintStore.getStats();

    const statTotalCount = document.getElementById('statTotalCount');
    const statOngoingCount = document.getElementById('statOngoingCount');
    const statCompletedCount = document.getElementById('statCompletedCount');

    if (statTotalCount) statTotalCount.textContent = stats.total;
    if (statOngoingCount) statOngoingCount.textContent = stats.ongoing;
    if (statCompletedCount) statCompletedCount.textContent = stats.completed;

    // Render Compact Recent Complaints (Max 3 latest)
    const allComplaints = PublicComplaintStore.getAll();
    const recentListEl = document.getElementById('recentComplaintsList');
    const emptyStateEl = document.getElementById('recentEmptyState');

    if (allComplaints.length === 0) {
      if (recentListEl) recentListEl.innerHTML = '';
      if (emptyStateEl) emptyStateEl.style.display = 'flex';
    } else {
      if (emptyStateEl) emptyStateEl.style.display = 'none';

      if (recentListEl) {
        const recentItems = allComplaints.slice(0, 3);
        recentListEl.innerHTML = recentItems.map(c => `
          <article class="complaint-card ${c.isDemo ? 'is-demo-record' : 'is-user-submission'}" data-complaint-id="${c.id}">
            <div class="complaint-card-top">
              <div class="complaint-id-group">
                <span class="complaint-ref-pill">${PublicComplaintStore.escapeHtml(c.refNo)}</span>
                ${c.isDemo ? `
                  <span class="demo-tag" title="Pre-seeded record to demonstrate layout & tracking">Demo Record • For Layout Demonstration</span>
                ` : `
                  <span class="user-live-tag">Active Citizen Submission</span>
                `}
              </div>
              
              <div class="complaint-status-wrap">
                <span class="status-badge ${getStatusBadgeClass(c.status)}">
                  <span class="status-dot" aria-hidden="true"></span>
                  <span>${PublicComplaintStore.escapeHtml(c.statusLabel || c.status)}</span>
                </span>
              </div>
            </div>

            <div class="complaint-card-body">
              <div class="complaint-main-meta">
                <h3 class="complaint-loc-title">
                  <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true">
                    <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/>
                  </svg>
                  <span>${PublicComplaintStore.escapeHtml(c.location)}</span>
                </h3>
                <p class="complaint-desc-text">${PublicComplaintStore.escapeHtml(c.description)}</p>
              </div>

              <div class="complaint-meta-badges">
                <span class="meta-tag">
                  <strong>Type:</strong> ${PublicComplaintStore.escapeHtml(c.type)}
                </span>
                <span class="meta-tag">
                  <strong>Severity:</strong> ${PublicComplaintStore.escapeHtml(c.severity || 'Moderate')}
                </span>
                <span class="meta-tag">
                  <strong>Reported:</strong> ${PublicComplaintStore.escapeHtml(c.date)}
                </span>
              </div>

              ${c.progressNote ? `
                <div class="complaint-progress-snippet">
                  <span class="snippet-label">Latest Municipal Update:</span>
                  <span class="snippet-text">${PublicComplaintStore.escapeHtml(c.progressNote)}</span>
                </div>
              ` : ''}
            </div>

            <div class="complaint-card-footer">
              <span class="footer-timestamp">Tamil Nadu Road Infrastructure Network</span>
              <a href="track-status.html?id=${encodeURIComponent(c.id)}" class="btn btn-secondary btn-sm">
                <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/>
                </svg>
                <span>Track Status</span>
              </a>
            </div>
          </article>
        `).join('');
      }
    }
  }

  // 3. Check for Post-Submission Redirect (Requirement 8)
  const urlParams = new URLSearchParams(window.location.search);
  const submittedRef = urlParams.get('submitted');
  const toastRaw = sessionStorage.getItem('roadsync_toast_message');
  let toastData = null;

  if (toastRaw) {
    try {
      toastData = JSON.parse(toastRaw);
    } catch (e) {}
    sessionStorage.removeItem('roadsync_toast_message');
  }

  if (submittedRef || toastData) {
    const refNo = submittedRef || toastData?.refNo;
    const loc = toastData?.location || 'the pinned road location';
    const alertBox = document.getElementById('dashboardSubmittedAlert');

    if (alertBox) {
      const alertTitle = document.getElementById('dashboardSubmittedTitle');
      const alertBody = document.getElementById('dashboardSubmittedBody');
      const btnTrack = document.getElementById('btnTrackSubmittedFromDash');

      if (alertTitle) alertTitle.textContent = `Complaint #${refNo} Registered Successfully`;
      if (alertBody) {
        alertBody.innerHTML = `Your road hazard report for <strong>${PublicComplaintStore.escapeHtml(loc)}</strong> has been recorded in this browser session. Current status is <code>PENDING</code>.`;
      }
      if (btnTrack) {
        btnTrack.href = `track-status.html?id=${encodeURIComponent(refNo)}`;
      }

      alertBox.style.display = 'flex';
      alertBox.scrollIntoView({ behavior: 'smooth', block: 'start' });

      // Clean query parameter from URL without page reload
      const cleanUrl = new URL(window.location);
      cleanUrl.searchParams.delete('submitted');
      window.history.replaceState({}, '', cleanUrl);
    }
  }

  const dismissToastBtn = document.getElementById('dismissDashboardToastBtn');
  if (dismissToastBtn) {
    dismissToastBtn.addEventListener('click', () => {
      const alertBox = document.getElementById('dashboardSubmittedAlert');
      if (alertBox) alertBox.style.display = 'none';
    });
  }

  // Initial render & sync listener
  renderDashboardMetricsAndList();
  document.addEventListener('roadsync:synced', () => {
    renderDashboardMetricsAndList();
  });

  function getStatusBadgeClass(status) {
    switch (status) {
      case 'PENDING': return 'status-amber';
      case 'ASSIGNED': return 'status-olive';
      case 'IN_PROGRESS': return 'status-green';
      case 'COMPLETED': return 'status-charcoal';
      default: return 'status-amber';
    }
  }

});
