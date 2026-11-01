/**
 * Road Sync — Dedicated Track Status Page Logic
 * 
 * Manages:
 * - Complaint selection dropdown and auto-selection from URL query parameter (?id=RS-2026-XXXX)
 * - Detailed complaint summary card with equipment and work order metadata
 * - 5-Stage milestone progression stepper aligned with Main.java RepairStatus
 * - Stage history timeline
 */

document.addEventListener('DOMContentLoaded', () => {

  const trackingSelect = document.getElementById('trackingSelect');
  const trackedItemWrapper = document.getElementById('trackedItemWrapper');
  const trackedSummaryCard = document.getElementById('trackedSummaryCard');
  const stepperTimeline = document.getElementById('stepperTimeline');
  const trackingEmptyState = document.getElementById('trackingEmptyState');

  function updateTrackingView() {
    const allComplaints = PublicComplaintStore.getAll();

    if (allComplaints.length === 0) {
      if (trackedItemWrapper) trackedItemWrapper.style.display = 'none';
      if (trackingSelect) trackingSelect.parentElement.style.display = 'none';
      if (trackingEmptyState) trackingEmptyState.style.display = 'flex';
      return;
    }

    if (trackedItemWrapper) trackedItemWrapper.style.display = 'block';
    if (trackingSelect) trackingSelect.parentElement.style.display = 'block';
    if (trackingEmptyState) trackingEmptyState.style.display = 'none';

    // Populate Dropdown Options
    if (trackingSelect) {
      const currentVal = trackingSelect.value;
      trackingSelect.innerHTML = allComplaints.map(c => `
        <option value="${c.id}">${c.refNo} — ${c.location} (${c.statusLabel || c.status})</option>
      `).join('');

      // Check URL query parameters for ?id=...
      const urlParams = new URLSearchParams(window.location.search);
      const targetId = urlParams.get('id') || currentVal;

      let selectedItem = allComplaints[0];
      if (targetId) {
        const matched = allComplaints.find(c => c.id === targetId || c.refNo === targetId);
        if (matched) {
          selectedItem = matched;
        }
      }
      trackingSelect.value = selectedItem.id;
      renderComplaintProgress(selectedItem);
    }
  }

  if (trackingSelect) {
    trackingSelect.addEventListener('change', (e) => {
      const allComplaints = PublicComplaintStore.getAll();
      const chosen = allComplaints.find(c => c.id === e.target.value);
      if (chosen) {
        renderComplaintProgress(chosen);
        const newUrl = new URL(window.location);
        newUrl.searchParams.set('id', chosen.id);
        window.history.replaceState({}, '', newUrl);
      }
    });
  }

  updateTrackingView();
  document.addEventListener('roadsync:synced', () => {
    updateTrackingView();
  });

  function renderComplaintProgress(item) {
    if (!item) return;

    // Render Overview Summary Header Card
    if (trackedSummaryCard) {
      trackedSummaryCard.innerHTML = `
        <div class="summary-top-row">
          <div>
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem;">
              <span class="complaint-ref-pill" style="font-size: 0.8125rem;">${PublicComplaintStore.escapeHtml(item.refNo)}</span>
              ${item.isDemo ? `
                <span class="demo-tag" title="Pre-seeded demonstration ticket">Demo Ticket • Layout Preview</span>
              ` : `
                <span class="user-live-tag">Active Citizen Report</span>
              `}
            </div>
            <h2 class="summary-location" style="margin-bottom: 0.25rem;">${PublicComplaintStore.escapeHtml(item.location)}</h2>
            <span class="summary-address" style="font-size: 0.84375rem; color: var(--color-text-muted);">
              ${PublicComplaintStore.escapeHtml(item.address || '')} • 📍 ${PublicComplaintStore.escapeHtml(item.coords || '')}
            </span>
          </div>

          <div class="summary-status-col">
            <span class="status-badge ${getStatusBadgeClass(item.status)} large">
              <span class="status-dot" aria-hidden="true"></span>
              <span>${PublicComplaintStore.escapeHtml(item.statusLabel || item.status)}</span>
            </span>
          </div>
        </div>

        <div class="summary-info-grid" style="margin-top: 1.25rem;">
          <div class="summary-info-cell">
            <span class="cell-label">Damage Type</span>
            <strong class="cell-val">${PublicComplaintStore.escapeHtml(item.type)}</strong>
          </div>
          <div class="summary-info-cell">
            <span class="cell-label">Severity Level</span>
            <strong class="cell-val">${PublicComplaintStore.escapeHtml(item.severity || 'Moderate')}</strong>
          </div>
          <div class="summary-info-cell">
            <span class="cell-label">Assigned Maintenance Team</span>
            <strong class="cell-val">${PublicComplaintStore.escapeHtml(item.assignedTeam || 'Triage In Progress')}</strong>
          </div>
          <div class="summary-info-cell">
            <span class="cell-label">Estimated Repair Time</span>
            <strong class="cell-val">${PublicComplaintStore.escapeHtml(item.estimatedTime || 'Pending Dispatch')}</strong>
          </div>
        </div>

        ${item.equipment && item.equipment.length > 0 ? `
          <div style="margin-top: 1rem; padding-top: 0.875rem; border-top: 1px dashed var(--color-border-subtle); display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <span style="font-size: 0.75rem; font-weight: 700; color: var(--color-text-muted); text-transform: uppercase;">Equipment Allocated:</span>
            ${item.equipment.map(eq => `
              <span class="meta-tag" style="background-color: var(--color-surface-alt); font-family: var(--font-mono); font-size: 0.75rem;">
                ⚙️ ${PublicComplaintStore.escapeHtml(eq)}
              </span>
            `).join('')}
          </div>
        ` : ''}

        ${item.photoPreview ? `
          <div class="tracked-photo-thumb-wrap" style="margin-top: 1rem; padding-top: 0.875rem; border-top: 1px solid var(--color-border-subtle);">
            <span class="thumb-label" style="display: block; font-size: 0.75rem; font-weight: 700; color: var(--color-text-muted); text-transform: uppercase; margin-bottom: 0.5rem;">Citizen Photo Evidence:</span>
            <img src="${item.photoPreview}" alt="Photo evidence for ${PublicComplaintStore.escapeHtml(item.refNo)}" class="tracked-thumb-img" style="max-height: 160px; border-radius: var(--border-radius-sm); border: 1px solid var(--color-border);">
          </div>
        ` : ''}
      `;
    }

    // Render 5-Stage Stepper Progression
    renderMilestoneStepper(item);
  }

  function renderMilestoneStepper(item) {
    if (!stepperTimeline) return;

    // Define standard 4-step municipal lifecycle (exactly 4 resident-facing stages)
    const STAGES = [
      {
        key: 'REPORTED',
        num: '01',
        title: 'Complaint Registered',
        desc: 'Citizen road hazard submission logged with Tamil Nadu GPS coordinates and damage details.'
      },
      {
        key: 'REVIEWED',
        num: '02',
        title: 'Municipal Review and Triage',
        desc: 'Municipal operator confirms damage classification, verifies jurisdiction, and evaluates risk.'
      },
      {
        key: 'ASSIGNED',
        num: '03',
        title: 'Team and Machinery Assigned',
        desc: 'Work order assigned to maintenance team with required heavy equipment (Mixers, Rollers, Pavers).'
      },
      {
        key: 'COMPLETED',
        num: '04',
        title: 'Repair Completed and Verified',
        desc: 'Bitumen compaction and asphalt repair completed. Verified and reopened to normal traffic.'
      }
    ];

    // Determine current progression index (0 to 3)
    let currentStageIndex = 0;
    if (item.status === 'PENDING') {
      currentStageIndex = (item.triaged || (item.priority !== null && item.priority !== undefined)) ? 1 : 0;
    } else if (item.status === 'PRIORITIZED') {
      currentStageIndex = 1;
    } else if (item.status === 'ASSIGNED' || item.status === 'IN_PROGRESS') {
      currentStageIndex = 2;
    } else if (item.status === 'COMPLETED') {
      currentStageIndex = 3;
    }

    stepperTimeline.innerHTML = STAGES.map((stage, idx) => {
      const isPast = idx < currentStageIndex || (idx === currentStageIndex && item.status === 'COMPLETED');
      const isCurrent = idx === currentStageIndex && item.status !== 'COMPLETED';

      let stateClass = 'is-future';
      if (isPast) stateClass = 'is-completed';
      if (isCurrent) stateClass = 'is-current';

      // Find matching history entry if exists
      const hist = item.history?.find(h => h.stage === stage.key) || null;

      return `
        <div class="timeline-step ${stateClass}">
          <div class="step-marker" aria-hidden="true">
            ${isPast ? `
              <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
              </svg>
            ` : `
              <span>${stage.num}</span>
            `}
          </div>

          <div class="step-content">
            <div class="step-title-row">
              <h4 class="step-title">${stage.title}</h4>
              ${hist ? `<span class="step-timestamp">${PublicComplaintStore.escapeHtml(hist.date)}</span>` : ''}
            </div>
            <p class="step-desc">${stage.desc}</p>
            ${hist?.note ? `
              <div class="step-audit-note">
                <span class="note-bullet">›</span>
                <span>${PublicComplaintStore.escapeHtml(hist.note)}</span>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
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

});
