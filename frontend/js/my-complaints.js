/**
 * Road Sync — My Complaints Page Logic
 * 
 * Manages:
 * - Loading and rendering citizen complaints from PublicComplaintStore
 * - Status filters: All, Ongoing (Assigned/In Progress), Completed, Pending
 * - Dynamic count badges
 * - Clear empty state when no complaints exist or match
 * - Direct links to Track Status for individual complaints
 */

document.addEventListener('DOMContentLoaded', () => {

  const listContainer = document.getElementById('complaintsListContainer');
  const emptyStateEl = document.getElementById('complaintsEmptyState');
  const emptyTitleText = document.getElementById('emptyTitleText');
  const emptyDescText = document.getElementById('emptyDescText');

  const countAllEl = document.getElementById('countAll');
  const countOngoingEl = document.getElementById('countOngoing');
  const countCompletedEl = document.getElementById('countCompleted');
  const countPendingEl = document.getElementById('countPending');

  const filterButtons = document.querySelectorAll('.filter-tab-pill');

  let activeFilter = 'ALL';

  function updateCounts() {
    const all = PublicComplaintStore.getAll();
    const stats = PublicComplaintStore.getStats();

    if (countAllEl) countAllEl.textContent = stats.total;
    if (countOngoingEl) countOngoingEl.textContent = stats.ongoing;
    if (countCompletedEl) countCompletedEl.textContent = stats.completed;
    if (countPendingEl) countPendingEl.textContent = stats.pending;
  }

  function renderList(filter) {
    activeFilter = filter;

    // Update active tab UI
    filterButtons.forEach(btn => {
      const isTarget = btn.getAttribute('data-filter') === filter;
      btn.classList.toggle('active', isTarget);
      btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    });

    const all = PublicComplaintStore.getAll();
    let filtered = all;

    if (filter === 'PENDING') {
      filtered = all.filter(c => c.status === 'PENDING' || c.status === 'PRIORITIZED');
    } else if (filter === 'ONGOING') {
      filtered = all.filter(c => c.status === 'ASSIGNED' || c.status === 'IN_PROGRESS');
    } else if (filter === 'COMPLETED') {
      filtered = all.filter(c => c.status === 'COMPLETED');
    }

    if (filtered.length === 0) {
      if (listContainer) listContainer.innerHTML = '';
      if (emptyStateEl) {
        emptyStateEl.style.display = 'flex';
        if (all.length === 0) {
          if (emptyTitleText) emptyTitleText.textContent = 'No Complaints Submitted Yet';
          if (emptyDescText) emptyDescText.textContent = 'You have not submitted any road damage complaints in this browser session. Pin your first hazard to alert municipal crews.';
        } else {
          if (emptyTitleText) emptyTitleText.textContent = `No ${filter.toLowerCase()} Complaints`;
          if (emptyDescText) emptyDescText.textContent = `There are currently no complaints in the "${filter}" category.`;
        }
      }
      return;
    }

    if (emptyStateEl) emptyStateEl.style.display = 'none';

    if (listContainer) {
      listContainer.innerHTML = filtered.map(c => `
        <article class="complaint-card ${c.isDemo ? 'is-demo-record' : 'is-user-submission'}" data-complaint-id="${c.id}">
          <div class="complaint-card-top">
            <div class="complaint-id-group">
              <span class="complaint-ref-pill">${PublicComplaintStore.escapeHtml(c.refNo)}</span>
              ${c.isDemo ? `
                <span class="demo-tag" title="Pre-seeded record for layout demonstration">Demo Record • For Layout Demonstration</span>
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
              ${c.address ? `
                <p class="complaint-address-sub" style="font-size: 0.8125rem; color: var(--color-text-muted); margin-bottom: 0.5rem;">
                  ${PublicComplaintStore.escapeHtml(c.address)}
                </p>
              ` : ''}
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
              ${c.coords ? `
                <span class="meta-tag" style="font-family: var(--font-mono);">
                  📍 ${PublicComplaintStore.escapeHtml(c.coords)}
                </span>
              ` : ''}
            </div>

            ${c.progressNote ? `
              <div class="complaint-progress-snippet">
                <span class="snippet-label">Latest Municipal Update:</span>
                <span class="snippet-text">${PublicComplaintStore.escapeHtml(c.progressNote)}</span>
              </div>
            ` : ''}
          </div>

          <div class="complaint-card-footer">
            <span class="footer-timestamp">Recorded on Road Sync Infrastructure Network</span>
            <a href="track-status.html?id=${encodeURIComponent(c.id)}" class="btn btn-secondary btn-sm">
              <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/>
              </svg>
              <span>Track Progress & Milestones</span>
            </a>
          </div>
        </article>
      `).join('');
    }
  }

  function getStatusBadgeClass(status) {
    switch (status) {
      case 'PENDING': return 'status-amber';
      case 'PRIORITIZED': return 'status-olive';
      case 'ASSIGNED': return 'status-olive';
      case 'IN_PROGRESS': return 'status-green';
      case 'COMPLETED': return 'status-charcoal';
      default: return 'status-amber';
    }
  }

  // Bind filter buttons
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.getAttribute('data-filter') || 'ALL';
      renderList(filter);
    });
  });

  // Initial load & sync listener
  updateCounts();
  renderList('ALL');
  document.addEventListener('roadsync:synced', () => {
    updateCounts();
    renderList('ALL');
  });

});
