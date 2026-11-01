/**
 * Road Sync — Maintenance Team Completed Jobs Controller
 * 
 * Manages:
 * - Rendering work orders completed strictly by the currently logged-in maintenance team
 * - Displays: Complaint ID, location, equipment deployed, completion status, and completion time
 * - Read-only inspection of completed roadwork archive
 * - Strictly prevents repeated completion or invalid workflow actions
 */

document.addEventListener('DOMContentLoaded', () => {

  if (typeof PublicComplaintStore === 'undefined') return;

  const currentTeam = (typeof getCurrentCrewTeam === 'function') 
    ? getCurrentCrewTeam() 
    : { teamId: 'T01', name: 'Team T01 — Chennai South Rapid Unit' };

  const crewCompletedList = document.getElementById('crewCompletedList');
  const crewCompletedEmpty = document.getElementById('crewCompletedEmpty');
  const completedCountBadge = document.getElementById('completedCountBadge');

  // Modal elements
  const detailModalBackdrop = document.getElementById('detailModalBackdrop');
  const closeDetailModalBtn = document.getElementById('closeDetailModalBtn');
  const dismissDetailModalBtn = document.getElementById('dismissDetailModalBtn');

  function renderCompletedJobs() {
    if (!crewCompletedList) return;

    const allJobs = PublicComplaintStore.getJobs();
    // Filter strictly for currently logged-in team and COMPLETED status
    const completedJobs = allJobs.filter(j => 
      (j.teamId === currentTeam.teamId || (j.teamName && j.teamName.includes(currentTeam.teamId))) &&
      j.status === 'COMPLETED'
    );

    if (completedCountBadge) {
      completedCountBadge.textContent = `${completedJobs.length} Completed`;
    }

    if (completedJobs.length === 0) {
      crewCompletedList.innerHTML = '';
      if (crewCompletedEmpty) crewCompletedEmpty.style.display = 'block';
      return;
    }

    if (crewCompletedEmpty) crewCompletedEmpty.style.display = 'none';

    crewCompletedList.innerHTML = completedJobs.map(j => {
      const linkedComp = PublicComplaintStore.getById(j.complaintRef);
      const coordsText = (linkedComp && linkedComp.coords) ? linkedComp.coords : 'Tamil Nadu Corridor';
      const descriptionText = (linkedComp && linkedComp.description) ? linkedComp.description : 'Road corridor restoration and resurfacing.';

      return `
        <article class="dash-card" style="margin-bottom: 1.5rem; border-left: 4px solid #155724;">
          
          <!-- Top Row: IDs, Status, Completion Time -->
          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.75rem;">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.35rem;">
                <span class="complaint-ref-pill" style="font-size: 0.8125rem;">Work Order #${PublicComplaintStore.escapeHtml(j.jobId)}</span>
                <span class="priority-pill completed">✓ Status: Completed & Verified</span>
                <span style="font-size: 0.75rem; color: var(--color-text-muted);">
                  Linked Citizen Complaint: <strong style="color: var(--color-charcoal);">${PublicComplaintStore.escapeHtml(j.complaintRef)}</strong>
                </span>
              </div>
              <h3 style="font-size: 1.25rem; font-weight: 800; color: var(--color-charcoal); margin: 0.25rem 0 0.15rem 0;">
                ${PublicComplaintStore.escapeHtml(j.location)}
              </h3>
              <div style="font-size: 0.8125rem; color: var(--color-text-muted);">
                📍 ${PublicComplaintStore.escapeHtml(coordsText)} • Dispatched: ${PublicComplaintStore.escapeHtml(j.assignedTime || '')}
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
              <div style="text-align: right;">
                <span style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: #155724; display: block;">Completion Timestamp</span>
                <strong style="font-size: 0.875rem; color: var(--color-charcoal);">${PublicComplaintStore.escapeHtml(j.completedTime || 'Verified On Site')}</strong>
              </div>
              <button type="button" class="btn btn-secondary btn-sm js-view-detail" data-id="${PublicComplaintStore.escapeHtml(j.jobId)}">
                Inspect Details
              </button>
            </div>
          </div>

          <!-- Description & Details -->
          <div style="background-color: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--border-radius-sm); padding: 0.875rem 1rem; margin-bottom: 0.875rem;">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; margin-bottom: 0.5rem;">
              <div>
                <span style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--color-text-muted);">Damage Classification</span>
                <div style="font-weight: 700; color: var(--color-charcoal); font-size: 0.875rem;">${PublicComplaintStore.escapeHtml(j.damageType)}</div>
              </div>
              <div>
                <span style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--color-text-muted);">Repair Status</span>
                <div style="font-weight: 700; color: #155724; font-size: 0.875rem;">Verified & Road Reopened</div>
              </div>
              <div>
                <span style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--color-text-muted);">Priority Score</span>
                <div style="font-weight: 700; color: var(--color-charcoal); font-size: 0.875rem;">${j.priority || 'N/A'}/30</div>
              </div>
              <div>
                <span style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--color-text-muted);">Duration Window</span>
                <div style="font-weight: 700; color: var(--color-charcoal); font-size: 0.875rem;">${PublicComplaintStore.escapeHtml(j.estimatedTime || '60')} mins</div>
              </div>
            </div>
            <div style="font-size: 0.8125rem; color: var(--color-text-muted); border-top: 1px solid var(--color-border-subtle); padding-top: 0.5rem;">
              <strong>Citizen Description:</strong> ${PublicComplaintStore.escapeHtml(descriptionText)}
            </div>
          </div>

          <!-- Machinery Deployed -->
          <div style="background-color: var(--color-surface-alt); border: 1px solid var(--color-border); border-radius: var(--border-radius-sm); padding: 0.75rem 1rem;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap;">
              <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                <span style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--color-text-muted);">Machinery Utilized on Site:</span>
                <div class="equipment-chip-list">
                  ${(j.equipment || []).map(eq => `<span class="equipment-chip">${PublicComplaintStore.escapeHtml(eq)}</span>`).join('')}
                </div>
              </div>
            </div>
            ${j.notes ? `
              <div style="margin-top: 0.5rem; font-size: 0.8125rem; color: var(--color-text-muted); border-top: 1px dashed var(--color-border); padding-top: 0.5rem;">
                <strong>Field Advisory Record:</strong> ${PublicComplaintStore.escapeHtml(j.notes)}
              </div>
            ` : ''}
          </div>

        </article>
      `;
    }).join('');

    // Attach Details modal listeners
    document.querySelectorAll('.js-view-detail').forEach(btn => {
      btn.addEventListener('click', () => {
        const jobId = btn.getAttribute('data-id');
        openDetailModal(jobId);
      });
    });
  }

  // Inspect Modal Logic (Read-Only)
  function openDetailModal(jobId) {
    const job = PublicComplaintStore.getJobById(jobId);
    if (!job) return;

    const linkedComp = PublicComplaintStore.getById(job.complaintRef);

    const titleEl = document.getElementById('modalJobTitle');
    const bodyEl = document.getElementById('modalJobDetailBody');

    if (titleEl) {
      titleEl.textContent = `Completed Work Order #${job.jobId}`;
    }

    if (bodyEl) {
      bodyEl.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap;">
            <div>
              <span class="complaint-ref-pill" style="font-size: 0.8125rem;">Ref: ${PublicComplaintStore.escapeHtml(job.complaintRef)}</span>
              <span class="priority-pill completed">✓ Completed & Verified</span>
            </div>
            <span style="font-size: 0.8125rem; color: #155724; font-weight: 700;">
              Completed: ${PublicComplaintStore.escapeHtml(job.completedTime || 'Verified')}
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
              <span style="font-size: 0.71875rem; font-weight: 700; text-transform: uppercase; color: var(--color-text-muted);">Execution Time</span>
              <div style="font-size: 0.875rem; font-weight: 700; color: var(--color-charcoal);">${job.estimatedTime || 60} mins</div>
            </div>
            <div style="background-color: var(--color-surface-alt); padding: 0.75rem; border-radius: var(--border-radius-sm); border: 1px solid var(--color-border);">
              <span style="font-size: 0.71875rem; font-weight: 700; text-transform: uppercase; color: var(--color-text-muted);">Dispatched On</span>
              <div style="font-size: 0.875rem; font-weight: 700; color: var(--color-charcoal);">${PublicComplaintStore.escapeHtml(job.assignedTime || 'N/A')}</div>
            </div>
            <div style="background-color: var(--color-surface-alt); padding: 0.75rem; border-radius: var(--border-radius-sm); border: 1px solid var(--color-border);">
              <span style="font-size: 0.71875rem; font-weight: 700; text-transform: uppercase; color: var(--color-text-muted);">Status Verified</span>
              <div style="font-size: 0.875rem; font-weight: 700; color: #155724;">Corridor Reopened</div>
            </div>
          </div>

          <div>
            <strong style="font-size: 0.8125rem; text-transform: uppercase; color: var(--color-text-muted); display: block; margin-bottom: 0.35rem;">
              Deployed Machinery
            </strong>
            <div class="equipment-chip-list">
              ${(job.equipment || []).map(eq => `<span class="equipment-chip">${PublicComplaintStore.escapeHtml(eq)}</span>`).join('')}
            </div>
          </div>

          ${job.notes ? `
            <div style="background-color: var(--color-surface-alt); border: 1px solid var(--color-border); border-radius: var(--border-radius-sm); padding: 0.75rem 1rem; color: var(--color-text-muted); font-size: 0.8125rem;">
              <strong>Operator Advisory:</strong> ${PublicComplaintStore.escapeHtml(job.notes)}
            </div>
          ` : ''}

          <div style="background-color: #D4EDDA; border: 1px solid #C3E6CB; border-radius: var(--border-radius-sm); padding: 0.75rem 1rem; color: #155724; font-size: 0.8125rem;">
            ✓ <strong>Verified Archive Record:</strong> This work order is concluded. Repeated execution or modification is disabled.
          </div>

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

  // Initial render & sync listener
  renderCompletedJobs();
  document.addEventListener('roadsync:synced', () => {
    renderCompletedJobs();
  });

});
