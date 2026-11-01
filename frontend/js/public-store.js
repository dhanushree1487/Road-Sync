/**
 * Road Sync — Shared Municipal Complaint & Operations Store
 * 
 * Central data store shared across both Public User and Municipal Operator portals:
 * - Public User pages: dashboard-public.html, report-hazard.html, my-complaints.html, track-status.html
 * - Municipal Operator pages: dashboard-operator.html, manage-complaints.html, repair-jobs.html, maintenance-teams.html
 * 
 * Architectural Alignment with Main.java:
 * - RepairStatus enum: PENDING, ASSIGNED, IN_PROGRESS, COMPLETED
 * - Equipment enum: JACKHAMMER, ASPHALT_MIXER, ROAD_ROLLER, PAVER
 * - MaintenanceTeam entities: T01 (team01, L2), T02 (team02, L4), T03 (team03, L5)
 * - Exact DefaultPriorityPolicy formula: (severity * 3) + (accidentRisk * 3) + (trafficRank * 2) + (importanceRank * 2)
 * - All demo records explicitly marked `isDemo: true`
 */

const PublicComplaintStore = (() => {
  const STORAGE_KEY = 'roadsync_public_complaints';
  const SHARED_KEY = 'roadsync_complaints_shared';
  const JOBS_STORAGE_KEY = 'roadsync_repair_jobs';
  const TEAMS_STORAGE_KEY = 'roadsync_maintenance_teams';

  // --------------------------------------------------------------------------
  // 1. PRE-SEEDED DEMO COMPLAINTS (TAMIL NADU CORRIDORS)
  // --------------------------------------------------------------------------
  const DEMO_COMPLAINTS = [
    {
      id: 'RS-2026-0098',
      refNo: 'RS-2026-0098',
      location: 'Anna Salai (Mount Road) - Near Guindy',
      address: 'Anna Salai Arterial Highway, Near Guindy Junction, Chennai, Tamil Nadu 600032',
      lat: 13.0067,
      lng: 80.2025,
      coords: '13.0067° N, 80.2025° E',
      type: 'Pothole',
      severity: 'Large crack or deep pothole',
      severityLevel: 3,
      date: 'Oct 08, 2026',
      status: 'IN_PROGRESS',
      statusLabel: 'In Progress (Repair Underway)',
      progressNote: 'Maintenance Team T01 actively deploying Asphalt Mixer & Road Roller on site.',
      description: 'Deep pothole approximately 12 cm deep in northbound central lane. Hazardous for two-wheelers during evening peak transit.',
      photoPreview: null,
      isDemo: true,
      triaged: true,
      accidentRisk: 3,
      trafficRank: 3,
      importanceRank: 3,
      priority: 30, // (3*3) + (3*3) + (3*2) + (3*2) = 9 + 9 + 6 + 6 = 30
      equipment: ['ASPHALT_MIXER', 'ROAD_ROLLER', 'JACKHAMMER'],
      assignedJobId: 'JOB-102',
      assignedTeam: 'Team T01 (Chennai South Rapid Unit)',
      estimatedTime: '60 minutes',
      history: [
        { stage: 'REPORTED', title: 'Complaint Registered', date: 'Oct 08, 2026 09:15 AM', note: 'Report logged with Tamil Nadu GPS coordinates and lane details.' },
        { stage: 'REVIEWED', title: 'Municipal Review and Triage', date: 'Oct 08, 2026 10:30 AM', note: 'Operator triaged severity 3, accident risk 3, arterial traffic 3, importance 3. Priority score 30 calculated.' },
        { stage: 'ASSIGNED', title: 'Team and Machinery Assigned', date: 'Oct 08, 2026 01:45 PM', note: 'Work Order #JOB-102 assigned to Team T01 with Asphalt Mixer & Road Roller. Compaction underway.' }
      ]
    },
    {
      id: 'RS-2026-0084',
      refNo: 'RS-2026-0084',
      location: 'Avinashi Road Corridor - Near Gandhipuram',
      address: 'Avinashi Road Express Flyover Ramp, Gandhipuram, Coimbatore, Tamil Nadu 641018',
      lat: 11.0168,
      lng: 76.9558,
      coords: '11.0168° N, 76.9558° E',
      type: 'Uneven road surface',
      severity: 'Moderate damage',
      severityLevel: 2,
      date: 'Oct 05, 2026',
      status: 'ASSIGNED',
      statusLabel: 'Assigned to Maintenance Team',
      progressNote: 'Assigned to Maintenance Team T02. Scheduled for off-peak evening milling.',
      description: 'Asphalt rutting and wavy corrugated road surface across 15 meters on the flyover incline. Vehicles experiencing abrupt deceleration.',
      photoPreview: null,
      isDemo: true,
      triaged: true,
      accidentRisk: 2,
      trafficRank: 2,
      importanceRank: 2,
      priority: 20, // (2*3) + (2*3) + (2*2) + (2*2) = 6 + 6 + 4 + 4 = 20
      equipment: ['PAVER', 'ROAD_ROLLER'],
      assignedJobId: 'JOB-101',
      assignedTeam: 'Team T02 (Coimbatore Central Unit)',
      estimatedTime: '90 minutes',
      history: [
        { stage: 'REPORTED', title: 'Complaint Registered', date: 'Oct 05, 2026 08:40 AM', note: 'Citizen report filed via online portal.' },
        { stage: 'REVIEWED', title: 'Municipal Review and Triage', date: 'Oct 05, 2026 11:15 AM', note: 'Operator triaged severity 2, accident risk 2, traffic rank 2, importance 2. Priority score 20 calculated.' },
        { stage: 'ASSIGNED', title: 'Team and Machinery Assigned', date: 'Oct 05, 2026 04:30 PM', note: 'Work Order #JOB-101 assigned to Team T02 for nighttime milling and paving.' }
      ]
    },
    {
      id: 'RS-2026-0071',
      refNo: 'RS-2026-0071',
      location: 'Madurai Ring Road - Near Mattuthavani',
      address: 'Ring Road Bypass, Near Mattuthavani Bus Terminal, Madurai, Tamil Nadu 625007',
      lat: 9.9252,
      lng: 78.1198,
      coords: '9.9252° N, 78.1198° E',
      type: 'Road crack',
      severity: 'Small crack or shallow pothole',
      severityLevel: 1,
      date: 'Sep 28, 2026',
      status: 'COMPLETED',
      statusLabel: 'Completed & Verified',
      progressNote: 'Crack sealing and hot-pour sealant applied. Quality verified and road reopened.',
      description: 'Longitudinal fissures opening up along the curb lane following heavy seasonal rain.',
      photoPreview: null,
      isDemo: true,
      triaged: true,
      accidentRisk: 1,
      trafficRank: 2,
      importanceRank: 2,
      priority: 14, // (1*3) + (1*3) + (2*2) + (2*2) = 3 + 3 + 4 + 4 = 14
      equipment: ['JACKHAMMER', 'ASPHALT_MIXER'],
      assignedJobId: 'JOB-103',
      assignedTeam: 'Team T03 (Madurai North Division)',
      estimatedTime: '45 minutes',
      history: [
        { stage: 'REPORTED', title: 'Complaint Registered', date: 'Sep 28, 2026 10:00 AM', note: 'Report logged by resident.' },
        { stage: 'REVIEWED', title: 'Municipal Review and Triage', date: 'Sep 28, 2026 02:30 PM', note: 'Operator triaged severity 1, accident risk 1, traffic 2, importance 2. Priority score 14.' },
        { stage: 'ASSIGNED', title: 'Team and Machinery Assigned', date: 'Sep 30, 2026 08:30 AM', note: 'Work Order #JOB-103 dispatched to Team T03 with sealant materials.' },
        { stage: 'COMPLETED', title: 'Repair Completed and Verified', date: 'Sep 30, 2026 11:15 AM', note: 'Job completed. Quality verified by municipal field supervisor.' }
      ]
    },
    {
      id: 'RS-2026-0105',
      refNo: 'RS-2026-0105',
      location: 'Bangalore Highway (NH44) - Salem Junction',
      address: 'NH44 Bangalore-Salem Bypass, Near Five Roads, Salem, Tamil Nadu 636004',
      lat: 11.6643,
      lng: 78.1460,
      coords: '11.6643° N, 78.1460° E',
      type: 'Pothole',
      severity: 'Large crack or deep pothole',
      severityLevel: 3,
      date: 'Oct 11, 2026',
      status: 'PENDING',
      statusLabel: 'Pending Triage',
      progressNote: 'Citizen report filed online. Awaiting municipal operator review and priority ranking.',
      description: 'Cluster of multiple deep potholes in Salem bypass merge lane causing sudden braking and swerving of heavy vehicles.',
      photoPreview: null,
      isDemo: true,
      triaged: false,
      accidentRisk: null,
      trafficRank: null,
      importanceRank: null,
      priority: null, // Explicit triage gate: untriaged!
      equipment: ['JACKHAMMER', 'ASPHALT_MIXER'],
      assignedJobId: null,
      assignedTeam: 'Unassigned (Awaiting Operator Triage)',
      estimatedTime: 'Uncalculated',
      history: [
        { stage: 'REPORTED', title: 'Complaint Registered', date: 'Oct 11, 2026 09:30 AM', note: 'Resident report received with road GPS coordinates and lane details.' }
      ]
    }
  ];

  // --------------------------------------------------------------------------
  // 2. PRE-SEEDED DEMO JOBS (Aligned with Main.java RepairJob subclasses)
  // --------------------------------------------------------------------------
  const DEMO_JOBS = [
    {
      jobId: 'JOB-101',
      complaintRef: 'RS-2026-0084',
      location: 'Avinashi Road Corridor - Near Gandhipuram',
      damageType: 'Uneven road surface',
      jobType: 'ResurfacingRepair',
      severity: 2,
      priority: 20,
      teamId: 'T02',
      teamName: 'Team T02 (Coimbatore Central Unit)',
      status: 'ASSIGNED',
      equipment: ['PAVER', 'ROAD_ROLLER'],
      estimatedTime: 90, // minutes
      assignedTime: 'Oct 05, 2026 04:30 PM',
      completedTime: null,
      notes: 'Nighttime resurfacing and asphalt compaction scheduled.'
    },
    {
      jobId: 'JOB-102',
      complaintRef: 'RS-2026-0098',
      location: 'Anna Salai (Mount Road) - Near Guindy',
      damageType: 'Pothole',
      jobType: 'PotholeRepair',
      severity: 3,
      priority: 30,
      teamId: 'T01',
      teamName: 'Team T01 (Chennai South Rapid Unit)',
      status: 'IN_PROGRESS',
      equipment: ['JACKHAMMER', 'ASPHALT_MIXER', 'ROAD_ROLLER'],
      estimatedTime: 60, // minutes
      assignedTime: 'Oct 08, 2026 01:45 PM',
      completedTime: null,
      notes: 'Active asphalt hot-mix patching and compaction underway.'
    },
    {
      jobId: 'JOB-103',
      complaintRef: 'RS-2026-0071',
      location: 'Madurai Ring Road - Near Mattuthavani',
      damageType: 'Road crack',
      jobType: 'PotholeRepair',
      severity: 1,
      priority: 14,
      teamId: 'T03',
      teamName: 'Team T03 (Madurai North Division)',
      status: 'COMPLETED',
      equipment: ['JACKHAMMER', 'ASPHALT_MIXER'],
      estimatedTime: 45, // minutes
      assignedTime: 'Sep 30, 2026 08:30 AM',
      completedTime: 'Sep 30, 2026 11:15 AM',
      notes: 'Crack sealing completed and verified by municipal engineer.'
    }
  ];

  // --------------------------------------------------------------------------
  // 3. PRE-SEEDED MAINTENANCE TEAMS (Exact match to Main.java MaintenanceTeam)
  // --------------------------------------------------------------------------
  const DEMO_TEAMS = [
    {
      teamId: 'T01',
      username: 'team01',
      name: 'Team T01 — Chennai South Rapid Unit',
      division: 'Chennai Municipal Corporation',
      baseLocation: 'L2 (Guindy Maintenance Depot)',
      available: false, // Busy with JOB-102
      currentJobId: 'JOB-102',
      equipment: ['JACKHAMMER', 'ASPHALT_MIXER'],
      membersCount: 6,
      lead: 'K. Ramanathan (Foreman)'
    },
    {
      teamId: 'T02',
      username: 'team02',
      name: 'Team T02 — Coimbatore Central Division',
      division: 'Coimbatore City Municipal Corp',
      baseLocation: 'L4 (Gandhipuram Highway Yard)',
      available: false, // Busy with JOB-101
      currentJobId: 'JOB-101',
      equipment: ['PAVER', 'ROAD_ROLLER'],
      membersCount: 8,
      lead: 'M. Senthil Kumar (Supervisor)'
    },
    {
      teamId: 'T03',
      username: 'team03',
      name: 'Team T03 — Madurai North Heavy Division',
      division: 'Madurai Corporation Works Dept',
      baseLocation: 'L5 (Mattuthavani Operations Depot)',
      available: true, // Available!
      currentJobId: null,
      equipment: ['JACKHAMMER', 'ASPHALT_MIXER', 'PAVER', 'ROAD_ROLLER'],
      membersCount: 10,
      lead: 'S. Alagarsamy (Senior Engineer)'
    }
  ];

  // --------------------------------------------------------------------------
  // 4. STORAGE HELPERS (Seamless LocalStorage & SessionStorage Synchronization)
  // --------------------------------------------------------------------------
  function readJson(key, defaultData) {
    try {
      const local = localStorage.getItem(key);
      if (local) return JSON.parse(local);
      const session = sessionStorage.getItem(key);
      if (session) {
        localStorage.setItem(key, session);
        return JSON.parse(session);
      }
    } catch (e) {
      console.warn('Storage read warning:', e);
    }
    return defaultData;
  }

  function writeJson(key, data) {
    try {
      const serialized = JSON.stringify(data);
      sessionStorage.setItem(key, serialized);
      localStorage.setItem(key, serialized);
    } catch (e) {
      console.warn('Storage write warning:', e);
    }
  }

  let backendConnected = false;

  // Asynchronous synchronization with Java REST API (Authoritative Backend)
  async function syncWithBackend() {
    if (typeof ApiClient === 'undefined') {
      return false;
    }
    try {
      const data = await ApiClient.fetchAllData();
      if (data && Array.isArray(data.complaints)) {
        save(data.complaints);
      }
      if (data && Array.isArray(data.jobs)) {
        saveJobs(data.jobs);
      }
      if (data && Array.isArray(data.teams)) {
        saveTeams(data.teams);
      }
      backendConnected = true;
      document.dispatchEvent(new CustomEvent('roadsync:synced', { detail: data }));
      return true;
    } catch (e) {
      console.warn('[PublicComplaintStore] Backend sync notice:', e.message);
      backendConnected = false;
      document.dispatchEvent(new CustomEvent('roadsync:offline', { detail: { error: e.message } }));
      return false;
    }
  }

  // Auto-sync when DOM is ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { syncWithBackend(); });
    } else {
      setTimeout(syncWithBackend, 0);
    }
  }

  // --------------------------------------------------------------------------
  // 5. COMPLAINT OPERATIONS
  // --------------------------------------------------------------------------
  function getAll() {
    let list = readJson(SHARED_KEY, null);
    if (!list) {
      list = readJson(STORAGE_KEY, null);
    }
    if (!list || !Array.isArray(list) || list.length === 0) {
      save(DEMO_COMPLAINTS);
      return [...DEMO_COMPLAINTS];
    }
    return list;
  }

  function save(list) {
    writeJson(STORAGE_KEY, list);
    writeJson(SHARED_KEY, list);
  }

  // Authoritative Async Complaint Submission
  async function submitComplaintAsync(complaint) {
    if (typeof ApiClient !== 'undefined') {
      const created = await ApiClient.submitComplaint(complaint);
      const list = getAll();
      list.unshift(created);
      save(list);
      return created;
    }
    throw new Error('ApiClient is not available. Cannot submit complaint to backend.');
  }

  function add(complaint) {
    const list = getAll();
    list.unshift(complaint);
    save(list);
    return complaint;
  }

  function update(id, updates) {
    const list = getAll();
    const idx = list.findIndex(c => c.id === id || c.refNo === id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...updates };
      save(list);
      return list[idx];
    }
    return null;
  }

  function getById(id) {
    const list = getAll();
    return list.find(c => c.id === id || c.refNo === id) || null;
  }

  // --------------------------------------------------------------------------
  // 6. EXACT JAVA PRIORITY CALCULATION
  // DefaultPriorityPolicy: severity * 3 + accidentRisk * 3 + trafficRank * 2 + importanceRank * 2
  // --------------------------------------------------------------------------
  function calculatePriority(severity, accidentRisk, trafficRank, importanceRank) {
    const s = parseInt(severity, 10);
    const r = parseInt(accidentRisk, 10);
    const t = parseInt(trafficRank, 10);
    const i = parseInt(importanceRank, 10);

    if (isNaN(s) || isNaN(r) || isNaN(t) || isNaN(i)) return null;
    if (s < 1 || s > 3 || r < 1 || r > 3 || t < 1 || t > 3 || i < 1 || i > 3) return null;

    return (s * 3) + (r * 3) + (t * 2) + (i * 2);
  }

  function getPriorityLabel(score) {
    if (score === null || score === undefined) return 'Pending Triage';
    if (score >= 24) return 'Critical / Emergency';
    if (score >= 17) return 'Elevated Priority';
    return 'Routine Maintenance';
  }

  // --------------------------------------------------------------------------
  // 7. COMPREHENSIVE STATS COMPUTATION
  // --------------------------------------------------------------------------
  function getStats() {
    const list = getAll();
    const total = list.length;
    
    // Explicit triage gate: Pending Triage means no final priority calculated
    const pendingTriage = list.filter(c => c.status === 'PENDING' && (c.priority === null || c.priority === undefined)).length;
    
    // Prioritized means triaged with priority score, awaiting job creation or team assignment
    const prioritized = list.filter(c => c.priority !== null && c.priority !== undefined && (c.status === 'PENDING' || c.status === 'PRIORITIZED')).length;
    
    // Assigned / In Progress
    const repairInProgress = list.filter(c => c.status === 'IN_PROGRESS').length;
    const assigned = list.filter(c => c.status === 'ASSIGNED').length;
    const ongoing = assigned + repairInProgress;
    
    // Completed
    const completed = list.filter(c => c.status === 'COMPLETED').length;
    
    // Legacy pending compatibility
    const pending = list.filter(c => c.status === 'PENDING').length;

    return {
      total,
      pendingTriage,
      prioritized,
      repairInProgress,
      assigned,
      ongoing,
      completed,
      pending
    };
  }

  // --------------------------------------------------------------------------
  // 8. REPAIR JOB OPERATIONS
  // --------------------------------------------------------------------------
  function getJobs() {
    let jobs = readJson(JOBS_STORAGE_KEY, null);
    if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
      saveJobs(DEMO_JOBS);
      return [...DEMO_JOBS];
    }
    return jobs;
  }

  function saveJobs(jobs) {
    writeJson(JOBS_STORAGE_KEY, jobs);
  }

  function getJobById(jobId) {
    const jobs = getJobs();
    return jobs.find(j => j.jobId === jobId) || null;
  }

  function addJob(job) {
    const jobs = getJobs();
    jobs.unshift(job);
    saveJobs(jobs);

    // If job assigns a team, update team availability
    if (job.teamId) {
      updateTeam(job.teamId, {
        available: false,
        currentJobId: job.jobId
      });
    }

    // Update linked complaint status
    if (job.complaintRef) {
      const todayDate = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      const comp = getById(job.complaintRef);
      const newHistory = comp && comp.history ? [...comp.history] : [];
      newHistory.push({
        stage: 'ASSIGNED',
        title: 'Work Order Dispatched',
        date: `${todayDate} ${timeStr}`,
        note: `Work Order #${job.jobId} created and assigned to ${job.teamName}. Equipment: ${job.equipment.join(', ')}.`
      });

      update(job.complaintRef, {
        status: 'ASSIGNED',
        statusLabel: 'Assigned to Maintenance Team',
        progressNote: `Work Order #${job.jobId} assigned to ${job.teamName}. Estimated duration: ${job.estimatedTime} minutes.`,
        assignedJobId: job.jobId,
        assignedTeam: job.teamName,
        estimatedTime: `${job.estimatedTime} minutes`,
        history: newHistory
      });
    }

    return job;
  }

  function updateJob(jobId, updates) {
    const jobs = getJobs();
    const idx = jobs.findIndex(j => j.jobId === jobId);
    if (idx !== -1) {
      const prev = jobs[idx];
      jobs[idx] = { ...prev, ...updates };
      saveJobs(jobs);

      // If job completed, release team and update complaint
      if (updates.status === 'COMPLETED' && prev.status !== 'COMPLETED') {
        if (jobs[idx].teamId) {
          updateTeam(jobs[idx].teamId, {
            available: true,
            currentJobId: null
          });
        }
        if (jobs[idx].complaintRef) {
          const todayDate = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
          const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const comp = getById(jobs[idx].complaintRef);
          const newHistory = comp && comp.history ? [...comp.history] : [];
          newHistory.push({
            stage: 'COMPLETED',
            title: 'Repair Completed and Verified',
            date: `${todayDate} ${timeStr}`,
            note: `Work Order #${jobId} completed by ${jobs[idx].teamName}. Quality verified by municipal engineering team.`
          });

          update(jobs[idx].complaintRef, {
            status: 'COMPLETED',
            statusLabel: 'Completed & Verified',
            progressNote: `Repair finished by ${jobs[idx].teamName}. Road corridor inspected and reopened.`,
            history: newHistory
          });
        }
      } else if (updates.status === 'IN_PROGRESS' && prev.status !== 'IN_PROGRESS') {
        if (jobs[idx].complaintRef) {
          const todayDate = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
          const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const comp = getById(jobs[idx].complaintRef);
          const newHistory = comp && comp.history ? [...comp.history] : [];
          newHistory.push({
            stage: 'IN_PROGRESS',
            title: 'Repair Underway on Site',
            date: `${todayDate} ${timeStr}`,
            note: `Field crew actively operating machinery on site.`
          });

          update(jobs[idx].complaintRef, {
            status: 'IN_PROGRESS',
            statusLabel: 'In Progress (Repair Underway)',
            progressNote: `Maintenance crew is actively repairing the roadway on site with ${jobs[idx].equipment.join(', ')}.`,
            history: newHistory
          });
        }
      }

      return jobs[idx];
    }
    return null;
  }

  // --------------------------------------------------------------------------
  // 9. MAINTENANCE TEAM OPERATIONS
  // --------------------------------------------------------------------------
  function getTeams() {
    let teams = readJson(TEAMS_STORAGE_KEY, null);
    if (!teams || !Array.isArray(teams) || teams.length === 0) {
      saveTeams(DEMO_TEAMS);
      return [...DEMO_TEAMS];
    }
    return teams;
  }

  function saveTeams(teams) {
    writeJson(TEAMS_STORAGE_KEY, teams);
  }

  function getTeamById(teamId) {
    const teams = getTeams();
    return teams.find(t => t.teamId === teamId) || null;
  }

  function updateTeam(teamId, updates) {
    const teams = getTeams();
    const idx = teams.findIndex(t => t.teamId === teamId);
    if (idx !== -1) {
      teams[idx] = { ...teams[idx], ...updates };
      saveTeams(teams);
      return teams[idx];
    }
    return null;
  }

  // --------------------------------------------------------------------------
  // 10. UTILITIES
  // --------------------------------------------------------------------------
  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[m]);
  }

  // Authoritative Async Triage
  async function triageComplaintAsync(id, factors) {
    if (typeof ApiClient !== 'undefined') {
      const updated = await ApiClient.triageComplaint(id, factors);
      const list = getAll();
      const idx = list.findIndex(c => c.id === id || c.refNo === id);
      if (idx !== -1) {
        list[idx] = updated;
        save(list);
      }
      return updated;
    }
    throw new Error('ApiClient is not available.');
  }

  // Authoritative Async Work Order Creation
  async function createJobAsync(jobData) {
    if (typeof ApiClient !== 'undefined') {
      const created = await ApiClient.createJob(jobData);
      await syncWithBackend();
      return created;
    }
    throw new Error('ApiClient is not available.');
  }

  // Authoritative Async Status Transition
  async function updateJobStatusAsync(jobId, action) {
    if (typeof ApiClient !== 'undefined') {
      const updated = await ApiClient.updateJobStatus(jobId, action);
      await syncWithBackend();
      return updated;
    }
    throw new Error('ApiClient is not available.');
  }

  return {
    getAll,
    save,
    add,
    update,
    getById,
    getStats,
    calculatePriority,
    getPriorityLabel,
    getJobs,
    saveJobs,
    getJobById,
    addJob,
    updateJob,
    getTeams,
    saveTeams,
    getTeamById,
    updateTeam,
    escapeHtml,
    syncWithBackend,
    submitComplaintAsync,
    triageComplaintAsync,
    createJobAsync,
    updateJobStatusAsync,
    isBackendConnected: () => backendConnected
  };
})();

// Attach globally
if (typeof window !== 'undefined') {
  window.PublicComplaintStore = PublicComplaintStore;
  window.RoadSyncStore = PublicComplaintStore;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PublicComplaintStore;
}
