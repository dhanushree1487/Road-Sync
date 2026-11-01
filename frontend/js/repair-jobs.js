/**
 * Road Sync — Repair Jobs Planning & Work Order Controller
 * 
 * Simplified Municipal Operator Interface:
 * - Prioritized Complaints Queue (ready for work order generation)
 * - Municipal Repair Work Orders Table:
 *   - Displays Job ID, Date, Linked Ref, Location, Repair Class, Assigned Team, Machinery, Status
 *   - Workflow Action column REMOVED (operator does not manually advance repair progress)
 *   - Status is automatic: becomes ASSIGNED upon work order creation
 * - Simplified Create Work Order Modal:
 *   1. Target Prioritized Complaint: Locked to the specific complaint clicked by operator (no dropdown)
 *   2. Repair Class: User-friendly choices ("Spot Repair" vs. "Resurfacing Repair")
 *   3. Required Municipal Equipment: Machine requirements checklist & estimated repair duration
 *   4. Assign Maintenance Division: Team assignment with conflict prevention
 *   5. Traffic Advisory Notes: Optional municipal field notes
 *   6. Create Work Order: One clear submission button
 */

document.addEventListener('DOMContentLoaded', () => {

  // 1. DOM Elements
  const prioritizedQueueBody = document.getElementById('prioritizedQueueBody');
  const prioritizedEmptyBox = document.getElementById('prioritizedEmptyBox');
  const repairJobsTableBody = document.getElementById('repairJobsTableBody');
  const jobsEmptyBox = document.getElementById('jobsEmptyBox');

  // Modal Elements
  const jobModalBackdrop = document.getElementById('jobModalBackdrop');
  const closeJobModalBtn = document.getElementById('closeJobModalBtn');
  const cancelJobBtn = document.getElementById('cancelJobBtn');
  const btnDispatchJob = document.getElementById('btnDispatchJob');

  // Form Fields in Modal
  const modalTargetComplaintId = document.getElementById('modalTargetComplaintId');
  const modalTargetComplaintCard = document.getElementById('modalTargetComplaintCard');
  const modalEquipmentList = document.getElementById('modalEquipmentList');
  const modalEstTimeDisplay = document.getElementById('modalEstTimeDisplay');
  const modalJobTeamSelect = document.getElementById('modalJobTeamSelect');
  const modalTeamWarning = document.getElementById('modalTeamWarning');
  const modalJobNotes = document.getElementById('modalJobNotes');

  let activeDispatchRef = null;

  // Helper: Infer repair class from complaint type (Spot Repair for pothole, Resurfacing Repair for others)
  function getRepairClassForComplaint(comp) {
    if (!comp || !comp.type) return 'Spot Repair';
    const t = comp.type.toLowerCase();
    if (t.includes('pothole')) {
      return 'Spot Repair';
    }
    return 'Resurfacing Repair';
  }

  // Helper: Format repair class for display (no Java subclass technical labels)
  function formatRepairClass(typeStr) {
    if (!typeStr) return 'Spot Repair';
    if (typeStr === 'PotholeRepair' || typeStr === 'Spot Repair') return 'Spot Repair';
    if (typeStr === 'ResurfacingRepair' || typeStr === 'Resurfacing Repair') return 'Resurfacing Repair';
    return typeStr;
  }

  // 2. Render Prioritized Complaints Queue (Awaiting Work Order Dispatch)
  function renderPrioritizedQueue() {
    if (typeof PublicComplaintStore === 'undefined') return;

    const complaints = PublicComplaintStore.getAll();
    // Prioritized means triaged with a priority score, not yet assigned to an active repair job or completed
    const prioritized = complaints.filter(c => {
      const hasPriority = c.priority !== null && c.priority !== undefined;
      const notAssigned = c.status === 'PENDING' || c.status === 'PRIORITIZED';
      return hasPriority && notAssigned;
    }).sort((a, b) => b.priority - a.priority); // Highest priority first (30 -> 10)

    if (prioritizedQueueBody) {
      if (prioritized.length === 0) {
        prioritizedQueueBody.innerHTML = '';
        if (prioritizedEmptyBox) prioritizedEmptyBox.style.display = 'block';
      } else {
        if (prioritizedEmptyBox) prioritizedEmptyBox.style.display = 'none';
        prioritizedQueueBody.innerHTML = prioritized.map(c => {
          let tierClass = 'routine';
          if (c.priority >= 24) tierClass = 'critical';
          else if (c.priority >= 17) tierClass = 'elevated';

          const refId = c.id || c.refNo;

          return `
            <tr>
              <td>
                <span class="priority-pill ${tierClass}">
                  Score: ${c.priority} / 30
                </span>
              </td>
              <td>
                <strong style="color: var(--color-charcoal);">${PublicComplaintStore.escapeHtml(refId)}</strong>
                <div style="font-size: 0.75rem; color: var(--color-text-muted);">${PublicComplaintStore.escapeHtml(c.date)}</div>
              </td>
              <td>
                <div style="font-weight: 600; color: var(--color-charcoal);">${PublicComplaintStore.escapeHtml(c.location)}</div>
                <div style="font-size: 0.75rem; color: var(--color-text-muted);">${PublicComplaintStore.escapeHtml(c.coords || 'Tamil Nadu Corridor')}</div>
              </td>
              <td>${PublicComplaintStore.escapeHtml(c.type)}</td>
              <td>
                <span style="font-size: 0.8125rem;">Severity Level ${c.severityLevel || 1}</span>
                <div style="font-size: 0.71875rem; color: var(--color-text-muted);">Risk: ${c.accidentRisk || 1} • Traffic: ${c.trafficRank || 1} • Importance: ${c.importanceRank || 1}</div>
              </td>
              <td>
                <button type="button" class="btn btn-primary btn-sm js-open-dispatch" data-ref="${PublicComplaintStore.escapeHtml(refId)}">
                  <span>Create Work Order &rarr;</span>
                </button>
              </td>
            </tr>
          `;
        }).join('');

        // Attach listener: clicking row's Create Work Order directly targets that specific complaint
        document.querySelectorAll('.js-open-dispatch').forEach(btn => {
          btn.addEventListener('click', () => {
            const ref = btn.getAttribute('data-ref');
            openDispatchModal(ref);
          });
        });
      }
    }
  }

  // 3. Render Municipal Repair Work Orders Table
  // (NOTE: Workflow Action column and repair status buttons are removed; status updates via Maintenance Team)
  function renderRepairJobs() {
    if (typeof PublicComplaintStore === 'undefined') return;

    const jobs = PublicComplaintStore.getJobs();

    if (repairJobsTableBody) {
      if (jobs.length === 0) {
        repairJobsTableBody.innerHTML = '';
        if (jobsEmptyBox) jobsEmptyBox.style.display = 'block';
      } else {
        if (jobsEmptyBox) jobsEmptyBox.style.display = 'none';
        repairJobsTableBody.innerHTML = jobs.map(j => {
          let statusBadgeClass = 'routine';
          if (j.status === 'COMPLETED') statusBadgeClass = 'completed';
          else if (j.status === 'IN_PROGRESS') statusBadgeClass = 'progress';
          else if (j.status === 'ASSIGNED') statusBadgeClass = 'elevated';

          const repairClassLabel = formatRepairClass(j.jobType);

          return `
            <tr>
              <td>
                <strong style="color: var(--color-charcoal);">${PublicComplaintStore.escapeHtml(j.jobId)}</strong>
                <div style="font-size: 0.75rem; color: var(--color-text-muted);">${PublicComplaintStore.escapeHtml(j.assignedTime || '')}</div>
              </td>
              <td>
                <span class="priority-pill routine" style="font-size: 0.75rem;">${PublicComplaintStore.escapeHtml(j.complaintRef)}</span>
              </td>
              <td>
                <div style="font-weight: 600; color: var(--color-charcoal);">${PublicComplaintStore.escapeHtml(j.location)}</div>
                <div style="font-size: 0.75rem; color: var(--color-text-muted);">${PublicComplaintStore.escapeHtml(repairClassLabel)} • ${PublicComplaintStore.escapeHtml(j.damageType)}</div>
              </td>
              <td>
                <strong>${PublicComplaintStore.escapeHtml(j.teamName || j.teamId)}</strong>
              </td>
              <td>
                <div class="equipment-chip-list">
                  ${(j.equipment || []).map(eq => `<span class="equipment-chip">${PublicComplaintStore.escapeHtml(eq)}</span>`).join('')}
                </div>
              </td>
              <td>
                <span class="priority-pill ${statusBadgeClass}">
                  ${PublicComplaintStore.escapeHtml(j.status)}
                </span>
              </td>
            </tr>
          `;
        }).join('');
      }
    }
  }

  // 4. Open Dispatch Modal for Target Complaint (Locked: No Dropdown)
  function openDispatchModal(preselectedRef) {
    const complaints = PublicComplaintStore.getAll();
    const prioritized = complaints.filter(c => {
      const hasPriority = c.priority !== null && c.priority !== undefined;
      const notAssigned = c.status === 'PENDING' || c.status === 'PRIORITIZED';
      return hasPriority && notAssigned;
    }).sort((a, b) => b.priority - a.priority);

    let targetComp = null;
    if (preselectedRef) {
      targetComp = PublicComplaintStore.getById(preselectedRef);
    }

    if (!targetComp && prioritized.length > 0) {
      targetComp = prioritized[0];
    }

    if (!targetComp) {
      alert('All prioritized complaints have been dispatched or no prioritized complaints are available in queue.');
      return;
    }

    activeDispatchRef = targetComp.id || targetComp.refNo;

    // 1. Target Prioritized Complaint: Display locked complaint details (No Dropdown)
    if (modalTargetComplaintId) {
      modalTargetComplaintId.value = activeDispatchRef;
    }
    if (modalTargetComplaintCard) {
      let tierClass = 'routine';
      if (targetComp.priority >= 24) tierClass = 'critical';
      else if (targetComp.priority >= 17) tierClass = 'elevated';

      modalTargetComplaintCard.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span class="complaint-ref-pill" style="font-size: 0.8125rem;">${PublicComplaintStore.escapeHtml(activeDispatchRef)}</span>
            <span class="priority-pill ${tierClass}" style="font-size: 0.75rem;">Priority Score: ${targetComp.priority}/30</span>
          </div>
          <span style="font-size: 0.75rem; color: #155724; font-weight: 700; background-color: #D4EDDA; padding: 0.15rem 0.5rem; border-radius: 4px;">
            ✓ Locked Target
          </span>
        </div>
        <div style="margin-top: 0.35rem;">
          <strong style="color: var(--color-charcoal); font-size: 0.9375rem;">${PublicComplaintStore.escapeHtml(targetComp.location)}</strong>
          <div style="font-size: 0.8125rem; color: var(--color-text-muted);">
            Type: <strong>${PublicComplaintStore.escapeHtml(targetComp.type)}</strong> • Severity Level ${targetComp.severityLevel || 1} • Reported ${PublicComplaintStore.escapeHtml(targetComp.date)}
          </div>
        </div>
      `;
    }

    // Assign Maintenance Division: Populate with conflict tracking
    const teams = PublicComplaintStore.getTeams();
    if (modalJobTeamSelect) {
      modalJobTeamSelect.innerHTML = `
        <option value="">-- Select Maintenance Division --</option>
        ${teams.map(t => {
          const isAvail = t.available;
          const statusText = isAvail ? 'AVAILABLE' : `UNAVAILABLE (Busy with ${t.currentJobId || 'active job'})`;
          return `
            <option value="${PublicComplaintStore.escapeHtml(t.teamId)}" ${!isAvail ? 'disabled' : ''} data-available="${isAvail}">
              ${PublicComplaintStore.escapeHtml(t.name)} — Base: ${PublicComplaintStore.escapeHtml(t.baseLocation)} [${statusText}]
            </option>
          `;
        }).join('')}
      `;
    }

    // Reset notes
    if (modalJobNotes) {
      modalJobNotes.value = '';
    }

    // Update equipment chips and duration
    updateDispatchFormHelpers();

    if (jobModalBackdrop) {
      jobModalBackdrop.classList.add('is-open');
    }
  }

  function closeDispatchModal() {
    if (jobModalBackdrop) {
      jobModalBackdrop.classList.remove('is-open');
    }
    activeDispatchRef = null;
  }

  // Update Equipment & Estimated Duration based on complaint's damage type & severity
  function updateDispatchFormHelpers() {
    const comp = activeDispatchRef ? PublicComplaintStore.getById(activeDispatchRef) : null;
    const severity = comp ? (comp.severityLevel || 2) : 2;

    const repairClass = getRepairClassForComplaint(comp);
    let requiredEquipment = [];
    let estTime = 60;

    if (repairClass === 'Spot Repair' || repairClass === 'PotholeRepair') {
      requiredEquipment = ['JACKHAMMER', 'ASPHALT_MIXER'];
      if (severity === 3) requiredEquipment.push('ROAD_ROLLER');
      estTime = 30 + severity * 10;
    } else {
      requiredEquipment = ['PAVER', 'ROAD_ROLLER'];
      estTime = 45 + severity * 20;
    }

    if (modalEquipmentList) {
      modalEquipmentList.innerHTML = requiredEquipment.map(eq => `<span class="equipment-chip">${eq}</span>`).join('');
    }
    if (modalEstTimeDisplay) {
      modalEstTimeDisplay.textContent = `Estimated Duration: ${estTime} minutes`;
    }

    // Team Availability Check & Conflict Prevention
    const selectedTeamId = modalJobTeamSelect ? modalJobTeamSelect.value : null;
    const team = selectedTeamId ? PublicComplaintStore.getTeamById(selectedTeamId) : null;

    if (modalTeamWarning) {
      if (team && !team.available) {
        modalTeamWarning.style.display = 'block';
        modalTeamWarning.innerHTML = `⚠️ <strong>Team Conflict:</strong> ${team.name} is currently busy with ${team.currentJobId}. You must select an available team.`;
        if (btnDispatchJob) btnDispatchJob.disabled = true;
      } else {
        modalTeamWarning.style.display = 'none';
        if (btnDispatchJob) btnDispatchJob.disabled = !activeDispatchRef || !selectedTeamId;
      }
    }
  }

  // Event Listeners for form inputs
  if (modalJobTeamSelect) modalJobTeamSelect.addEventListener('change', updateDispatchFormHelpers);

  // 6. Create Work Order Submission
  if (btnDispatchJob) {
    btnDispatchJob.addEventListener('click', async () => {
      if (!activeDispatchRef) {
        alert('Target complaint is not selected.');
        return;
      }

      const selectedTeamId = modalJobTeamSelect ? modalJobTeamSelect.value : null;
      if (!selectedTeamId) {
        alert('Please assign an available maintenance division to this work order.');
        return;
      }

      const comp = PublicComplaintStore.getById(activeDispatchRef);
      const team = PublicComplaintStore.getTeamById(selectedTeamId);

      if (!comp) {
        alert('Target complaint record could not be found.');
        return;
      }

      if (team && !team.available) {
        alert(`Cannot assign: ${team.name} is currently engaged on another job (TeamUnavailableException).`);
        return;
      }

      const repairClass = getRepairClassForComplaint(comp);
      const notes = modalJobNotes ? modalJobNotes.value.trim() : '';

      const origBtnText = btnDispatchJob.textContent;
      btnDispatchJob.disabled = true;
      btnDispatchJob.textContent = 'Creating Work Order in Backend...';

      try {
        const created = await PublicComplaintStore.createJobAsync({
          complaintRef: activeDispatchRef,
          teamId: selectedTeamId,
          jobType: repairClass,
          notes: notes || 'Standard municipal repair work order dispatched.'
        });

        closeDispatchModal();
        renderPrioritizedQueue();
        renderRepairJobs();

        // Show confirmation toast
        const toast = document.createElement('div');
        toast.style.cssText = 'position: fixed; bottom: 24px; right: 24px; background-color: #183B32; color: #FFFFFF; padding: 14px 20px; border-radius: 8px; box-shadow: 0 6px 16px rgba(0,0,0,0.25); z-index: 3000; font-size: 0.875rem; font-weight: 600; display: flex; align-items: center; gap: 10px;';
        toast.innerHTML = `✓ Work Order #${created.jobId || 'created'} assigned to ${created.teamName || team?.name || selectedTeamId}! Status: ASSIGNED.`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
      } catch (err) {
        console.error('[Dispatch Error]', err);
        alert('Work Order Creation Failed: ' + (err.message || 'Unable to create work order on backend server.'));
      } finally {
        btnDispatchJob.disabled = false;
        btnDispatchJob.textContent = origBtnText;
      }
    });
  }

  // Modal Close Events
  if (closeJobModalBtn) closeJobModalBtn.addEventListener('click', closeDispatchModal);
  if (cancelJobBtn) cancelJobBtn.addEventListener('click', closeDispatchModal);
  if (jobModalBackdrop) {
    jobModalBackdrop.addEventListener('click', (e) => {
      if (e.target === jobModalBackdrop) closeDispatchModal();
    });
  }

  // Initial Renders & sync listener
  renderPrioritizedQueue();
  renderRepairJobs();
  document.addEventListener('roadsync:synced', () => {
    renderPrioritizedQueue();
    renderRepairJobs();
  });

  // Check URL query for direct dispatch (e.g. ?dispatch=RS-2026-0084)
  const urlParams = new URLSearchParams(window.location.search);
  const dispatchParam = urlParams.get('dispatch');
  if (dispatchParam) {
    setTimeout(() => {
      openDispatchModal(dispatchParam);
    }, 150);
  }

});
