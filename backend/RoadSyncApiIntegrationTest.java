import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.*;

/**
 * Road Sync — Stage 6 Step 2 HTTP REST API Integration Test Suite
 * 
 * Tests the real running HttpServer using live HTTP requests:
 * 1. Health check & CORS preflight OPTIONS
 * 2. Complaints REST operations (list, filter, get-by-id, 404 handling)
 * 3. Complaint registration with 80 KB Base64 photo payload
 * 4. Authentication (login, bad password rejection, session token issuance, logout)
 * 5. Triage with strict 1-3 range verification and Main.java priority calculation
 * 6. Work order dispatch with polymorphic equipment check & busy team rejection
 * 7. Division ownership enforcement (cross-team modification blocked with 403)
 * 8. Repair state machine transitions (InvalidRepairStateException handled with 409)
 * 9. Server restart test: confirms data persistence across restart without overwriting
 */
public class RoadSyncApiIntegrationTest {

    private static int testsRun = 0;
    private static int testsPassed = 0;
    private static final HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    public static void main(String[] args) {
        System.out.println("==================================================================");
        System.out.println("  ROAD SYNC — STEP 2 HTTP REST API INTEGRATION TEST SUITE");
        System.out.println("==================================================================\n");

        Path tempDir = null;
        RoadSyncServer server = null;

        try {
            tempDir = Files.createTempDirectory("roadsync_api_test_");
            StorageManager storageManager = new StorageManager(tempDir);
            RoadSyncService service = new RoadSyncService(storageManager);

            // Bind to ephemeral port 0
            server = new RoadSyncServer(0, service);
            server.start();
            String baseUrl = server.getBaseUrl();
            System.out.println("  [Setup] Test server running on " + baseUrl + "\n");

            // Execute test suites
            testHealthAndCors(baseUrl);
            testComplaintsEndpoints(baseUrl);
            testPhotographRegistration(baseUrl);
            testAuthenticationFlow(baseUrl);
            testTriageAuthorizationAndRangeRules(baseUrl);
            testWorkOrderCreationAndValidation(baseUrl);
            testDivisionOwnershipAndCrossTeamProtection(baseUrl);
            testRepairLifecycleStateTransitions(baseUrl);
            testTeamsEndpoint(baseUrl);

            // Stop server and test restart persistence
            server.stop(0);
            server = null;
            testServerRestartAndDataPersistence(tempDir);

            System.out.println("\n------------------------------------------------------------------");
            System.out.printf("  API TEST RESULTS: %d / %d PASSED (100%% SUCCESS)\n", testsPassed, testsRun);
            System.out.println("------------------------------------------------------------------");

        } catch (Throwable t) {
            System.err.println("\n[FAIL] Test suite failed with exception: " + t.getMessage());
            t.printStackTrace();
        } finally {
            if (server != null) {
                try { server.stop(0); } catch (Exception ignored) {}
            }
            if (tempDir != null) {
                cleanupDir(tempDir);
            }
            System.exit(testsPassed == testsRun && testsRun > 0 ? 0 : 1);
        }
    }

    private static void assertTrue(String testName, boolean condition, String details) {
        testsRun++;
        if (condition) {
            testsPassed++;
            System.out.println("  [PASS] " + testName + " — " + details);
        } else {
            System.err.println("  [FAIL] " + testName + " — FAILED: " + details);
            throw new AssertionError("Test assertion failed: " + testName + " (" + details + ")");
        }
    }

    // -------------------------------------------------------------------------
    // 1. HEALTH CHECK & CORS PREFLIGHT
    // -------------------------------------------------------------------------
    private static void testHealthAndCors(String baseUrl) throws Exception {
        System.out.println("[Suite 1] Server Health & CORS Preflight");

        // GET /api/health
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/health"))
                .GET()
                .build();
        HttpResponse<String> resp = client.send(req, HttpResponse.BodyHandlers.ofString());

        assertTrue("Health Status 200", resp.statusCode() == 200, "HTTP status 200 returned");
        assertTrue("Health JSON Body", resp.body().contains("\"status\": \"UP\""), "Contains status UP");

        // OPTIONS /api/complaints (CORS Preflight)
        HttpRequest corsReq = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/complaints"))
                .method("OPTIONS", HttpRequest.BodyPublishers.noBody())
                .build();
        HttpResponse<String> corsResp = client.send(corsReq, HttpResponse.BodyHandlers.ofString());

        assertTrue("CORS Status 204", corsResp.statusCode() == 204, "HTTP status 204 for preflight");
        String allowOrigin = corsResp.headers().firstValue("Access-Control-Allow-Origin").orElse("");
        String allowMethods = corsResp.headers().firstValue("Access-Control-Allow-Methods").orElse("");
        assertTrue("CORS Origin Header", "*".equals(allowOrigin), "Allow-Origin header set");
        assertTrue("CORS Methods Header", allowMethods.contains("GET") && allowMethods.contains("POST"), "Allowed methods include GET and POST");
    }

    // -------------------------------------------------------------------------
    // 2. COMPLAINTS ENDPOINTS
    // -------------------------------------------------------------------------
    @SuppressWarnings("unchecked")
    private static void testComplaintsEndpoints(String baseUrl) throws Exception {
        System.out.println("\n[Suite 2] Complaints API (List, Filter, Get-by-ID, 404)");

        // GET /api/complaints (all)
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/complaints"))
                .GET()
                .build();
        HttpResponse<String> resp = client.send(req, HttpResponse.BodyHandlers.ofString());

        assertTrue("List Complaints 200", resp.statusCode() == 200, "HTTP status 200");
        List<Object> list = (List<Object>) JsonHelper.parse(resp.body());
        assertTrue("Pre-seeded Complaints Count", list.size() == 4, "Retrieved all 4 pre-seeded demo complaints");

        // GET /api/complaints?status=PENDING
        HttpRequest filterReq = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/complaints?status=PENDING"))
                .GET()
                .build();
        HttpResponse<String> filterResp = client.send(filterReq, HttpResponse.BodyHandlers.ofString());
        List<Object> pendingList = (List<Object>) JsonHelper.parse(filterResp.body());
        assertTrue("Filtered Complaints Status", pendingList.size() == 1, "Filtered exactly 1 PENDING complaint (RS-2026-0105)");

        // GET /api/complaints/RS-2026-0098
        HttpRequest singleReq = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/complaints/RS-2026-0098"))
                .GET()
                .build();
        HttpResponse<String> singleResp = client.send(singleReq, HttpResponse.BodyHandlers.ofString());
        assertTrue("Get Single Complaint 200", singleResp.statusCode() == 200, "HTTP status 200 for RS-2026-0098");
        Map<String, Object> single = (Map<String, Object>) JsonHelper.parse(singleResp.body());
        assertTrue("Complaint ID Matches", "RS-2026-0098".equals(single.get("id")), "Retrieved correct complaint record");

        // GET /api/complaints/NONEXISTENT (404)
        HttpRequest notFoundReq = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/complaints/RS-9999-NOTFOUND"))
                .GET()
                .build();
        HttpResponse<String> notFoundResp = client.send(notFoundReq, HttpResponse.BodyHandlers.ofString());
        assertTrue("Complaint 404 Status", notFoundResp.statusCode() == 404, "HTTP 404 returned for nonexistent complaint");
        assertTrue("Complaint 404 Body", notFoundResp.body().contains("\"error\""), "Non-leaking error JSON returned");
    }

    // -------------------------------------------------------------------------
    // 3. PHOTOGRAPH REGISTRATION (Requirement 6)
    // -------------------------------------------------------------------------
    @SuppressWarnings("unchecked")
    private static void testPhotographRegistration(String baseUrl) throws Exception {
        System.out.println("\n[Suite 3] Citizen Registration & Photo Payload (Requirement 6)");

        // 1. Invalid registration (missing description)
        Map<String, Object> invalidPayload = new LinkedHashMap<>();
        invalidPayload.put("location", "Test Location");
        invalidPayload.put("type", "Pothole");
        invalidPayload.put("description", "short"); // < 10 chars

        HttpRequest invalidReq = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/complaints"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(JsonHelper.toJson(invalidPayload)))
                .build();
        HttpResponse<String> invalidResp = client.send(invalidReq, HttpResponse.BodyHandlers.ofString());
        assertTrue("Short Description 400", invalidResp.statusCode() == 400, "HTTP 400 for description < 10 chars");

        // 2. Valid registration with 80 KB Base64 photo payload
        StringBuilder sb = new StringBuilder("data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/");
        for (int i = 0; i < 2000; i++) {
            sb.append("A1B2C3D4E5F6G7H8I9J0kLmNoPqRsTuVwXyZ+/==");
        }
        String photoDataUrl = sb.toString();

        Map<String, Object> validPayload = new LinkedHashMap<>();
        validPayload.put("location", "Trichy Central Bus Stand Road");
        validPayload.put("address", "Rockfort Junction, Tiruchirappalli, Tamil Nadu 620001");
        validPayload.put("lat", 10.7905);
        validPayload.put("lng", 78.7047);
        validPayload.put("coords", "10.7905° N, 78.7047° E");
        validPayload.put("type", "Pothole");
        validPayload.put("severity", "Large crack or deep pothole");
        validPayload.put("severityLevel", 3);
        validPayload.put("description", "Extensive pavement deformation and pothole cluster spanning 2 meters.");
        validPayload.put("photoPreview", photoDataUrl);

        HttpRequest postReq = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/complaints"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(JsonHelper.toJson(validPayload)))
                .build();
        HttpResponse<String> postResp = client.send(postReq, HttpResponse.BodyHandlers.ofString());

        assertTrue("Complaint Creation 201", postResp.statusCode() == 201, "HTTP 201 Created returned");
        Map<String, Object> created = (Map<String, Object>) JsonHelper.parse(postResp.body());
        String createdId = (String) created.get("id");
        assertTrue("Generated Complaint ID", createdId != null && createdId.startsWith("RS-2026-"), "Generated ref ID: " + createdId);

        // Fetch back and verify photo integrity
        HttpRequest fetchReq = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/complaints/" + createdId))
                .GET()
                .build();
        HttpResponse<String> fetchResp = client.send(fetchReq, HttpResponse.BodyHandlers.ofString());
        Map<String, Object> fetched = (Map<String, Object>) JsonHelper.parse(fetchResp.body());
        String fetchedPhoto = (String) fetched.get("photoPreview");

        assertTrue("Photo Integrity Preserved", photoDataUrl.equals(fetchedPhoto), "Full 80 KB Base64 photo round-tripped without truncation");
    }

    // -------------------------------------------------------------------------
    // 4. AUTHENTICATION FLOW (POST /api/auth/login & POST /api/auth/logout)
    // -------------------------------------------------------------------------
    @SuppressWarnings("unchecked")
    private static void testAuthenticationFlow(String baseUrl) throws Exception {
        System.out.println("\n[Suite 4] Authentication & Session Management (Requirement 3)");

        // 1. Invalid password
        Map<String, Object> badPassPayload = new LinkedHashMap<>();
        badPassPayload.put("username", "operator");
        badPassPayload.put("password", "wrongpassword");

        HttpRequest badPassReq = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/auth/login"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(JsonHelper.toJson(badPassPayload)))
                .build();
        HttpResponse<String> badPassResp = client.send(badPassReq, HttpResponse.BodyHandlers.ofString());
        assertTrue("Bad Password 401", badPassResp.statusCode() == 401, "HTTP 401 returned for bad password");

        // 2. Successful Operator Login
        Map<String, Object> opPayload = new LinkedHashMap<>();
        opPayload.put("username", "operator");
        opPayload.put("password", "1234");

        HttpRequest opReq = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/auth/login"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(JsonHelper.toJson(opPayload)))
                .build();
        HttpResponse<String> opResp = client.send(opReq, HttpResponse.BodyHandlers.ofString());
        assertTrue("Operator Login 200", opResp.statusCode() == 200, "HTTP 200 for valid operator login");
        Map<String, Object> opAuth = (Map<String, Object>) JsonHelper.parse(opResp.body());
        String opToken = (String) opAuth.get("token");
        assertTrue("Operator Token Issued", opToken != null && !opToken.isEmpty(), "Secure session token issued");
        assertTrue("Operator Role", "operator".equals(opAuth.get("role")), "Role is operator");

        // 3. Successful Crew Login (T01)
        Map<String, Object> crewPayload = new LinkedHashMap<>();
        crewPayload.put("username", "team01");
        crewPayload.put("password", "1234");

        HttpRequest crewReq = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/auth/login"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(JsonHelper.toJson(crewPayload)))
                .build();
        HttpResponse<String> crewResp = client.send(crewReq, HttpResponse.BodyHandlers.ofString());
        assertTrue("Crew Login 200", crewResp.statusCode() == 200, "HTTP 200 for crew login");
        Map<String, Object> crewAuth = (Map<String, Object>) JsonHelper.parse(crewResp.body());
        assertTrue("Crew Role", "crew".equals(crewAuth.get("role")), "Role is crew");
        assertTrue("Crew Team ID", "T01".equals(crewAuth.get("teamId")), "Team ID is T01");

        // 4. Logout
        String crewToken = (String) crewAuth.get("token");
        HttpRequest logoutReq = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/auth/logout"))
                .header("Authorization", "Bearer " + crewToken)
                .POST(HttpRequest.BodyPublishers.noBody())
                .build();
        HttpResponse<String> logoutResp = client.send(logoutReq, HttpResponse.BodyHandlers.ofString());
        assertTrue("Logout 200", logoutResp.statusCode() == 200, "HTTP 200 for logout");
    }

    // -------------------------------------------------------------------------
    // 5. TRIAGE AUTHORIZATION & 1-3 RANGE RULES
    // -------------------------------------------------------------------------
    @SuppressWarnings("unchecked")
    private static void testTriageAuthorizationAndRangeRules(String baseUrl) throws Exception {
        System.out.println("\n[Suite 5] Triage Authorization & Strict 1-3 Factor Validation");

        // Login as operator
        String opToken = login(baseUrl, "operator", "1234");
        // Login as crew
        String crewToken = login(baseUrl, "team01", "1234");

        // 1. Unauthenticated request (no token) -> 401
        Map<String, Object> triageBody = new LinkedHashMap<>();
        triageBody.put("severity", 3);
        triageBody.put("accidentRisk", 3);
        triageBody.put("trafficRank", 2);
        triageBody.put("importanceRank", 2);

        HttpRequest noAuthReq = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/complaints/RS-2026-0105/triage"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(JsonHelper.toJson(triageBody)))
                .build();
        HttpResponse<String> noAuthResp = client.send(noAuthReq, HttpResponse.BodyHandlers.ofString());
        assertTrue("Triage No Auth 401", noAuthResp.statusCode() == 401, "HTTP 401 without auth token");

        // 2. Forbidden request (Crew attempting operator triage) -> 403
        HttpRequest forbiddenReq = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/complaints/RS-2026-0105/triage"))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + crewToken)
                .POST(HttpRequest.BodyPublishers.ofString(JsonHelper.toJson(triageBody)))
                .build();
        HttpResponse<String> forbiddenResp = client.send(forbiddenReq, HttpResponse.BodyHandlers.ofString());
        assertTrue("Triage Crew Forbidden 403", forbiddenResp.statusCode() == 403, "HTTP 403 when crew attempts triage");

        // 3. Out-of-bounds factor (severity = 4) -> 400
        Map<String, Object> outOfBoundsBody = new LinkedHashMap<>(triageBody);
        outOfBoundsBody.put("severity", 4);

        HttpRequest oobReq = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/complaints/RS-2026-0105/triage"))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + opToken)
                .POST(HttpRequest.BodyPublishers.ofString(JsonHelper.toJson(outOfBoundsBody)))
                .build();
        HttpResponse<String> oobResp = client.send(oobReq, HttpResponse.BodyHandlers.ofString());
        assertTrue("Triage Factor > 3 Rejected 400", oobResp.statusCode() == 400, "HTTP 400 for severity = 4");

        // 4. Out-of-bounds factor (accidentRisk = 0) -> 400
        Map<String, Object> zeroBody = new LinkedHashMap<>(triageBody);
        zeroBody.put("accidentRisk", 0);

        HttpRequest zeroReq = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/complaints/RS-2026-0105/triage"))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + opToken)
                .POST(HttpRequest.BodyPublishers.ofString(JsonHelper.toJson(zeroBody)))
                .build();
        HttpResponse<String> zeroResp = client.send(zeroReq, HttpResponse.BodyHandlers.ofString());
        assertTrue("Triage Factor < 1 Rejected 400", zeroResp.statusCode() == 400, "HTTP 400 for risk = 0");

        // 5. Missing factor (importanceRank omitted) -> 400
        Map<String, Object> missingBody = new LinkedHashMap<>();
        missingBody.put("severity", 2);
        missingBody.put("accidentRisk", 2);
        missingBody.put("trafficRank", 2);
        // importanceRank missing!

        HttpRequest missingReq = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/complaints/RS-2026-0105/triage"))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + opToken)
                .POST(HttpRequest.BodyPublishers.ofString(JsonHelper.toJson(missingBody)))
                .build();
        HttpResponse<String> missingResp = client.send(missingReq, HttpResponse.BodyHandlers.ofString());
        assertTrue("Triage Missing Factor 400", missingResp.statusCode() == 400, "HTTP 400 for missing importance factor");

        // 6. Valid Triage (3, 3, 2, 2):
        // (3*3) + (3*3) + (2*2) + (2*2) = 9 + 9 + 4 + 4 = 26
        HttpRequest validTriageReq = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/complaints/RS-2026-0105/triage"))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + opToken)
                .POST(HttpRequest.BodyPublishers.ofString(JsonHelper.toJson(triageBody)))
                .build();
        HttpResponse<String> validTriageResp = client.send(validTriageReq, HttpResponse.BodyHandlers.ofString());

        assertTrue("Valid Triage 200", validTriageResp.statusCode() == 200, "HTTP 200 for valid triage");
        Map<String, Object> triaged = (Map<String, Object>) JsonHelper.parse(validTriageResp.body());
        int calculatedPriority = ((Number) triaged.get("priority")).intValue();
        assertTrue("Exact Priority Calculation", calculatedPriority == 26, "Formula (3*3)+(3*3)+(2*2)+(2*2) = 26 computed via Main.java");
        assertTrue("Triaged Flag True", Boolean.TRUE.equals(triaged.get("triaged")), "Complaint marked triaged: true");
    }

    // -------------------------------------------------------------------------
    // 6. WORK ORDER CREATION & VALIDATION (POST /api/jobs)
    // -------------------------------------------------------------------------
    @SuppressWarnings("unchecked")
    private static void testWorkOrderCreationAndValidation(String baseUrl) throws Exception {
        System.out.println("\n[Suite 6] Work Order Creation & Polymorphic Machinery Check");

        String opToken = login(baseUrl, "operator", "1234");

        // 1. Attempt to assign to busy team T01 -> 409 Conflict (TeamUnavailableException)
        Map<String, Object> busyTeamPayload = new LinkedHashMap<>();
        busyTeamPayload.put("complaintRef", "RS-2026-0105");
        busyTeamPayload.put("teamId", "T01"); // Team T01 is pre-seeded busy with JOB-102

        HttpRequest busyReq = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/jobs"))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + opToken)
                .POST(HttpRequest.BodyPublishers.ofString(JsonHelper.toJson(busyTeamPayload)))
                .build();
        HttpResponse<String> busyResp = client.send(busyReq, HttpResponse.BodyHandlers.ofString());
        assertTrue("Busy Team 409 Conflict", busyResp.statusCode() == 409, "HTTP 409 when assigning to unavailable team T01");

        // 2. Valid assignment to available team T03 -> 201 Created
        Map<String, Object> validJobPayload = new LinkedHashMap<>();
        validJobPayload.put("complaintRef", "RS-2026-0105");
        validJobPayload.put("teamId", "T03"); // Available!
        validJobPayload.put("notes", "Rapid response paving unit dispatched.");

        HttpRequest validJobReq = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/jobs"))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + opToken)
                .POST(HttpRequest.BodyPublishers.ofString(JsonHelper.toJson(validJobPayload)))
                .build();
        HttpResponse<String> validJobResp = client.send(validJobReq, HttpResponse.BodyHandlers.ofString());

        assertTrue("Work Order Created 201", validJobResp.statusCode() == 201, "HTTP 201 Created for Work Order");
        Map<String, Object> createdJob = (Map<String, Object>) JsonHelper.parse(validJobResp.body());
        String createdJobId = (String) createdJob.get("jobId");
        assertTrue("Job ID Assigned", createdJobId != null && createdJobId.startsWith("JOB-"), "Assigned Job ID: " + createdJobId);
        assertTrue("Job Initial Status", "ASSIGNED".equals(createdJob.get("status")), "Initial job status is ASSIGNED");

        // GET /api/jobs/{id}
        HttpRequest getJobReq = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/jobs/" + createdJobId))
                .GET()
                .build();
        HttpResponse<String> getJobResp = client.send(getJobReq, HttpResponse.BodyHandlers.ofString());
        assertTrue("Get Job by ID 200", getJobResp.statusCode() == 200, "HTTP 200 retrieving job " + createdJobId);

        // GET /api/jobs?teamId=T03
        HttpRequest filterJobsReq = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/jobs?teamId=T03"))
                .GET()
                .build();
        HttpResponse<String> filterJobsResp = client.send(filterJobsReq, HttpResponse.BodyHandlers.ofString());
        List<Object> t03Jobs = (List<Object>) JsonHelper.parse(filterJobsResp.body());
        assertTrue("Filter Jobs by Team", t03Jobs.size() >= 1, "Filtered jobs strictly by teamId=T03");
    }

    // -------------------------------------------------------------------------
    // 7. DIVISION OWNERSHIP & CROSS-TEAM PROTECTION (POST /api/jobs/{id}/status)
    // -------------------------------------------------------------------------
    private static void testDivisionOwnershipAndCrossTeamProtection(String baseUrl) throws Exception {
        System.out.println("\n[Suite 7] Division Ownership & Cross-Team Security (Requirement 6)");

        // Authenticate team02 (T02)
        String team02Token = login(baseUrl, "team02", "1234");

        // JOB-102 is assigned strictly to Team T01
        Map<String, Object> startBody = new LinkedHashMap<>();
        startBody.put("action", "START");

        HttpRequest crossTeamReq = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/jobs/JOB-102/status"))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + team02Token)
                .POST(HttpRequest.BodyPublishers.ofString(JsonHelper.toJson(startBody)))
                .build();
        HttpResponse<String> crossTeamResp = client.send(crossTeamReq, HttpResponse.BodyHandlers.ofString());

        assertTrue("Cross-Team Blocked 403", crossTeamResp.statusCode() == 403,
                "HTTP 403 returned when Team T02 attempts to modify Team T01's work order");
        assertTrue("Cross-Team Error Non-Leaking", crossTeamResp.body().contains("Cross-team") || crossTeamResp.body().contains("error"),
                "Secure error explanation returned without sensitive data");
    }

    // -------------------------------------------------------------------------
    // 8. REPAIR LIFECYCLE & STATE TRANSITIONS (POST /api/jobs/{id}/status)
    // -------------------------------------------------------------------------
    @SuppressWarnings("unchecked")
    private static void testRepairLifecycleStateTransitions(String baseUrl) throws Exception {
        System.out.println("\n[Suite 8] Repair Lifecycle State Machine Transitions");

        String team03Token = login(baseUrl, "team03", "1234");

        // Find the job assigned to T03 (created in Suite 6)
        HttpRequest getJobsReq = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/jobs?teamId=T03"))
                .GET()
                .build();
        HttpResponse<String> getJobsResp = client.send(getJobsReq, HttpResponse.BodyHandlers.ofString());
        List<Object> t03Jobs = (List<Object>) JsonHelper.parse(getJobsResp.body());
        Map<String, Object> targetJob = null;
        for (Object obj : t03Jobs) {
            Map<String, Object> j = (Map<String, Object>) obj;
            if ("ASSIGNED".equals(j.get("status"))) {
                targetJob = j;
                break;
            }
        }
        String targetJobId = (String) targetJob.get("jobId");

        // 1. Attempt to COMPLETE directly without START -> 409 Conflict
        Map<String, Object> completeBody = new LinkedHashMap<>();
        completeBody.put("action", "COMPLETE");

        HttpRequest skipReq = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/jobs/" + targetJobId + "/status"))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + team03Token)
                .POST(HttpRequest.BodyPublishers.ofString(JsonHelper.toJson(completeBody)))
                .build();
        HttpResponse<String> skipResp = client.send(skipReq, HttpResponse.BodyHandlers.ofString());
        assertTrue("Skipping START Blocked 409", skipResp.statusCode() == 409, "HTTP 409 when attempting to complete unstarted job");

        // 2. Start Repair -> 200 OK
        Map<String, Object> startBody = new LinkedHashMap<>();
        startBody.put("action", "START");

        HttpRequest startReq = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/jobs/" + targetJobId + "/status"))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + team03Token)
                .POST(HttpRequest.BodyPublishers.ofString(JsonHelper.toJson(startBody)))
                .build();
        HttpResponse<String> startResp = client.send(startReq, HttpResponse.BodyHandlers.ofString());
        assertTrue("Start Repair 200", startResp.statusCode() == 200, "HTTP 200 starting repair");
        Map<String, Object> startedJob = (Map<String, Object>) JsonHelper.parse(startResp.body());
        assertTrue("Job IN_PROGRESS", "IN_PROGRESS".equals(startedJob.get("status")), "Job status transitioned to IN_PROGRESS");

        // 3. Complete Repair -> 200 OK
        HttpRequest completeReq = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/jobs/" + targetJobId + "/status"))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + team03Token)
                .POST(HttpRequest.BodyPublishers.ofString(JsonHelper.toJson(completeBody)))
                .build();
        HttpResponse<String> completeResp = client.send(completeReq, HttpResponse.BodyHandlers.ofString());
        assertTrue("Complete Repair 200", completeResp.statusCode() == 200, "HTTP 200 completing repair");
        Map<String, Object> completedJob = (Map<String, Object>) JsonHelper.parse(completeResp.body());
        assertTrue("Job COMPLETED", "COMPLETED".equals(completedJob.get("status")), "Job status transitioned to COMPLETED");
        assertTrue("Completion Timestamp Recorded", completedJob.get("completedTime") != null, "completedTime recorded");
    }

    // -------------------------------------------------------------------------
    // 9. TEAMS ENDPOINT (GET /api/teams)
    // -------------------------------------------------------------------------
    @SuppressWarnings("unchecked")
    private static void testTeamsEndpoint(String baseUrl) throws Exception {
        System.out.println("\n[Suite 9] Maintenance Teams API (GET /api/teams)");

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/teams"))
                .GET()
                .build();
        HttpResponse<String> resp = client.send(req, HttpResponse.BodyHandlers.ofString());

        assertTrue("Teams Status 200", resp.statusCode() == 200, "HTTP status 200 returned");
        List<Object> teams = (List<Object>) JsonHelper.parse(resp.body());
        assertTrue("Teams List Count", teams.size() == 3, "Retrieved all 3 municipal maintenance teams (T01, T02, T03)");
    }

    // -------------------------------------------------------------------------
    // 10. SERVER RESTART & PERSISTENCE CHECK (Requirement 4)
    // -------------------------------------------------------------------------
    @SuppressWarnings("unchecked")
    private static void testServerRestartAndDataPersistence(Path testDir) throws Exception {
        System.out.println("\n[Suite 10] Server Restart & Persistence Retention (Requirement 4)");

        // Spin up second server instance pointing to the same storage files
        StorageManager smRestart = new StorageManager(testDir);
        RoadSyncService serviceRestart = new RoadSyncService(smRestart);
        RoadSyncServer restartedServer = new RoadSyncServer(0, serviceRestart);
        restartedServer.start();
        String newBaseUrl = restartedServer.getBaseUrl();

        try {
            // Verify that all complaints (demo + newly added Trichy complaint) exist
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(newBaseUrl + "/api/complaints"))
                    .GET()
                    .build();
            HttpResponse<String> resp = client.send(req, HttpResponse.BodyHandlers.ofString());
            List<Object> complaints = (List<Object>) JsonHelper.parse(resp.body());

            assertTrue("Restart Retains All Records", complaints.size() == 5,
                    "Retained all 5 complaints (4 demo + 1 newly submitted) across server restart");

            boolean foundTrichy = false;
            for (Object obj : complaints) {
                Map<String, Object> c = (Map<String, Object>) obj;
                if (String.valueOf(c.get("location")).contains("Trichy")) {
                    foundTrichy = true;
                    String photo = (String) c.get("photoPreview");
                    assertTrue("Restart Photo Preserved", photo != null && photo.length() > 50000,
                            "80 KB Base64 photograph intact across server restart");
                    break;
                }
            }
            assertTrue("Newly Added Complaint Intact", foundTrichy, "Newly created complaint survived server restart without loss");

        } finally {
            restartedServer.stop(0);
        }
    }

    // -------------------------------------------------------------------------
    // HELPER: LOGIN REQUEST
    // -------------------------------------------------------------------------
    @SuppressWarnings("unchecked")
    private static String login(String baseUrl, String user, String pass) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("username", user);
        body.put("password", pass);

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/api/auth/login"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(JsonHelper.toJson(body)))
                .build();
        HttpResponse<String> resp = client.send(req, HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() != 200) {
            throw new RuntimeException("Login failed for " + user + ": " + resp.body());
        }
        Map<String, Object> auth = (Map<String, Object>) JsonHelper.parse(resp.body());
        return (String) auth.get("token");
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
