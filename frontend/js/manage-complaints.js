/**
 * Road Sync — Manage Complaints & Triage Controller
 * 
 * Manages:
 * - Listing of all complaints from shared PublicComplaintStore
 * - Search by Ref ID, Location, Address
 * - Filtering by Status (All, Pending Triage, Prioritized, In Progress, Completed)
 * - Filtering by Damage Type (Pothole, Crack, Uneven, Other)
 * - Triage & Inspection Modal with Explicit Triage Gate:
 *   - Confirms Severity (1-3)
 *   - Evaluates Accident Risk (1-3)
 *   - Assigns Traffic Rank (1-3) based on manual corridor tier
 *   - Assigns Road Importance (1-3)
 *   - Enforces valid integer 1-3 for ALL 4 factors before computing priority
 *   - Uses exact Java DefaultPriorityPolicy formula: (s*3) + (r*3) + (t*2) + (i*2)
 *   - Persists triage results into shared store with updated history
 */

document.addEventListener('DOMContentLoaded', () => {

  // 1. DOM Elements
  const complaintsTableBody = document.getElementById('complaintsTableBody');
  const emptyStateBox = document.getElementById('emptyStateBox');
  const searchInput = document.getElementById('searchComplaintsInput');
  const filterStatusSelect = document.getElementById('filterStatusSelect');
  const filterTypeSelect = document.getElementById('filterTypeSelect');
  const complaintsCountBadge = document.getElementById('complaintsCountBadge');

  // Modal Elements
  const triageModalBackdrop = document.getElementById('triageModalBackdrop');
  const closeTriageModalBtn = document.getElementById('closeTriageModalBtn');
  const cancelTriageBtn = document.getElementById('cancelTriageBtn');
  const btnSaveTriage = document.getElementById('btnSaveTriage');
  const btnDirectDispatch = document.getElementById('btnDirectDispatch');

  // Modal Detail Displays
  const modalComplaintRef = document.getElementById('modalComplaintRef');
  const modalComplaintDate = document.getElementById('modalComplaintDate');
  const modalComplaintLocation = document.getElementById('modalComplaintLocation');
  const modalComplaintAddress = document.getElementById('modalComplaintAddress');
  const modalComplaintCoords = document.getElementById('modalComplaintCoords');
  const modalComplaintType = document.getElementById('modalComplaintType');
  const modalComplaintDesc = document.getElementById('modalComplaintDesc');
  const modalPhotoContainer = document.getElementById('modalPhotoContainer');
  const modalPhotoImg = document.getElementById('modalPhotoImg');
  const modalNoPhotoText = document.getElementById('modalNoPhotoText');

  // Triage Factor Radio Groups
  const triageSeverityRadios = document.querySelectorAll('input[name="triageSeverity"]');
  const triageRiskRadios = document.querySelectorAll('input[name="triageRisk"]');
  const triageTrafficRadios = document.querySelectorAll('input[name="triageTraffic"]');
  const triageImportanceRadios = document.querySelectorAll('input[name="triageImportance"]');

  // Triage Formula & Score Displays
  const triageScoreMath = document.getElementById('triageScoreMath');
  const triageScoreNumber = document.getElementById('triageScoreNumber');
  const triageScorePill = document.getElementById('triageScorePill');
  const triageValidationMsg = document.getElementById('triageValidationMsg');

  let activeComplaintId = null;

  // 2. Render Complaints Table
  function renderComplaints() {
    if (typeof PublicComplaintStore === 'undefined') return;

    const complaints = PublicComplaintStore.getAll();
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const statusFilter = filterStatusSelect ? filterStatusSelect.value : 'ALL';
    const typeFilter = filterTypeSelect ? filterTypeSelect.value : 'ALL';

    const filtered = complaints.filter(c => {
      // Search
      const refMatch = (c.id || c.refNo || '').toLowerCase().includes(query);
      const locMatch = (c.location || '').toLowerCase().includes(query);
      const addrMatch = (c.address || '').toLowerCase().includes(query);
      const descMatch = (c.description || '').toLowerCase().includes(query);
      if (query && !refMatch && !locMatch && !addrMatch && !descMatch) return false;

      // Status Filter
      if (statusFilter === 'PENDING_TRIAGE') {
        if (c.status !== 'PENDING' || (c.priority !== null && c.priority !== undefined)) return false;
      } else if (statusFilter === 'PRIORITIZED') {
        if (c.priority === null || c.priority === undefined || (c.status !== 'PENDING' && c.status !== 'PRIORITIZED')) return false;
      } else if (statusFilter === 'IN_PROGRESS') {
        if (c.status !== 'IN_PROGRESS' && c.status !== 'ASSIGNED') return false;
      } else if (statusFilter === 'COMPLETED') {
        if (c.status !== 'COMPLETED') return false;
      }

      // Type Filter
      if (typeFilter !== 'ALL' && !c.type.toLowerCase().includes(typeFilter.toLowerCase())) {
        return false;
      }

      return true;
    });

    if (complaintsCountBadge) {
      complaintsCountBadge.textContent = `Showing ${filtered.length} of ${complaints.length}`;
    }

    if (filtered.length === 0) {
      if (complaintsTableBody) complaintsTableBody.innerHTML = '';
      if (emptyStateBox) emptyStateBox.style.display = 'block';
      return;
    }

    if (emptyStateBox) emptyStateBox.style.display = 'none';

    if (complaintsTableBody) {
      complaintsTableBody.innerHTML = filtered.map(c => {
        const hasPriority = c.priority !== null && c.priority !== undefined;
        let priorityPill = '';

        if (!hasPriority) {
          priorityPill = `<span class="priority-pill pending">Pending Triage</span>`;
        } else {
          let tierClass = 'routine';
          if (c.priority >= 24) tierClass = 'critical';
          else if (c.priority >= 17) tierClass = 'elevated';
          priorityPill = `<span class="priority-pill ${tierClass}">Score: ${c.priority} / 30</span>`;
        }

        let statusClass = 'pending';
        let statusText = c.statusLabel || c.status;
        if (c.status === 'COMPLETED') {
          statusClass = 'completed';
        } else if (c.status === 'IN_PROGRESS') {
          statusClass = 'progress';
        } else if (c.status === 'ASSIGNED') {
          statusClass = 'elevated';
        } else if (hasPriority) {
          statusClass = 'prioritized';
          statusText = 'Prioritized (Ready to Dispatch)';
        }

        return `
          <tr>
            <td>
              <strong style="color: var(--color-charcoal);">${PublicComplaintStore.escapeHtml(c.id || c.refNo)}</strong>
              <div style="font-size: 0.75rem; color: var(--color-text-muted);">${PublicComplaintStore.escapeHtml(c.date)}</div>
            </td>
            <td>
              <div style="font-weight: 600; color: var(--color-charcoal);">${PublicComplaintStore.escapeHtml(c.location)}</div>
              <div style="font-size: 0.75rem; color: var(--color-text-muted);">${PublicComplaintStore.escapeHtml(c.coords || (c.lat ? c.lat.toFixed(4) + '° N, ' + c.lng.toFixed(4) + '° E' : 'GPS Pending'))}</div>
            </td>
            <td>
              <span style="font-size: 0.8125rem; font-weight: 600;">${PublicComplaintStore.escapeHtml(c.type)}</span>
            </td>
            <td>
              <span style="font-size: 0.8125rem;">Level ${c.severityLevel || 1}</span>
              <div style="font-size: 0.71875rem; color: var(--color-text-muted);">${PublicComplaintStore.escapeHtml(c.severity || '')}</div>
            </td>
            <td>
              ${priorityPill}
            </td>
            <td>
              <span class="priority-pill ${statusClass}">
                ${PublicComplaintStore.escapeHtml(statusText)}
              </span>
            </td>
            <td>
              <button type="button" class="btn btn-secondary btn-sm js-open-triage" data-id="${PublicComplaintStore.escapeHtml(c.id || c.refNo)}">
                ${hasPriority ? 'View / Re-triage' : 'Triage & Rank &rarr;'}
              </button>
            </td>
          </tr>
        `;
      }).join('');

      // Attach row button click listeners
      document.querySelectorAll('.js-open-triage').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          openTriageModal(id);
        });
      });
    }
  }

  // 3. Open Triage Modal
  function openTriageModal(complaintId) {
    const c = PublicComplaintStore.getById(complaintId);
    if (!c) return;

    activeComplaintId = c.id || c.refNo;

    // Populate Modal Displays
    if (modalComplaintRef) modalComplaintRef.textContent = activeComplaintId;
    if (modalComplaintDate) modalComplaintDate.textContent = c.date || 'Recent';
    if (modalComplaintLocation) modalComplaintLocation.textContent = c.location || 'Tamil Nadu Road';
    if (modalComplaintAddress) modalComplaintAddress.textContent = c.address || 'Address unrecorded';
    if (modalComplaintCoords) {
      modalComplaintCoords.textContent = c.coords || (c.lat ? `${c.lat.toFixed(4)}° N, ${c.lng.toFixed(4)}° E` : 'Coordinates pending');
    }
    if (modalComplaintType) modalComplaintType.textContent = c.type;
    if (modalComplaintDesc) modalComplaintDesc.textContent = c.description || 'No additional resident notes.';

    // Photo Preview
    if (c.photoPreview) {
      if (modalPhotoImg) modalPhotoImg.src = c.photoPreview;
      if (modalPhotoContainer) modalPhotoContainer.style.display = 'block';
      if (modalNoPhotoText) modalNoPhotoText.style.display = 'none';
    } else {
      if (modalPhotoContainer) modalPhotoContainer.style.display = 'none';
      if (modalNoPhotoText) modalNoPhotoText.style.display = 'block';
    }

    // Set Radios based on existing data or reset
    setRadioValue('triageSeverity', c.severityLevel || 1);
    setRadioValue('triageRisk', c.accidentRisk || null);
    setRadioValue('triageTraffic', c.trafficRank || null);
    setRadioValue('triageImportance', c.importanceRank || null);

    // If already triaged, show direct dispatch button
    if (btnDirectDispatch) {
      btnDirectDispatch.style.display = (c.priority !== null && c.priority !== undefined) ? 'inline-flex' : 'none';
      btnDirectDispatch.onclick = () => {
        window.location.href = `repair-jobs.html?dispatch=${encodeURIComponent(activeComplaintId)}`;
      };
    }

    // Update Live Calculation
    updateLivePriorityCalculation();

    // Show modal
    if (triageModalBackdrop) {
      triageModalBackdrop.classList.add('is-open');
    }
  }

  function closeTriageModal() {
    if (triageModalBackdrop) {
      triageModalBackdrop.classList.remove('is-open');
    }
    activeComplaintId = null;
  }

  function getRadioValue(name) {
    const checked = document.querySelector(`input[name="${name}"]:checked`);
    return checked ? parseInt(checked.value, 10) : null;
  }

  function setRadioValue(name, val) {
    const radios = document.querySelectorAll(`input[name="${name}"]`);
    radios.forEach(r => {
      r.checked = (val !== null && parseInt(r.value, 10) === parseInt(val, 10));
      // update highlight class
      const parentOption = r.closest('.triage-radio-option');
      if (parentOption) {
        if (r.checked) parentOption.classList.add('is-selected');
        else parentOption.classList.remove('is-selected');
      }
    });
  }

  // 4. Live Priority Calculation with Explicit Triage Gate
  function updateLivePriorityCalculation() {
    const s = getRadioValue('triageSeverity');
    const r = getRadioValue('triageRisk');
    const t = getRadioValue('triageTraffic');
    const i = getRadioValue('triageImportance');

    const allProvided = (s !== null && r !== null && t !== null && i !== null);

    if (!allProvided) {
      // Explicit Triage Gate: Missing ranks prevent final calculation
      if (triageScoreMath) {
        triageScoreMath.textContent = 'Formula: (Severity × 3) + (Risk × 3) + (Traffic × 2) + (Importance × 2)';
      }
      if (triageScoreNumber) {
        triageScoreNumber.textContent = '--';
      }
      if (triageScorePill) {
        triageScorePill.className = 'priority-pill pending';
        triageScorePill.textContent = 'Pending Complete Triage';
      }
      if (triageValidationMsg) {
        triageValidationMsg.style.display = 'block';
        triageValidationMsg.innerHTML = '<span style="color: #856404;">⚠️ Please select all 4 required ranking factors (1–3) to compute authoritative priority.</span>';
      }
      if (btnSaveTriage) {
        btnSaveTriage.disabled = true;
      }
      return;
    }

    // Exact Java formula: severity * 3 + risk * 3 + traffic * 2 + importance * 2
    const score = PublicComplaintStore.calculatePriority(s, r, t, i);

    if (triageScoreMath) {
      triageScoreMath.textContent = `(${s} × 3) + (${r} × 3) + (${t} × 2) + (${i} × 2) = ${s * 3} + ${r * 3} + ${t * 2} + ${i * 2} = ${score}`;
    }
    if (triageScoreNumber) {
      triageScoreNumber.textContent = `${score} / 30`;
    }
    if (triageScorePill) {
      let tierClass = 'routine';
      let tierLabel = 'Routine Maintenance (Score 10–16)';
      if (score >= 24) {
        tierClass = 'critical';
        tierLabel = 'Critical / Emergency (Score 24–30)';
      } else if (score >= 17) {
        tierClass = 'elevated';
        tierLabel = 'Elevated Priority (Score 17–23)';
      }
      triageScorePill.className = `priority-pill ${tierClass}`;
      triageScorePill.textContent = tierLabel;
    }

    if (triageValidationMsg) {
      triageValidationMsg.style.display = 'block';
      triageValidationMsg.innerHTML = '<span style="color: #155724;">✓ All 4 required factors validated. Priority calculation ready to save.</span>';
    }

    if (btnSaveTriage) {
      btnSaveTriage.disabled = false;
    }
  }

  // Listen to all radio changes
  [triageSeverityRadios, triageRiskRadios, triageTrafficRadios, triageImportanceRadios].forEach(group => {
    group.forEach(radio => {
      radio.addEventListener('change', () => {
        // Update highlight class on all options in this group
        group.forEach(r => {
          const parent = r.closest('.triage-radio-option');
          if (parent) {
            if (r.checked) parent.classList.add('is-selected');
            else parent.classList.remove('is-selected');
          }
        });
        updateLivePriorityCalculation();
      });
    });
  });

  // 5. Save Triage Assessment
  if (btnSaveTriage) {
    btnSaveTriage.addEventListener('click', async () => {
      if (!activeComplaintId) return;

      const s = getRadioValue('triageSeverity');
      const r = getRadioValue('triageRisk');
      const t = getRadioValue('triageTraffic');
      const i = getRadioValue('triageImportance');

      if (s === null || r === null || t === null || i === null) {
        alert('Please select all 4 ranking factors before saving.');
        return;
      }

      const origBtnText = btnSaveTriage.textContent;
      btnSaveTriage.disabled = true;
      btnSaveTriage.textContent = 'Saving Triage to Backend...';

      try {
        const updated = await PublicComplaintStore.triageComplaintAsync(activeComplaintId, {
          severity: s,
          severityLevel: s,
          accidentRisk: r,
          trafficRank: t,
          importanceRank: i
        });

        // Close modal and refresh table
        closeTriageModal();
        renderComplaints();

        // Show temporary notification
        const toast = document.createElement('div');
        toast.style.cssText = 'position: fixed; bottom: 24px; right: 24px; background-color: #183B32; color: #FFFFFF; padding: 14px 20px; border-radius: 8px; box-shadow: 0 6px 16px rgba(0,0,0,0.25); z-index: 3000; font-size: 0.875rem; font-weight: 600; display: flex; align-items: center; gap: 10px;';
        toast.innerHTML = `✓ Triage assessment saved to Java backend for ${PublicComplaintStore.escapeHtml(activeComplaintId)}. Priority score: ${updated.priority || 'Calculated'} / 30.`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
      } catch (err) {
        console.error('[Triage Error]', err);
        alert('Triage Save Failed: ' + (err.message || 'Unable to save triage to backend server.'));
      } finally {
        btnSaveTriage.disabled = false;
        btnSaveTriage.textContent = origBtnText;
      }
    });
  }

  // Modal Close Events
  if (closeTriageModalBtn) closeTriageModalBtn.addEventListener('click', closeTriageModal);
  if (cancelTriageBtn) cancelTriageBtn.addEventListener('click', closeTriageModal);
  if (triageModalBackdrop) {
    triageModalBackdrop.addEventListener('click', (e) => {
      if (e.target === triageModalBackdrop) closeTriageModal();
    });
  }

  // Filter & Search Event Listeners
  if (searchInput) searchInput.addEventListener('input', renderComplaints);
  if (filterStatusSelect) filterStatusSelect.addEventListener('change', renderComplaints);
  if (filterTypeSelect) filterTypeSelect.addEventListener('change', renderComplaints);

  // Initial render & sync listener
  renderComplaints();
  document.addEventListener('roadsync:synced', () => {
    renderComplaints();
  });

  // Check URL query for direct triage open (e.g. ?triage=RS-2026-0105)
  const urlParams = new URLSearchParams(window.location.search);
  const triageParam = urlParams.get('triage');
  if (triageParam) {
    setTimeout(() => {
      openTriageModal(triageParam);
    }, 150);
  }

});
