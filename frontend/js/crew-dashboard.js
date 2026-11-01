/**
 * Road Sync — Maintenance Team Dashboard Controller
 * 
 * Manages:
 * - Dynamic work-order counts for the currently logged-in maintenance team:
 *   1. Total jobs assigned to this team
 *   2. Jobs awaiting work (status: ASSIGNED)
 *   3. Jobs currently in progress (status: IN_PROGRESS)
 *   4. Jobs completed (status: COMPLETED)
 * - Live readiness status for the team division
 * - Active work order preview & direct action links
 * - Recent completed work order overview
 */

document.addEventListener('DOMContentLoaded', () => {

  if (typeof PublicComplaintStore === 'undefined') return;

  function renderCrewDashboard() {
    const currentTeam = (typeof getCurrentCrewTeam === 'function') 
      ? getCurrentCrewTeam() 
      : { teamId: 'T01', name: 'Team T01 — Chennai South Rapid Unit' };

  // 1. Retrieve all jobs and filter for currently logged-in team
  const allJobs = PublicComplaintStore.getJobs();
  const myJobs = allJobs.filter(j => 
    j.teamId === currentTeam.teamId || 
    (j.teamName && j.teamName.includes(currentTeam.teamId))
  );

  // 2. Compute dynamic counts based strictly on actual work-order records
  const totalCount = myJobs.length;
  const awaitingCount = myJobs.filter(j => j.status === 'ASSIGNED').length;
  const inProgressCount = myJobs.filter(j => j.status === 'IN_PROGRESS').length;
  const completedCount = myJobs.filter(j => j.status === 'COMPLETED').length;

  // Ingest counts into summary cards
  const statTotalEl = document.getElementById('crewStatTotal');
  const statAssignedEl = document.getElementById('crewStatAssigned');
  const statInProgressEl = document.getElementById('crewStatInProgress');
  const statCompletedEl = document.getElementById('crewStatCompleted');

  if (statTotalEl) statTotalEl.textContent = totalCount;
  if (statAssignedEl) statAssignedEl.textContent = awaitingCount;
  if (statInProgressEl) statInProgressEl.textContent = inProgressCount;
  if (statCompletedEl) statCompletedEl.textContent = completedCount;

  // 3. Update Division Status Pill
  const statusPillContainer = document.getElementById('crewTeamStatusPill');
  if (statusPillContainer) {
    if (inProgressCount > 0) {
      statusPillContainer.innerHTML = `
        <span class="team-status-pill busy" style="display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.8125rem;">
          <span class="status-dot" style="background-color: #856404;" aria-hidden="true"></span>
          Active on Roadwork (${inProgressCount} in progress)
        </span>
      `;
    } else if (awaitingCount > 0) {
      statusPillContainer.innerHTML = `
        <span class="team-status-pill busy" style="display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.8125rem;">
          <span class="status-dot" style="background-color: #0C5460;" aria-hidden="true"></span>
          Dispatched — Work Awaiting Start (${awaitingCount})
        </span>
      `;
    } else {
      statusPillContainer.innerHTML = `
        <span class="team-status-pill ready" style="display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.8125rem;">
          <span class="status-dot" style="background-color: #155724;" aria-hidden="true"></span>
          Available for Dispatch
        </span>
      `;
    }
  }

  // 4. Render Active Work Order Preview Card
  const activeJobContainer = document.getElementById('crewActiveJobPreview');
  const activeJobs = myJobs.filter(j => j.status === 'IN_PROGRESS' || j.status === 'ASSIGNED');

  if (activeJobContainer) {
    if (activeJobs.length === 0) {
      activeJobContainer.innerHTML = `
        <div style="background-color: var(--color-white); border: 1px solid var(--color-border); border-radius: var(--border-radius-md); padding: 2.25rem 1.5rem; text-align: center; color: var(--color-text-muted);">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#155724" stroke-width="2" style="margin: 0 auto 0.75rem auto;">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h4 style="font-size: 1rem; font-weight: 700; color: #155724; margin-bottom: 0.25rem;">Unit On Standby — No Active Roadwork Pending</h4>
          <p style="font-size: 0.84375rem; margin-bottom: 0.75rem;">All work orders dispatched to your maintenance division have been completed, or your unit is awaiting municipal dispatch.</p>
          <a href="completed-jobs.html" class="btn btn-secondary btn-sm" style="display: inline-flex; align-items: center; gap: 0.35rem;">
            <span>View Completed Repairs &rarr;</span>
          </a>
        </div>
      `;
    } else {
      // Pick the highest priority active job (prefer IN_PROGRESS, then ASSIGNED)
      const primaryJob = activeJobs.find(j => j.status === 'IN_PROGRESS') || activeJobs[0];
      const isProgress = primaryJob.status === 'IN_PROGRESS';

      activeJobContainer.innerHTML = `
        <article class="dash-card" style="border-left: 4px solid ${isProgress ? 'var(--color-hero-panel)' : 'var(--color-amber-dark)'};">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.75rem;">
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                <span class="complaint-ref-pill" style="font-size: 0.8125rem;">${PublicComplaintStore.escapeHtml(primaryJob.jobId)}</span>
                <span class="priority-pill ${isProgress ? 'progress' : 'elevated'}">
                  ${isProgress ? 'In Progress' : 'Awaiting Start (Assigned)'}
                </span>
                <span style="font-size: 0.75rem; color: var(--color-text-muted);">
                  Linked Citizen Ref: <strong>${PublicComplaintStore.escapeHtml(primaryJob.complaintRef)}</strong>
                </span>
              </div>
              <h3 style="font-size: 1.125rem; font-weight: 800; color: var(--color-charcoal); margin: 0.35rem 0 0.2rem 0;">
                ${PublicComplaintStore.escapeHtml(primaryJob.location)}
              </h3>
              <div style="font-size: 0.8125rem; color: var(--color-text-muted);">
                Defect: <strong>${PublicComplaintStore.escapeHtml(primaryJob.damageType)}</strong> • Priority Score: <strong>${primaryJob.priority || 'N/A'}/30</strong> • Dispatched: ${PublicComplaintStore.escapeHtml(primaryJob.assignedTime || '')}
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <a href="assigned-jobs.html" class="btn btn-primary" style="font-weight: 700;">
                <span>Manage in Assigned Jobs &rarr;</span>
              </a>
            </div>
          </div>

          <div style="background-color: var(--color-surface-alt); border: 1px solid var(--color-border); border-radius: var(--border-radius-sm); padding: 0.75rem 1rem; margin-top: 0.75rem;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap;">
              <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                <span style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--color-text-muted);">Equipment Deployed:</span>
                <div class="equipment-chip-list">
                  ${(primaryJob.equipment || []).map(eq => `<span class="equipment-chip">${PublicComplaintStore.escapeHtml(eq)}</span>`).join('')}
                </div>
              </div>
              <div style="font-size: 0.8125rem; color: var(--color-text-muted);">
                Estimated Work Window: <strong>${PublicComplaintStore.escapeHtml(primaryJob.estimatedTime || '60')} mins</strong>
              </div>
            </div>
            ${primaryJob.notes ? `
              <div style="margin-top: 0.5rem; font-size: 0.8125rem; color: var(--color-text-muted); border-top: 1px dashed var(--color-border); padding-top: 0.5rem;">
                <strong>Operator Advisory:</strong> ${PublicComplaintStore.escapeHtml(primaryJob.notes)}
              </div>
            ` : ''}
          </div>
        </article>
      `;
    }
  }

  // 5. Render Recent Completed Job Snippet
  const completedSnippetContainer = document.getElementById('crewCompletedSnippet');
  const completedJobs = myJobs.filter(j => j.status === 'COMPLETED');

  if (completedSnippetContainer) {
    if (completedJobs.length === 0) {
      completedSnippetContainer.innerHTML = `
        <div style="background-color: var(--color-white); border: 1px solid var(--color-border); border-radius: var(--border-radius-md); padding: 1.5rem; text-align: center; color: var(--color-text-muted); font-size: 0.84375rem;">
          No repairs completed yet for this division. Dispatched repairs completed on site will be archived here.
        </div>
      `;
    } else {
      const latestCompleted = completedJobs[0];
      completedSnippetContainer.innerHTML = `
        <div style="background-color: var(--color-white); border: 1px solid var(--color-border); border-radius: var(--border-radius-md); padding: 1.25rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
              <span class="complaint-ref-pill" style="font-size: 0.75rem;">${PublicComplaintStore.escapeHtml(latestCompleted.jobId)}</span>
              <span class="priority-pill completed" style="font-size: 0.75rem;">✓ Completed & Verified</span>
              <span style="font-size: 0.75rem; color: var(--color-text-muted);">Ref: ${PublicComplaintStore.escapeHtml(latestCompleted.complaintRef)}</span>
            </div>
            <strong style="font-size: 0.9375rem; color: var(--color-charcoal);">${PublicComplaintStore.escapeHtml(latestCompleted.location)}</strong>
            <div style="font-size: 0.78125rem; color: var(--color-text-muted);">
              Completed: <strong>${PublicComplaintStore.escapeHtml(latestCompleted.completedTime || 'Recently')}</strong> • Equipment: ${(latestCompleted.equipment || []).join(', ')}
            </div>
          </div>
          <div>
            <a href="completed-jobs.html" class="btn btn-secondary btn-sm">
              <span>View All Completed (${completedJobs.length}) &rarr;</span>
            </a>
          </div>
        </div>
      `;
    }
  }

  renderCrewDashboard();
  document.addEventListener('roadsync:synced', () => {
    renderCrewDashboard();
  });

});
