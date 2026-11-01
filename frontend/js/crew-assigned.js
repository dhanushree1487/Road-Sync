/**
 * Road Sync — Maintenance Team Assigned Jobs Controller
 * 
 * Manages:
 * - Rendering work orders assigned strictly to the currently logged-in maintenance team
 * - Detailed job breakdown: Work-order ID, linked complaint ID, location, damage type, description, confirmed severity, priority score, equipment chips, advisory notes, and status
 * - Strict repair workflow transitions:
 *   1. ASSIGNED -> IN_PROGRESS (via "Start Repair Work")
 *   2. IN_PROGRESS -> COMPLETED (via "Record Repair Completion")
 * - Validation rules:
 *   - No cross-team updates (a team cannot update another team's job)
 *   - No skipping steps (cannot complete directly from ASSIGNED without starting)
 *   - No repeated completion
 * - Inspect Job Details modal dialog
 */

document.addEventListener('DOMContentLoaded', () => {

  if (typeof PublicComplaintStore === 'undefined') return;

  const currentTeam = (typeof getCurrentCrewTeam === 'function') 
    ? getCurrentCrewTeam() 
    : { teamId: 'T01', name: 'Team T01 — Chennai South Rapid Unit' };

  const crewAssignedList = document.getElementById('crewAssignedList');
  const crewAssignedEmpty = document.getElementById('crewAssignedEmpty');
  const filterAllBtn = document.getElementById('filterAllBtn');
  const filterAssignedBtn = document.getElementById('filterAssignedBtn');
  const filterProgressBtn = document.getElementById('filterProgressBtn');

  // Modal elements
  const detailModalBackdrop = document.getElementById('detailModalBackdrop');
  const closeDetailModalBtn = document.getElementById('closeDetailModalBtn');
  const dismissDetailModalBtn = document.getElementById('dismissDetailModalBtn');

  let currentFilter = 'ALL'; // 'ALL', 'ASSIGNED', 'IN_PROGRESS'

  function getMyActiveJobs() {
    const allJobs = PublicComplaintStore.getJobs();
    // Filter strictly for currently logged-in team
    const myJobs = allJobs.filter(j => 
      j.teamId === currentTeam.teamId || 
      (j.teamName && j.teamName.includes(currentTeam.teamId))
    );
    // Assigned jobs view focuses on active work orders (ASSIGNED or IN_PROGRESS)
    return myJobs.filter(j => j.status === 'ASSIGNED' || j.status === 'IN_PROGRESS');
  }

  function renderAssignedJobs() {
    if (!crewAssignedList) return;

    let jobs = getMyActiveJobs();

    if (currentFilter === 'ASSIGNED') {
      jobs = jobs.filter(j => j.status === 'ASSIGNED');
    } else if (currentFilter === 'IN_PROGRESS') {
      jobs = jobs.filter(j => j.status === 'IN_PROGRESS');
    }

    if (jobs.length === 0) {
      crewAssignedList.innerHTML = '';
      if (crewAssignedEmpty) crewAssignedEmpty.style.display = 'block';
      return;
    }

    if (crewAssignedEmpty) crewAssignedEmpty.style.display = 'none';

    crewAssignedList.innerHTML = jobs.map(j => {
      const isProgress = j.status === 'IN_PROGRESS';
      const statusBadgeClass = isProgress ? 'progress' : 'elevated';
      const statusLabel = isProgress ? 'In Progress' : 'Assigned (Pending Start)';

      // Cross-reference linked citizen complaint for damage description and coords
      const linkedComp = PublicComplaintStore.getById(j.complaintRef);
      const descriptionText = (linkedComp && linkedComp.description) 
        ? linkedComp.description 
        : 'Standard municipal corridor restoration and paving.';
      const coordsText = (linkedComp && linkedComp.coords) ? linkedComp.coords : 'Tamil Nadu Corridor';
      const severityDisplay = (linkedComp && linkedComp.severityLevel) 
        ? `Severity Level ${linkedComp.severityLevel}` 
        : (j.severity ? `Severity Level ${j.severity}` : 'Moderate Damage');
      const priorityDisplay = (linkedComp && linkedComp.priority !== null && linkedComp.priority !== undefined)
        ? `${linkedComp.priority} / 30`
        : (j.priority ? `${j.priority} / 30` : 'Pending Triage');

      let actionButton = '';
      if (j.status === 'ASSIGNED') {
        actionButton = `
          <button type="button" class="btn btn-secondary js-crew-action" data-action="START" data-id="${PublicComplaintStore.escapeHtml(j.jobId)}" style="background-color: var(--color-olive); color: #FFFFFF; font-weight: 700;">
            <span>▶ Start Repair Work</span>
          </button>
        `;
      } else if (j.status === 'IN_PROGRESS') {
        actionButton = `
          <button type="button" class="btn btn-primary js-crew-action" data-action="COMPLETE" data-id="${PublicComplaintStore.escapeHtml(j.jobId)}" style="background-color: #183B32; font-weight: 700;">
            <span>✓ Record Repair Completion</span>
          </button>
        `;
      }

      return `
        <article class="dash-card" style="margin-bottom: 1.5rem; border-left: 4px solid ${isProgress ? 'var(--color-hero-panel)' : 'var(--color-amber-dark)'};">
          
          <!-- Top Row: IDs, Status, Action Buttons -->
          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.75rem;">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.35rem;">
                <span class="complaint-ref-pill" style="font-size: 0.8125rem;">Work Order #${PublicComplaintStore.escapeHtml(j.jobId)}</span>
                <span class="priority-pill ${statusBadgeClass}">Status: ${statusLabel}</span>
                <span style="font-size: 0.75rem; color: var(--color-text-muted);">
                  Linked Citizen Complaint: <strong style="color: var(--color-charcoal);">${PublicComplaintStore.escapeHtml(j.complaintRef)}</strong>
                </span>
              </div>
              <h3 style="font-size: 1.25rem; font-weight: 800; color: var(--color-charcoal); margin: 0.25rem 0 0.15rem 0;">
                ${PublicComplaintStore.escapeHtml(j.location)}
              </h3>
              <div style="font-size: 0.8125rem; color: var(--color-text-muted);">
                📍 ${PublicComplaintStore.escapeHtml(coordsText)} • Dispatched: <strong>${PublicComplaintStore.escapeHtml(j.assignedTime || '')}</strong>
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
              <button type="button" class="btn btn-secondary btn-sm js-view-detail" data-id="${PublicComplaintStore.escapeHtml(j.jobId)}">
                Inspect Details
              </button>
              ${actionButton}
            </div>
          </div>

          <!-- Description & Severity Meta -->
          <div style="background-color: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--border-radius-sm); padding: 0.875rem 1rem; margin-bottom: 0.875rem;">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; margin-bottom: 0.5rem;">
              <div>
                <span style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--color-text-muted);">Damage Classification</span>
                <div style="font-weight: 700; color: var(--color-charcoal); font-size: 0.875rem;">${PublicComplaintStore.escapeHtml(j.damageType)}</div>
              </div>
              <div>
                <span style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--color-text-muted);">Confirmed Severity</span>
                <div style="font-weight: 700; color: var(--color-charcoal); font-size: 0.875rem;">${PublicComplaintStore.escapeHtml(severityDisplay)}</div>
              </div>
              <div>
                <span style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--color-text-muted);">Algorithmic Priority Score</span>
                <div style="font-weight: 700; color: var(--color-charcoal); font-size: 0.875rem;">${PublicComplaintStore.escapeHtml(priorityDisplay)}</div>
              </div>
              <div>
                <span style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--color-text-muted);">Work Window</span>
                <div style="font-weight: 700; color: var(--color-charcoal); font-size: 0.875rem;">${PublicComplaintStore.escapeHtml(j.estimatedTime || '60')} mins</div>
              </div>
            </div>
            <div style="font-size: 0.8125rem; color: var(--color-text-muted); border-top: 1px solid var(--color-border-subtle); padding-top: 0.5rem;">
              <strong>Citizen Description:</strong> ${PublicComplaintStore.escapeHtml(descriptionText)}
            </div>
          </div>

          <!-- Machinery Deployed & Advisory Notes -->
          <div style="background-color: var(--color-surface-alt); border: 1px solid var(--color-border); border-radius: var(--border-radius-sm); padding: 0.75rem 1rem;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap;">
              <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                <span style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--color-text-muted);">Assigned Machinery:</span>
                <div class="equipment-chip-list">
                  ${(j.equipment || []).map(eq => `<span class="equipment-chip">${PublicComplaintStore.escapeHtml(eq)}</span>`).join('')}
                </div>
              </div>
            </div>
            ${j.notes ? `
              <div style="margin-top: 0.5rem; font-size: 0.8125rem; color: var(--color-text-muted); border-top: 1px dashed var(--color-border); padding-top: 0.5rem;">
                <strong>Operator Traffic Advisory Notes:</strong> ${PublicComplaintStore.escapeHtml(j.notes)}
              </div>
            ` : ''}
          </div>

        </article>
      `;
    }).join('');

    // Attach Action Listeners
    attachActionHandlers();
  }

  function attachActionHandlers() {
    // 1. Field Workflow Actions (Start Repair & Record Completion)
    document.querySelectorAll('.js-crew-action').forEach(btn => {
      btn.addEventListener('click', () => {
        const jobId = btn.getAttribute('data-id');
        const action = btn.getAttribute('data-action');

        const job = PublicComplaintStore.getJobById(jobId);
        if (!job) {
          alert('Work order record not found.');
          return;
        }

        // Rule: Do not allow a team to update another team's assigned work
        const isAssignedToThisTeam = job.teamId === currentTeam.teamId || 
          (job.teamName && job.teamName.includes(currentTeam.teamId));
        if (!isAssignedToThisTeam) {
          alert("Permission Denied: You cannot update work orders assigned to another maintenance division.");
          return;
        }

        const origBtnText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span>Updating Backend...</span>';

        try {
          await PublicComplaintStore.updateJobStatusAsync(jobId, action);
          if (action === 'START') {
            showToast(`✓ Field repair on #${jobId} is now IN PROGRESS! Citizen and operator portals updated.`);
          } else {
            showToast(`✓ Work order #${jobId} marked COMPLETED & verified! Team released back to available.`);
          }
          renderAssignedJobs();
        } catch (err) {
          console.error('[Crew Action Error]', err);
          alert('Status Update Failed: ' + (err.message || 'Unable to update status on backend server.'));
          btn.disabled = false;
          btn.innerHTML = origBtnText;
        }
      });
    });

    // 2. Inspect Details Modal Handler
    document.querySelectorAll('.js-view-detail').forEach(btn => {
      btn.addEventListener('click', () => {
        const jobId = btn.getAttribute('data-id');
        openDetailModal(jobId);
      });
    });
  }

  // Inspect Modal Logic
  function openDetailModal(jobId) {
    const job = PublicComplaintStore.getJobById(jobId);
    if (!job) return;

    const linkedComp = PublicComplaintStore.getById(job.complaintRef);

    const titleEl = document.getElementById('modalJobTitle');
    const bodyEl = document.getElementById('modalJobDetailBody');

    if (titleEl) {
      titleEl.textContent = `Work Order #${job.jobId}`;
    }

    if (bodyEl) {
      bodyEl.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap;">
            <div>
              <span class="complaint-ref-pill" style="font-size: 0.8125rem;">Ref: ${PublicComplaintStore.escapeHtml(job.complaintRef)}</span>
              <span class="priority-pill ${job.status === 'IN_PROGRESS' ? 'progress' : 'elevated'}">Status: ${PublicComplaintStore.escapeHtml(job.status)}</span>
            </div>
            <span style="font-size: 0.8125rem; color: var(--color-text-muted);">
              Assigned: ${PublicComplaintStore.escapeHtml(job.assignedTime || 'Recently')}
            </span>
          </div>

          <div style="background-color: var(--color-surface); padding: 1rem; border: 1px solid var(--color-border); border-radius: var(--border-radius-sm);">
            <strong style="font-size: 1rem; color: var(--color-charcoal); display: block; margin-bottom: 0.25rem;">
              ${PublicComplaintStore.escapeHtml(job.location)}
            </strong>
            <div style="font-size: 0.8125rem; color: var(--color-text-muted);">
              📍 Coordinates: ${PublicComplaintStore.escapeHtml(linkedComp?.coords || 'Tamil Nadu GPS coordinates')}
            </div>
            <div style="font-size: 0.8125rem; color: var(--color-text-muted); margin-top: 0.5rem;">
              <strong>Citizen Description:</strong> ${PublicComplaintStore.escapeHtml(linkedComp?.description || 'N/A')}
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.75rem;">
            <div style="background-color: var(--color-surface-alt); padding: 0.75rem; border-radius: var(--border-radius-sm); border: 1px solid var(--color-border);">
              <span style="font-size: 0.71875rem; font-weight: 700; text-transform: uppercase; color: var(--color-text-muted);">Defect Classification</span>
              <div style="font-size: 0.875rem; font-weight: 700; color: var(--color-charcoal);">${PublicComplaintStore.escapeHtml(job.damageType)}</div>
            </div>
            <div style="background-color: var(--color-surface-alt); padding: 0.75rem; border-radius: var(--border-radius-sm); border: 1px solid var(--color-border);">
              <span style="font-size: 0.71875rem; font-weight: 700; text-transform: uppercase; color: var(--color-text-muted);">Severity Level</span>
              <div style="font-size: 0.875rem; font-weight: 700; color: var(--color-charcoal);">Level ${job.severity || 1}</div>
            </div>
            <div style="background-color: var(--color-surface-alt); padding: 0.75rem; border-radius: var(--border-radius-sm); border: 1px solid var(--color-border);">
              <span style="font-size: 0.71875rem; font-weight: 700; text-transform: uppercase; color: var(--color-text-muted);">Priority Score</span>
              <div style="font-size: 0.875rem; font-weight: 700; color: var(--color-charcoal);">${job.priority || 'N/A'}/30</div>
            </div>
            <div style="background-color: var(--color-surface-alt); padding: 0.75rem; border-radius: var(--border-radius-sm); border: 1px solid var(--color-border);">
              <span style="font-size: 0.71875rem; font-weight: 700; text-transform: uppercase; color: var(--color-text-muted);">Est. Work Window</span>
              <div style="font-size: 0.875rem; font-weight: 700; color: var(--color-charcoal);">${job.estimatedTime || 60} minutes</div>
            </div>
          </div>

          <div>
            <strong style="font-size: 0.8125rem; text-transform: uppercase; color: var(--color-text-muted); display: block; margin-bottom: 0.35rem;">
              Assigned Municipal Machinery
            </strong>
            <div class="equipment-chip-list">
              ${(job.equipment || []).map(eq => `<span class="equipment-chip">${PublicComplaintStore.escapeHtml(eq)}</span>`).join('')}
            </div>
          </div>

          ${job.notes ? `
            <div style="background-color: #FFF3CD; border: 1px solid #FFEEBA; border-radius: var(--border-radius-sm); padding: 0.75rem 1rem; color: #856404; font-size: 0.8125rem;">
              <strong>Traffic Advisory Notes:</strong> ${PublicComplaintStore.escapeHtml(job.notes)}
            </div>
          ` : ''}

        </div>
      `;
    }

    if (detailModalBackdrop) {
      detailModalBackdrop.classList.add('is-open');
    }
  }

  function closeDetailModal() {
    if (detailModalBackdrop) {
      detailModalBackdrop.classList.remove('is-open');
    }
  }

  if (closeDetailModalBtn) closeDetailModalBtn.addEventListener('click', closeDetailModal);
  if (dismissDetailModalBtn) dismissDetailModalBtn.addEventListener('click', closeDetailModal);
  if (detailModalBackdrop) {
    detailModalBackdrop.addEventListener('click', (e) => {
      if (e.target === detailModalBackdrop) closeDetailModal();
    });
  }

  // Filter Buttons
  if (filterAllBtn) {
    filterAllBtn.addEventListener('click', () => {
      currentFilter = 'ALL';
      updateFilterButtons();
      renderAssignedJobs();
    });
  }
  if (filterAssignedBtn) {
    filterAssignedBtn.addEventListener('click', () => {
      currentFilter = 'ASSIGNED';
      updateFilterButtons();
      renderAssignedJobs();
    });
  }
  if (filterProgressBtn) {
    filterProgressBtn.addEventListener('click', () => {
      currentFilter = 'IN_PROGRESS';
      updateFilterButtons();
      renderAssignedJobs();
    });
  }

  function updateFilterButtons() {
    [filterAllBtn, filterAssignedBtn, filterProgressBtn].forEach(btn => {
      if (!btn) return;
      btn.classList.remove('btn-primary');
      btn.classList.add('btn-secondary');
    });
    if (currentFilter === 'ALL' && filterAllBtn) {
      filterAllBtn.classList.add('btn-primary');
      filterAllBtn.classList.remove('btn-secondary');
    } else if (currentFilter === 'ASSIGNED' && filterAssignedBtn) {
      filterAssignedBtn.classList.add('btn-primary');
      filterAssignedBtn.classList.remove('btn-secondary');
    } else if (currentFilter === 'IN_PROGRESS' && filterProgressBtn) {
      filterProgressBtn.classList.add('btn-primary');
      filterProgressBtn.classList.remove('btn-secondary');
    }
  }

  function showToast(msg) {
    const toast = document.createElement('div');
    toast.style.cssText = 'position: fixed; bottom: 24px; right: 24px; background-color: #183B32; color: #FFFFFF; padding: 14px 20px; border-radius: 8px; box-shadow: 0 6px 16px rgba(0,0,0,0.25); z-index: 3000; font-size: 0.875rem; font-weight: 600; display: flex; align-items: center; gap: 10px;';
    toast.innerHTML = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  // Initial render & sync listener
  renderAssignedJobs();
  document.addEventListener('roadsync:synced', () => {
    renderAssignedJobs();
  });

});
