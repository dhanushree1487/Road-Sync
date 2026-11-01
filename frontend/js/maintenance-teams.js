/**
 * Road Sync — Maintenance Teams Controller
 * 
 * Manages:
 * - Maintenance team records rendering from shared PublicComplaintStore
 * - Availability badges & active work order linking
 * - Machinery & equipment fleet inventory breakdown
 * - Prototype demonstration transparency
 */

document.addEventListener('DOMContentLoaded', () => {

  const teamsGrid = document.getElementById('teamsGrid');
  const totalTeamsCount = document.getElementById('totalTeamsCount');
  const availableTeamsCount = document.getElementById('availableTeamsCount');
  const engagedTeamsCount = document.getElementById('engagedTeamsCount');

  function renderTeams() {
    if (typeof PublicComplaintStore === 'undefined') return;

    const teams = PublicComplaintStore.getTeams();
    const jobs = PublicComplaintStore.getJobs();

    const total = teams.length;
    const available = teams.filter(t => t.available).length;
    const engaged = total - available;

    if (totalTeamsCount) totalTeamsCount.textContent = total;
    if (availableTeamsCount) availableTeamsCount.textContent = available;
    if (engagedTeamsCount) engagedTeamsCount.textContent = engaged;

    if (teamsGrid) {
      teamsGrid.innerHTML = teams.map(t => {
        let activeJobInfo = '';
        if (!t.available && t.currentJobId) {
          const linkedJob = jobs.find(j => j.jobId === t.currentJobId);
          activeJobInfo = `
            <div style="background-color: #FFF3CD; border: 1px solid #FFEEBA; border-radius: var(--border-radius-sm); padding: 0.65rem 0.85rem; font-size: 0.8125rem; color: #856404;">
              <strong>Active Work Order:</strong> ${PublicComplaintStore.escapeHtml(t.currentJobId)}
              ${linkedJob ? `<div style="font-size: 0.75rem; margin-top: 0.2rem;">Location: ${PublicComplaintStore.escapeHtml(linkedJob.location)} (${PublicComplaintStore.escapeHtml(linkedJob.status)})</div>` : ''}
              <div style="margin-top: 0.35rem;">
                <a href="repair-jobs.html" style="color: var(--color-hero-panel); font-weight: 700;">Inspect Job in Console &rarr;</a>
              </div>
            </div>
          `;
        } else {
          activeJobInfo = `
            <div style="background-color: #D4EDDA; border: 1px solid #C3E6CB; border-radius: var(--border-radius-sm); padding: 0.65rem 0.85rem; font-size: 0.8125rem; color: #155724;">
              ✓ Team is ready for dispatch on high-priority municipal work orders.
            </div>
          `;
        }

        return `
          <div class="team-card">
            <div class="team-card-header">
              <div>
                <span style="font-size: 0.75rem; font-weight: 700; color: var(--color-hero-panel); text-transform: uppercase; letter-spacing: 0.05em;">${PublicComplaintStore.escapeHtml(t.teamId)}</span>
                <h3 class="team-card-title">${PublicComplaintStore.escapeHtml(t.name)}</h3>
                <div style="font-size: 0.78125rem; color: var(--color-text-muted);">${PublicComplaintStore.escapeHtml(t.division)}</div>
              </div>
              <span class="team-status-pill ${t.available ? 'available' : 'busy'}">
                <span style="width: 6px; height: 6px; border-radius: 50%; background-color: currentColor;"></span>
                ${t.available ? 'Available' : 'Engaged'}
              </span>
            </div>

            <div class="team-meta-row">
              <div class="team-meta-item">
                <strong>Base Depot Location</strong>
                <span>${PublicComplaintStore.escapeHtml(t.baseLocation)}</span>
              </div>
              <div class="team-meta-item">
                <strong>Field Supervisor</strong>
                <span>${PublicComplaintStore.escapeHtml(t.lead)}</span>
              </div>
              <div class="team-meta-item">
                <strong>Crew Personnel</strong>
                <span>${PublicComplaintStore.escapeHtml(t.membersCount)} Operators</span>
              </div>
              <div class="team-meta-item">
                <strong>System Login Account</strong>
                <span><code>${PublicComplaintStore.escapeHtml(t.username)}</code></span>
              </div>
            </div>

            <div>
              <strong style="display: block; font-size: 0.6875rem; text-transform: uppercase; color: var(--color-text-muted); letter-spacing: 0.04em; margin-bottom: 0.35rem;">Assigned Machinery & Equipment</strong>
              <div class="equipment-chip-list">
                ${t.equipment.map(eq => `<span class="equipment-chip">${PublicComplaintStore.escapeHtml(eq)}</span>`).join('')}
              </div>
            </div>

            ${activeJobInfo}
          </div>
        `;
      }).join('');
    }
  }

  renderTeams();
  document.addEventListener('roadsync:synced', () => {
    renderTeams();
  });

});
