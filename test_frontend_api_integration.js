// test_frontend_api_integration.js
// Automated verification script for Road Sync Stage 6 Step 3 Frontend API Integration

const API_BASE = 'http://localhost:8080/api';

async function run() {
  console.log('==================================================================');
  console.log(' ROAD SYNC — STAGE 6 STEP 3 API CLIENT & INTEGRATION TEST RUNNER');
  console.log('==================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, detail = '') {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName}: ${detail}`);
      failed++;
    }
  }

  // 1. Health check
  console.log('[Test 1] Backend Health Endpoint');
  const healthRes = await fetch(`${API_BASE}/health`);
  const healthJson = await healthRes.json();
  assert(healthRes.status === 200, 'Health endpoint status 200');
  assert(healthJson.status === 'UP', 'Health status is UP');

  // 2. Invalid Credentials
  console.log('\n[Test 2] Authentication & Security Verification');
  const badAuthRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'operator', password: 'badpassword' })
  });
  assert(badAuthRes.status === 401, 'Bad credentials return HTTP 401');

  // 3. Citizen Login
  const citAuthRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'public', password: '1234' })
  });
  const citAuthJson = await citAuthRes.json();
  assert(citAuthRes.status === 200, 'Citizen login succeeds (HTTP 200)');
  assert(citAuthJson.role === 'public', 'Citizen role is public');

  // 4. Public Complaint Submission (5-field form payload with photograph)
  console.log('\n[Test 3] Public User 5-Field Complaint Submission');
  const newComplaintPayload = {
    location: 'Sardar Patel Road - Guindy Circle',
    address: 'Sardar Patel Road, Guindy, Chennai, Tamil Nadu 600032',
    lat: 13.0082,
    lng: 80.2134,
    coords: '13.0082° N, 80.2134° E',
    type: 'Pothole',
    severity: 'Large crack or deep pothole',
    severityLevel: 3,
    description: 'Deep pavement cavity along arterial lane causing vehicle deceleration.',
    photoPreview: 'data:image/jpeg;base64,' + 'A'.repeat(500)
  };

  const submitRes = await fetch(`${API_BASE}/complaints`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newComplaintPayload)
  });
  const submitJson = await submitRes.json();
  assert(submitRes.status === 201, 'Complaint submitted with HTTP 201 Created');
  assert(submitJson.id && submitJson.id.startsWith('RS-2026-'), `Generated Ref ID: ${submitJson.id}`);
  assert(submitJson.status === 'PENDING', 'Initial status is PENDING');
  const complaintId = submitJson.id;

  // 5. Operator Login
  console.log('\n[Test 4] Municipal Operator Login & Triage');
  const opAuthRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'operator', password: '1234' })
  });
  const opAuthJson = await opAuthRes.json();
  assert(opAuthRes.status === 200, 'Operator login succeeds (HTTP 200)');
  const opToken = opAuthJson.token;
  assert(Boolean(opToken), 'Operator session token issued');

  // 6. Triage validation: invalid factor rejection
  const invalidTriageRes = await fetch(`${API_BASE}/complaints/${complaintId}/triage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${opToken}`
    },
    body: JSON.stringify({ severityLevel: 4, accidentRisk: 3, trafficRank: 3, importanceRank: 3 })
  });
  assert(invalidTriageRes.status === 400, 'Out-of-range triage factor (>3) rejected with HTTP 400');

  // 7. Valid Triage (3, 3, 3, 3 -> (3*3) + (3*3) + (3*2) + (3*2) = 30)
  const triageRes = await fetch(`${API_BASE}/complaints/${complaintId}/triage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${opToken}`
    },
    body: JSON.stringify({ severityLevel: 3, accidentRisk: 3, trafficRank: 3, importanceRank: 3 })
  });
  const triageJson = await triageRes.json();
  assert(triageRes.status === 200, 'Valid triage succeeds with HTTP 200');
  assert(triageJson.priority === 30, `Priority calculation score: ${triageJson.priority} / 30`);
  assert(triageJson.triaged === true, 'Marked triaged: true');

  // 8. Work Order Creation
  console.log('\n[Test 5] Work Order Creation & Team Conflict Handling');
  // Attempt assigning busy team T01
  const busyAssignRes = await fetch(`${API_BASE}/jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${opToken}`
    },
    body: JSON.stringify({
      complaintRef: complaintId,
      teamId: 'T01',
      jobType: 'Spot Repair',
      notes: 'Should fail because T01 is engaged'
    })
  });
  assert(busyAssignRes.status === 409, 'Assigning busy team T01 rejected with HTTP 409 Conflict');

  // Assign available team T03
  const jobRes = await fetch(`${API_BASE}/jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${opToken}`
    },
    body: JSON.stringify({
      complaintRef: complaintId,
      teamId: 'T03',
      jobType: 'Spot Repair',
      notes: 'Emergency night milling and pothole repair'
    })
  });
  const jobJson = await jobRes.json();
  assert(jobRes.status === 201, 'Work order created with HTTP 201 Created');
  assert(jobJson.jobId && jobJson.jobId.startsWith('JOB-'), `Job ID: ${jobJson.jobId}`);
  assert(jobJson.status === 'ASSIGNED', 'Job status is ASSIGNED');
  assert(jobJson.teamId === 'T03', 'Assigned team is T03');
  const jobId = jobJson.jobId;

  // 9. Team T03 Login & Cross-Team Security Check
  console.log('\n[Test 6] Maintenance Team Authentication & Cross-Team Security');
  const t01AuthRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'team01', password: '1234' })
  });
  const t01Token = (await t01AuthRes.json()).token;

  // T01 tries to update T03's job -> 403 Forbidden
  const crossTeamRes = await fetch(`${API_BASE}/jobs/${jobId}/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${t01Token}`
    },
    body: JSON.stringify({ action: 'START' })
  });
  assert(crossTeamRes.status === 403, 'Cross-team status update rejected with HTTP 403 Forbidden');

  // 10. Team T03 Login & Legitimate Execution
  console.log('\n[Test 7] Maintenance Team Lifecycle Execution (START -> COMPLETE)');
  const t03AuthRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'team03', password: '1234' })
  });
  const t03Token = (await t03AuthRes.json()).token;

  // Start repair
  const startRes = await fetch(`${API_BASE}/jobs/${jobId}/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${t03Token}`
    },
    body: JSON.stringify({ action: 'START' })
  });
  const startJson = await startRes.json();
  assert(startRes.status === 200, 'Start repair succeeds with HTTP 200');
  assert(startJson.status === 'IN_PROGRESS', 'Job status transitioned to IN_PROGRESS');

  // Complete repair
  const completeRes = await fetch(`${API_BASE}/jobs/${jobId}/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${t03Token}`
    },
    body: JSON.stringify({ action: 'COMPLETE' })
  });
  const completeJson = await completeRes.json();
  assert(completeRes.status === 200, 'Complete repair succeeds with HTTP 200');
  assert(completeJson.status === 'COMPLETED', 'Job status transitioned to COMPLETED');
  assert(Boolean(completeJson.completedTime), `Recorded completion timestamp: ${completeJson.completedTime}`);

  // 11. Public Tracking Verification
  console.log('\n[Test 8] Public Tracking & 4-Stage Lifecycle Progression');
  const trackRes = await fetch(`${API_BASE}/complaints/${complaintId}`);
  const trackJson = await trackRes.json();
  assert(trackRes.status === 200, 'Fetch tracked complaint returns HTTP 200');
  assert(trackJson.status === 'COMPLETED', 'Public complaint status is COMPLETED');
  assert(Array.isArray(trackJson.history), 'Complaint has tracking history');

  const stageKeys = trackJson.history.map(h => h.stage);
  assert(stageKeys.includes('REPORTED'), 'Stage 1 (Complaint Registered) recorded');
  assert(stageKeys.includes('REVIEWED'), 'Stage 2 (Municipal Review and Triage) recorded');
  assert(stageKeys.includes('ASSIGNED'), 'Stage 3 (Team and Machinery Assigned) recorded');
  assert(stageKeys.includes('COMPLETED'), 'Stage 4 (Repair Completed and Verified) recorded');

  // 12. Check Team T03 Availability Restored
  console.log('\n[Test 9] Team Availability Release Verification');
  const teamsRes = await fetch(`${API_BASE}/teams`);
  const teamsJson = await teamsRes.json();
  const team03 = teamsJson.find(t => t.teamId === 'T03');
  assert(team03 && team03.available === true, 'Team T03 availability restored to true after job completion');

  console.log('\n==================================================================');
  console.log(` SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
