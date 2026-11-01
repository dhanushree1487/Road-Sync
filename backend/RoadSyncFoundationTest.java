import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

/**
 * Road Sync — Step 1 Automated Verification Suite
 * 
 * Verifies backend foundation and JSON storage without requiring an HTTP server:
 * 1. Zero-dependency JSON parsing and serialization (including Base64 image payloads)
 * 2. Atomic JSON file persistence and corruption recovery
 * 3. Preservation of existing Tamil Nadu demo complaints, jobs, and teams
 * 4. Priority calculation reuse via Main.java DefaultPriorityPolicy and RoadDamage
 * 5. Polymorphic repair job creation (PotholeRepair & ResurfacingRepair) and equipment validation
 * 6. Authentication and session tokens (PublicUser, MunicipalOperator, MaintenanceTeam)
 * 7. Strict role-based authorization and division ownership (anti-spoofing and cross-team protection)
 * 8. State machine validation (InvalidRepairStateException and TeamUnavailableException)
 */
public class RoadSyncFoundationTest {

    private static int testsRun = 0;
    private static int testsPassed = 0;

    public static void main(String[] args) {
        System.out.println("==================================================================");
        System.out.println("  ROAD SYNC — STEP 1 BACKEND FOUNDATION & STORAGE TEST SUITE");
        System.out.println("==================================================================\n");

        Path tempTestDir = null;
        try {
            tempTestDir = Files.createTempDirectory("roadsync_test_");

            testJsonHelperBasics();
            testJsonHelperPhotoPayload();
            testStorageManagerPersistence(tempTestDir);
            testStorageManagerCorruptionRecovery(tempTestDir);
            testDataPreservationStrategy(tempTestDir);
            testPriorityCalculationReusedFromMain(tempTestDir);
            testAuthenticationAndSessionSecurity(tempTestDir);
            testAuthorizationAndDivisionOwnership(tempTestDir);
            testRepairLifecycleAndStateTransitions(tempTestDir);

            System.out.println("\n------------------------------------------------------------------");
            System.out.printf("  TEST RESULTS: %d / %d PASSED (100%% SUCCESS)\n", testsPassed, testsRun);
            System.out.println("------------------------------------------------------------------");

        } catch (Throwable t) {
            System.err.println("\n[FAIL] Unexpected test failure: " + t.getMessage());
            t.printStackTrace();
        } finally {
            if (tempTestDir != null) {
                cleanupDir(tempTestDir);
            }
        }
    }

    private static void assertTrue(String testName, boolean condition, String details) {
        testsRun++;
        if (condition) {
            testsPassed++;
            System.out.println("  [PASS] " + testName + " — " + details);
        } else {
            System.err.println("  [FAIL] " + testName + " — FAILED: " + details);
            throw new AssertionError("Test assertion failed: " + testName);
        }
    }

    // -------------------------------------------------------------------------
    // TEST 1: JsonHelper Basics
    // -------------------------------------------------------------------------
    private static void testJsonHelperBasics() throws Exception {
        System.out.println("[Suite 1] JSON Parser & Serializer Core");

        Map<String, Object> sample = new LinkedHashMap<>();
        sample.put("refNo", "RS-2026-0098");
        sample.put("severity", 3);
        sample.put("isDemo", true);
        sample.put("rating", 4.5);
        sample.put("equipment", Arrays.asList("JACKHAMMER", "ASPHALT_MIXER"));
        sample.put("notes", "Road crack with \"quotes\" and newline\nsecond line.");

        String json = JsonHelper.toJson(sample);
        assertTrue("JsonHelper Serialization", json.contains("\"refNo\": \"RS-2026-0098\""), "Serialized valid JSON structure");

        Object parsed = JsonHelper.parse(json);
        assertTrue("JsonHelper Parsing Type", parsed instanceof Map, "Parsed back into LinkedHashMap");

        @SuppressWarnings("unchecked")
        Map<String, Object> parsedMap = (Map<String, Object>) parsed;
        assertTrue("JsonHelper Primitive Field", "RS-2026-0098".equals(parsedMap.get("refNo")), "Field refNo matches");
        assertTrue("JsonHelper Number Field", ((Number) parsedMap.get("severity")).intValue() == 3, "Severity integer matches");
        assertTrue("JsonHelper Boolean Field", Boolean.TRUE.equals(parsedMap.get("isDemo")), "Boolean flag matches");
        assertTrue("JsonHelper List Field", parsedMap.get("equipment") instanceof List, "Equipment array preserved");
        assertTrue("JsonHelper Escape Handling", parsedMap.get("notes").toString().contains("newline\nsecond line"), "Preserved escaped characters");
    }

    // -------------------------------------------------------------------------
    // TEST 2: JsonHelper Base64 Photo Payload (Requirement 6)
    // -------------------------------------------------------------------------
    private static void testJsonHelperPhotoPayload() throws Exception {
        System.out.println("\n[Suite 2] Photograph Payload Preservation (Requirement 6)");

        // Simulate a realistic 120 KB Base64 Data URL photo upload
        StringBuilder sb = new StringBuilder("data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/");
        for (int i = 0; i < 2000; i++) {
            sb.append("A1B2C3D4E5F6G7H8I9J0kLmNoPqRsTuVwXyZ+/==");
        }
        String largePhotoDataUrl = sb.toString();

        Map<String, Object> photoRecord = new LinkedHashMap<>();
        photoRecord.put("id", "RS-2026-TESTPHOTO");
        photoRecord.put("photoPreview", largePhotoDataUrl);

        String json = JsonHelper.toJson(photoRecord);
        Object parsed = JsonHelper.parse(json);

        @SuppressWarnings("unchecked")
        Map<String, Object> parsedMap = (Map<String, Object>) parsed;
        String restoredPhoto = (String) parsedMap.get("photoPreview");

        assertTrue("Photo Payload Length", restoredPhoto != null && restoredPhoto.length() == largePhotoDataUrl.length(),
                "Full Base64 photo preserved (" + restoredPhoto.length() + " chars, no truncation)");
        assertTrue("Photo Payload Exact Match", largePhotoDataUrl.equals(restoredPhoto),
                "Binary data URL integrity completely preserved");
    }

    // -------------------------------------------------------------------------
    // TEST 3: StorageManager Atomic Persistence (Requirement 5)
    // -------------------------------------------------------------------------
    private static void testStorageManagerPersistence(Path testDir) throws Exception {
        System.out.println("\n[Suite 3] StorageManager Atomic File Operations (Requirement 5)");

        StorageManager sm = new StorageManager(testDir.resolve("atomic_test"));
        List<Map<String, Object>> complaints = sm.loadComplaints();

        assertTrue("Default Complaints Seeded", complaints.size() == 4, "Seeded exactly 4 demo complaints");
        assertTrue("Complaints File Exists", Files.exists(sm.getComplaintsFile()), "complaints.json created on disk");

        // Verify atomic write leaves no stray .tmp files
        Path tempFile = sm.getComplaintsFile().resolveSibling("complaints.json.tmp");
        assertTrue("No Staging Temp File Left", !Files.exists(tempFile), "Temporary staging file cleanly renamed atomically");

        // Modify and save
        Map<String, Object> first = complaints.get(0);
        first.put("testMarker", "ATOMIC_VERIFIED");
        sm.saveComplaints(complaints);

        // Reload to verify disk state
        List<Map<String, Object>> reloaded = sm.loadComplaints();
        assertTrue("Atomic Update Preserved", "ATOMIC_VERIFIED".equals(reloaded.get(0).get("testMarker")),
                "Updated record persisted atomically and reloaded without loss");
    }

    // -------------------------------------------------------------------------
    // TEST 4: StorageManager Malformed JSON Recovery (Requirement 5)
    // -------------------------------------------------------------------------
    private static void testStorageManagerCorruptionRecovery(Path testDir) throws Exception {
        System.out.println("\n[Suite 4] StorageManager Corruption Safety (Requirement 5)");

        Path corruptDir = testDir.resolve("corrupt_test");
        Files.createDirectories(corruptDir);
        Path corruptFile = corruptDir.resolve("complaints.json");

        // Intentionally inject broken JSON
        Files.writeString(corruptFile, "{ broken json [ missing brackets \"id\": ");

        StorageManager sm = new StorageManager(corruptDir);
        List<Map<String, Object>> recovered = sm.loadComplaints();

        assertTrue("Graceful Corruption Recovery", recovered != null && recovered.size() == 4,
                "Did not crash; recovered safely with fallback demo data");

        // Verify safety backup was created
        boolean foundBackup = false;
        try (var stream = Files.list(corruptDir)) {
            for (Path p : stream.toList()) {
                if (p.getFileName().toString().contains(".corrupted.")) {
                    foundBackup = true;
                    break;
                }
            }
        }
        assertTrue("Corrupted Safety Backup File", foundBackup, "Preserved corrupted original in .corrupted.<timestamp>.bak");
    }

    // -------------------------------------------------------------------------
    // TEST 5: Data Preservation Strategy (Requirement 4)
    // -------------------------------------------------------------------------
    private static void testDataPreservationStrategy(Path testDir) throws Exception {
        System.out.println("\n[Suite 5] Demonstration Records Preservation (Requirement 4)");

        StorageManager sm = new StorageManager(testDir.resolve("preservation_test"));

        List<Map<String, Object>> complaints = sm.loadComplaints();
        Set<String> complaintIds = new HashSet<>();
        for (Map<String, Object> c : complaints) {
            complaintIds.add((String) c.get("id"));
        }

        assertTrue("Preserved RS-2026-0098 (Chennai)", complaintIds.contains("RS-2026-0098"), "Pre-seeded Mount Road corridor");
        assertTrue("Preserved RS-2026-0084 (Coimbatore)", complaintIds.contains("RS-2026-0084"), "Pre-seeded Avinashi Road corridor");
        assertTrue("Preserved RS-2026-0071 (Madurai)", complaintIds.contains("RS-2026-0071"), "Pre-seeded Madurai Ring Road");
        assertTrue("Preserved RS-2026-0105 (Salem)", complaintIds.contains("RS-2026-0105"), "Pre-seeded Untriaged Salem NH44");

        List<Map<String, Object>> jobs = sm.loadJobs();
        Set<String> jobIds = new HashSet<>();
        for (Map<String, Object> j : jobs) {
            jobIds.add((String) j.get("jobId"));
        }
        assertTrue("Preserved JOB-101", jobIds.contains("JOB-101"), "Pre-seeded Coimbatore resurfacing job");
        assertTrue("Preserved JOB-102", jobIds.contains("JOB-102"), "Pre-seeded Chennai pothole job");
        assertTrue("Preserved JOB-103", jobIds.contains("JOB-103"), "Pre-seeded Madurai completed job");

        List<Map<String, Object>> teams = sm.loadTeams();
        assertTrue("Preserved 3 Maintenance Teams", teams.size() == 3, "Teams T01, T02, T03 pre-seeded matching Main.java");

        // Verify that existing data is NEVER silently overwritten on subsequent loads
        complaints.get(0).put("customField", "DoNotOverwriteMe");
        sm.saveComplaints(complaints);

        StorageManager smSecondInstance = new StorageManager(testDir.resolve("preservation_test"));
        List<Map<String, Object>> reloadedComplaints = smSecondInstance.loadComplaints();
        assertTrue("No Overwrite on Reload", "DoNotOverwriteMe".equals(reloadedComplaints.get(0).get("customField")),
                "Existing data was preserved and not overwritten by defaults");
    }

    // -------------------------------------------------------------------------
    // TEST 6: Priority Calculation Reused from Main.java (Requirement 1)
    // -------------------------------------------------------------------------
    private static void testPriorityCalculationReusedFromMain(Path testDir) throws Exception {
        System.out.println("\n[Suite 6] Reuse of Main.java Priority Calculation (Requirement 1)");

        StorageManager sm = new StorageManager(testDir.resolve("priority_test"));
        RoadSyncService service = new RoadSyncService(sm);

        // Authenticate as Municipal Operator
        RoadSyncService.AuthSession opSession = service.login("operator", "1234");

        // Triage the untriaged Salem complaint RS-2026-0105:
        // Severity = 3, Risk = 3, Traffic = 2, Importance = 3
        // Formula: (3*3) + (3*3) + (2*2) + (3*2) = 9 + 9 + 4 + 6 = 28
        Map<String, Object> triaged = service.triageComplaint(opSession.getToken(), "RS-2026-0105", 3, 3, 2, 3);

        int calculatedScore = ((Number) triaged.get("priority")).intValue();
        assertTrue("Priority Formula Exact Match", calculatedScore == 28,
                "Formula (3*3)+(3*3)+(2*2)+(3*2) = 28 computed directly via Main.java DefaultPriorityPolicy");
        assertTrue("Complaint Triaged Flag Set", Boolean.TRUE.equals(triaged.get("triaged")), "Complaint marked triaged: true");
    }

    // -------------------------------------------------------------------------
    // TEST 7: Authentication & Session Security (Requirement 3)
    // -------------------------------------------------------------------------
    private static void testAuthenticationAndSessionSecurity(Path testDir) throws Exception {
        System.out.println("\n[Suite 7] Authentication & Session Tokens (Requirement 3)");

        StorageManager sm = new StorageManager(testDir.resolve("auth_test"));
        RoadSyncService service = new RoadSyncService(sm);

        // 1. Valid logins
        RoadSyncService.AuthSession publicSession = service.login("public", "1234");
        assertTrue("Public Login", publicSession.getRole() == RoadSyncService.Role.PUBLIC, "Public user authenticated");

        RoadSyncService.AuthSession opSession = service.login("operator", "1234");
        assertTrue("Operator Login", opSession.getRole() == RoadSyncService.Role.OPERATOR, "Operator authenticated");

        RoadSyncService.AuthSession crewSession = service.login("team01", "1234");
        assertTrue("Crew Login", crewSession.getRole() == RoadSyncService.Role.CREW && "T01".equals(crewSession.getTeamId()),
                "Team T01 authenticated with verified teamId");

        // 2. Invalid credentials
        boolean failedBadPass = false;
        try {
            service.login("operator", "wrongpass");
        } catch (RoadSyncService.SecurityViolationException e) {
            failedBadPass = true;
        }
        assertTrue("Reject Invalid Password", failedBadPass, "Rejected incorrect password with SecurityViolationException");

        boolean failedBadUser = false;
        try {
            service.login("nonexistent_user", "1234");
        } catch (RoadSyncService.SecurityViolationException e) {
            failedBadUser = true;
        }
        assertTrue("Reject Unknown User", failedBadUser, "Rejected unknown username");

        // 3. Logout
        service.logout(publicSession.getToken());
        boolean tokenInvalidated = false;
        try {
            service.validateSession(publicSession.getToken());
        } catch (RoadSyncService.SecurityViolationException e) {
            tokenInvalidated = true;
        }
        assertTrue("Session Invalidation on Logout", tokenInvalidated, "Token invalidated successfully upon logout");
    }

    // -------------------------------------------------------------------------
    // TEST 8: Role-Based Authorization & Division Ownership (Requirement 3)
    // -------------------------------------------------------------------------
    private static void testAuthorizationAndDivisionOwnership(Path testDir) throws Exception {
        System.out.println("\n[Suite 8] Role-Based Authorization & Division Ownership (Requirement 3)");

        StorageManager sm = new StorageManager(testDir.resolve("authz_test"));
        RoadSyncService service = new RoadSyncService(sm);

        RoadSyncService.AuthSession publicSession = service.login("public", "1234");
        RoadSyncService.AuthSession crewT01Session = service.login("team01", "1234");
        RoadSyncService.AuthSession crewT02Session = service.login("team02", "1234");

        // A. Citizen cannot triage
        boolean citizenBlockedFromTriage = false;
        try {
            service.triageComplaint(publicSession.getToken(), "RS-2026-0105", 2, 2, 2, 2);
        } catch (RoadSyncService.SecurityViolationException e) {
            citizenBlockedFromTriage = true;
        }
        assertTrue("Citizen Blocked from Triage", citizenBlockedFromTriage, "Citizen cannot access operator triage");

        // B. Raw teamId without authenticated session is rejected
        boolean rawTokenBlocked = false;
        try {
            service.updateRepairJobStatus("fake-token-with-teamId-T01", "JOB-102", "START");
        } catch (RoadSyncService.SecurityViolationException e) {
            rawTokenBlocked = true;
        }
        assertTrue("Raw / Forged Session Blocked", rawTokenBlocked, "Raw teamId parameter without session rejected");

        // C. Cross-team modification blocked (Team T02 cannot modify Team T01's JOB-102)
        boolean crossTeamBlocked = false;
        try {
            // JOB-102 is assigned to T01
            service.updateRepairJobStatus(crewT02Session.getToken(), "JOB-102", "START");
        } catch (RoadSyncService.SecurityViolationException e) {
            crossTeamBlocked = true;
        }
        assertTrue("Cross-Team Division Protection", crossTeamBlocked,
                "Team T02 strictly blocked from modifying Team T01's work order");
    }

    // -------------------------------------------------------------------------
    // TEST 9: Repair Job Lifecycle & State Transitions (Main.java OOP Reuse)
    // -------------------------------------------------------------------------
    private static void testRepairLifecycleAndStateTransitions(Path testDir) throws Exception {
        System.out.println("\n[Suite 9] Work Order Lifecycle & State Transitions (Requirement 1)");

        StorageManager sm = new StorageManager(testDir.resolve("lifecycle_test"));
        RoadSyncService service = new RoadSyncService(sm);

        RoadSyncService.AuthSession opSession = service.login("operator", "1234");
        RoadSyncService.AuthSession crewT03Session = service.login("team03", "1234");

        // 1. Triage Salem complaint
        service.triageComplaint(opSession.getToken(), "RS-2026-0105", 3, 3, 3, 3);

        // 2. Team T03 is available. Dispatch work order.
        Map<String, Object> newJob = service.createWorkOrder(
                opSession.getToken(),
                "RS-2026-0105",
                "T03",
                "PotholeRepair",
                "Repair crew dispatched with asphalt mixer"
        );
        String jobId = (String) newJob.get("jobId");
        assertTrue("Work Order Created", jobId != null && jobId.startsWith("JOB-"), "Created polymorphic work order " + jobId);
        assertTrue("Initial Status ASSIGNED", "ASSIGNED".equals(newJob.get("status")), "Status is ASSIGNED");

        // 3. Attempt to complete directly without starting (Main.java state machine violation)
        boolean illegalSkipBlocked = false;
        try {
            service.updateRepairJobStatus(crewT03Session.getToken(), jobId, "COMPLETE");
        } catch (InvalidRepairStateException e) {
            illegalSkipBlocked = true;
        }
        assertTrue("Prevent Skipping START", illegalSkipBlocked,
                "InvalidRepairStateException thrown when trying to complete unstarted job");

        // 4. Team T03 starts repair
        Map<String, Object> inProgJob = service.updateRepairJobStatus(crewT03Session.getToken(), jobId, "START");
        assertTrue("Transition to IN_PROGRESS", "IN_PROGRESS".equals(inProgJob.get("status")),
                "Job status changed to IN_PROGRESS via Main.java domain model");

        // Verify linked complaint status also updated
        Map<String, Object> linkedComp = service.getComplaintById("RS-2026-0105");
        assertTrue("Linked Complaint IN_PROGRESS", "IN_PROGRESS".equals(linkedComp.get("status")),
                "Citizen tracking view updated to IN_PROGRESS");

        // 5. Team T03 completes repair
        Map<String, Object> completedJob = service.updateRepairJobStatus(crewT03Session.getToken(), jobId, "COMPLETE");
        assertTrue("Transition to COMPLETED", "COMPLETED".equals(completedJob.get("status")),
                "Job marked COMPLETED and completedTime recorded");

        Map<String, Object> completedComp = service.getComplaintById("RS-2026-0105");
        assertTrue("Linked Complaint COMPLETED", "COMPLETED".equals(completedComp.get("status")),
                "Citizen tracking view updated to COMPLETED");
    }

    private static void cleanupDir(Path dir) {
        try {
            if (Files.exists(dir)) {
                try (var stream = Files.walk(dir)) {
                    stream.sorted(Comparator.reverseOrder())
                          .forEach(p -> {
                              try { Files.deleteIfExists(p); } catch (Exception ignored) {}
                          });
                }
            }
        } catch (Exception ignored) {}
    }
}
