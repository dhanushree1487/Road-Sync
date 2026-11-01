/**
 * Road Sync — Municipal Operator Dashboard Controller
 * 
 * Manages:
 * - Real-time statistics aggregation from shared PublicComplaintStore
 * - 5 Required Summary Metric Cards:
 *   1. Total Complaints
 *   2. Pending Triage
 *   3. Prioritized Complaints
 *   4. Repair Jobs in Progress
 *   5. Completed Repairs
 * - Pending Triage Attention Queue
 * - Maintenance Teams readiness overview
 * - Recent Dispatched Jobs snapshot
 */

document.addEventListener('DOMContentLoaded', () => {

  // 1. DOM Elements
  const statTotalComplaints = document.getElementById('statTotalComplaints');
  const statPendingTriage = document.getElementById('statPendingTriage');
  const statPrioritizedComplaints = document.getElementById('statPrioritizedComplaints');
  const statInProgressJobs = document.getElementById('statInProgressJobs');
  const statCompletedRepairs = document.getElementById('statCompletedRepairs');

  const pendingTriageList = document.getElementById('pendingTriageList');
  const pendingTriageCountBadge = document.getElementById('pendingTriageCountBadge');
  const activeTeamsList = document.getElementById('activeTeamsList');
  const recentJobsTableBody = document.getElementById('recentJobsTableBody');

  // 2. Load & Render Data
  function renderDashboard() {
    if (typeof PublicComplaintStore === 'undefined') {
      console.warn('PublicComplaintStore is not loaded.');
      return;
    }

    const complaints = PublicComplaintStore.getAll();
    const stats = PublicComplaintStore.getStats();
    const jobs = PublicComplaintStore.getJobs();
    const teams = PublicComplaintStore.getTeams();

    // Update 5 Required Summary Metric Cards
    if (statTotalComplaints) statTotalComplaints.textContent = stats.total;
    if (statPendingTriage) statPendingTriage.textContent = stats.pendingTriage;
    if (statPrioritizedComplaints) statPrioritizedComplaints.textContent = stats.prioritized;
    if (statInProgressJobs) statInProgressJobs.textContent = stats.repairInProgress;
    if (statCompletedRepairs) statCompletedRepairs.textContent = stats.completed;

    if (pendingTriageCountBadge) {
      pendingTriageCountBadge.textContent = `${stats.pendingTriage} Awaiting Triage`;
    }

    // 3. Render Pending Triage List
    if (pendingTriageList) {
      const untriaged = complaints.filter(c => c.status === 'PENDING' && (c.priority === null || c.priority === undefined));
      
      if (untriaged.length === 0) {
        pendingTriageList.innerHTML = `
          <div style="padding: 2.5rem 1.5rem; text-align: center; color: var(--color-text-muted);">
            <svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="#155724" stroke-width="2" style="margin: 0 auto 0.75rem auto;">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h4 style="font-size: 1rem; font-weight: 700; color: #155724; margin-bottom: 0.25rem;">Triage Queue Clear</h4>
            <p style="font-size: 0.84375rem;">All citizen reports have been reviewed and prioritized. Check <a href="manage-complaints.html" style="color: var(--color-hero-panel); font-weight: 600;">Manage Complaints</a> for all records.</p>
          </div>
        `;
      } else {
        pendingTriageList.innerHTML = untriaged.map(c => `
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem 1.25rem; border-bottom: 1px solid var(--color-border-subtle); flex-wrap: wrap;">
            <div style="display: flex; flex-direction: column; gap: 0.2rem; min-width: 220px;">
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <strong style="font-size: 0.875rem; color: var(--color-charcoal);">${PublicComplaintStore.escapeHtml(c.id || c.refNo)}</strong>
                <span class="priority-pill pending">Pending Triage</span>
              </div>
              <span style="font-size: 0.8125rem; font-weight: 600; color: var(--color-charcoal);">${PublicComplaintStore.escapeHtml(c.location)}</span>
              <span style="font-size: 0.75rem; color: var(--color-text-muted);">${PublicComplaintStore.escapeHtml(c.type)} • Submitted ${PublicComplaintStore.escapeHtml(c.date)}</span>
            </div>
            <div>
              <a href="manage-complaints.html?triage=${encodeURIComponent(c.id || c.refNo)}" class="btn btn-primary btn-sm">
                <span>Triage & Prioritize &rarr;</span>
              </a>
            </div>
          </div>
        `).join('');
      }
    }

    // 4. Render Maintenance Teams Readiness
    if (activeTeamsList) {
      activeTeamsList.innerHTML = teams.map(t => `
        <div style="background-color: var(--color-surface-alt); border: 1px solid var(--color-border); border-radius: var(--border-radius-md); padding: 1rem; display: flex; flex-direction: column; gap: 0.6rem;">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <strong style="font-size: 0.90625rem; color: var(--color-charcoal);">${PublicComplaintStore.escapeHtml(t.name)}</strong>
            <span class="team-status-pill ${t.available ? 'available' : 'busy'}">
              <span style="width: 6px; height: 6px; border-radius: 50%; background-color: currentColor;"></span>
              ${t.available ? 'Available' : 'Engaged (' + PublicComplaintStore.escapeHtml(t.currentJobId || 'Active Job') + ')'}
            </span>
          </div>
          <div style="font-size: 0.78125rem; color: var(--color-text-muted);">
            <span>Base: <strong>${PublicComplaintStore.escapeHtml(t.baseLocation)}</strong></span>
            <span style="margin: 0 0.4rem;">•</span>
            <span>Lead: ${PublicComplaintStore.escapeHtml(t.lead)}</span>
          </div>
          <div class="equipment-chip-list">
            ${t.equipment.map(eq => `<span class="equipment-chip">${PublicComplaintStore.escapeHtml(eq)}</span>`).join('')}
          </div>
        </div>
      `).join('');
    }

    // 5. Render Recent Dispatched Repair Jobs
    if (recentJobsTableBody) {
      if (jobs.length === 0) {
        recentJobsTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">No repair jobs dispatched yet.</td></tr>`;
      } else {
        recentJobsTableBody.innerHTML = jobs.slice(0, 5).map(j => {
          let statusBadgeClass = 'routine';
          if (j.status === 'COMPLETED') statusBadgeClass = 'completed';
          else if (j.status === 'IN_PROGRESS') statusBadgeClass = 'progress';
          else if (j.status === 'ASSIGNED') statusBadgeClass = 'elevated';

          const repairLabel = (j.jobType === 'PotholeRepair' || j.jobType === 'Spot Repair') ? 'Spot Repair' : ((j.jobType === 'ResurfacingRepair' || j.jobType === 'Resurfacing Repair') ? 'Resurfacing Repair' : (j.jobType || 'Repair'));

          return `
            <tr>
              <td><strong>${PublicComplaintStore.escapeHtml(j.jobId)}</strong></td>
              <td>
                <div style="display: flex; flex-direction: column;">
                  <span style="font-weight: 600;">${PublicComplaintStore.escapeHtml(j.location)}</span>
                  <span style="font-size: 0.75rem; color: var(--color-text-muted);">Ref: ${PublicComplaintStore.escapeHtml(j.complaintRef)} • ${PublicComplaintStore.escapeHtml(repairLabel)}</span>
                </div>
              </td>
              <td>${PublicComplaintStore.escapeHtml(j.teamName || j.teamId)}</td>
              <td>
                <span class="priority-pill ${j.priority >= 24 ? 'critical' : (j.priority >= 17 ? 'elevated' : 'routine')}">
                  Score: ${j.priority}
                </span>
              </td>
              <td>
                <span class="priority-pill ${statusBadgeClass}">
                  ${PublicComplaintStore.escapeHtml(j.status)}
                </span>
              </td>
              <td style="font-size: 0.8125rem; color: var(--color-text-muted);">${PublicComplaintStore.escapeHtml(j.estimatedTime)} mins</td>
            </tr>
          `;
        }).join('');
      }
    }
  }

  renderDashboard();
  document.addEventListener('roadsync:synced', () => {
    renderDashboard();
  });

});
