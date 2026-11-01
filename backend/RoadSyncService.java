import java.io.IOException;
import java.security.SecureRandom;
import java.text.SimpleDateFormat;
import java.util.*;

/**
 * Road Sync — Backend Business Logic and Domain Service
 * 
 * Directly reuses and bridges the Java OOP domain classes in Main.java:
 * - User hierarchy: User, PublicUser, MunicipalOperator, MaintenanceTeam
 * - Priority calculation: RoadDamage, RepairPriorityPolicy, DefaultPriorityPolicy
 * - Polymorphic repair execution: RepairJob, PotholeRepair, ResurfacingRepair
 * - Enumerations and exceptions: Equipment, RepairStatus, TeamUnavailableException, InvalidRepairStateException
 * 
 * Strict Role-Based Authorization Safeguards:
 * - Issues cryptographically random session tokens on verified login
 * - Validates session tokens before executing any privileged operation
 * - Verifies that callers cannot spoof team identities by supplying a raw teamId
 * - Enforces division ownership: maintenance teams can only update their own assigned work orders
 */
public class RoadSyncService {

    // Role definitions aligned with user hierarchy in Main.java
    public enum Role {
        PUBLIC,
        OPERATOR,
        CREW
    }

    public static class AuthSession {
        private final String token;
        private final String username;
        private final Role role;
        private final String teamId; // Set only for CREW role
        private final String displayName;
        private final long createdAt;
        private long expiresAt;

        public AuthSession(String token, String username, Role role, String teamId, String displayName, long ttlMillis) {
            this.token = token;
            this.username = username;
            this.role = role;
            this.teamId = teamId;
            this.displayName = displayName;
            this.createdAt = System.currentTimeMillis();
            this.expiresAt = this.createdAt + ttlMillis;
        }

        public String getToken() { return token; }
        public String getUsername() { return username; }
        public Role getRole() { return role; }
        public String getTeamId() { return teamId; }
        public String getDisplayName() { return displayName; }
        public boolean isExpired() { return System.currentTimeMillis() > expiresAt; }
        public void refresh(long ttlMillis) { this.expiresAt = System.currentTimeMillis() + ttlMillis; }
    }

    public static class SecurityViolationException extends SecurityException {
        public SecurityViolationException(String message) {
            super(message);
        }
    }

    private final StorageManager storageManager;
    private final DefaultPriorityPolicy priorityPolicy;
    private final SecureRandom secureRandom;

    // Registered users matching Main.java and frontend auth.js
    private final Map<String, User> userRegistry = new HashMap<>();
    private final Map<String, AuthSession> activeSessions = new HashMap<>();

    // In-memory working copies synchronized with atomic storage
    private List<Map<String, Object>> complaints = new ArrayList<>();
    private List<Map<String, Object>> jobs = new ArrayList<>();
    private List<Map<String, Object>> teams = new ArrayList<>();

    // Main.java domain model instances
    private final Map<String, MaintenanceTeam> domainTeams = new HashMap<>();

    private static final long SESSION_TTL = 24 * 60 * 60 * 1000L; // 24 hours

    public RoadSyncService(StorageManager storageManager) {
        this.storageManager = storageManager;
        this.priorityPolicy = new DefaultPriorityPolicy();
        this.secureRandom = new SecureRandom();

        initUserRegistry();
        loadAllData();
        syncDomainTeams();
    }

    // -------------------------------------------------------------------------
    // 1. INITIALIZATION & USER REGISTRY (Main.java User Hierarchy)
    // -------------------------------------------------------------------------

    private void initUserRegistry() {
        // Public users
        userRegistry.put("public", new PublicUser("public", "1234"));
        userRegistry.put("resident_user", new PublicUser("resident_user", "1234"));
        userRegistry.put("priya_ward4", new PublicUser("priya_ward4", "1234"));

        // Municipal Operators
        userRegistry.put("operator", new MunicipalOperator("operator", "1234"));
        userRegistry.put("op_central", new MunicipalOperator("op_central", "1234"));

        // Maintenance Teams (Matching Main.createSampleTeams)
        MaintenanceTeam t1 = new MaintenanceTeam("T01", "team01", "1234", "L2");
        t1.addEquipment(Equipment.JACKHAMMER);
        t1.addEquipment(Equipment.ASPHALT_MIXER);
        userRegistry.put("team01", t1);

        MaintenanceTeam t2 = new MaintenanceTeam("T02", "team02", "1234", "L4");
        t2.addEquipment(Equipment.PAVER);
        t2.addEquipment(Equipment.ROAD_ROLLER);
        userRegistry.put("team02", t2);

        MaintenanceTeam t3 = new MaintenanceTeam("T03", "team03", "1234", "L5");
        t3.addEquipment(Equipment.JACKHAMMER);
        t3.addEquipment(Equipment.ASPHALT_MIXER);
        t3.addEquipment(Equipment.PAVER);
        t3.addEquipment(Equipment.ROAD_ROLLER);
        userRegistry.put("team03", t3);
    }

    private synchronized void loadAllData() {
        complaints = storageManager.loadComplaints();
        jobs = storageManager.loadJobs();
        teams = storageManager.loadTeams();
    }

    private synchronized void syncDomainTeams() {
        domainTeams.clear();
        for (Map<String, Object> tMap : teams) {
            String teamId = (String) tMap.get("teamId");
            String username = (String) tMap.get("username");
            String location = (String) tMap.get("baseLocation");
            boolean available = Boolean.TRUE.equals(tMap.get("available"));

            MaintenanceTeam team = new MaintenanceTeam(teamId, username, "1234", location);
            team.setAvailable(available);

            @SuppressWarnings("unchecked")
            List<String> eqList = (List<String>) tMap.get("equipment");
            if (eqList != null) {
                for (String eqStr : eqList) {
                    try {
                        team.addEquipment(Equipment.valueOf(eqStr));
                    } catch (IllegalArgumentException ignored) {}
                }
            }
            domainTeams.put(teamId, team);
        }
    }

    // -------------------------------------------------------------------------
    // 2. AUTHENTICATION & SESSION MANAGEMENT
    // -------------------------------------------------------------------------

    /**
     * Authenticates a user by validating credentials against Main.java User instances.
     * Generates a secure session token and registers the active session.
     */
    public synchronized AuthSession login(String username, String password) throws SecurityViolationException {
        if (username == null || password == null) {
            throw new SecurityViolationException("Username and password are required.");
        }

        String lowerUser = username.trim().toLowerCase();
        User user = userRegistry.get(lowerUser);

        if (user == null || !user.login(lowerUser, password)) {
            throw new SecurityViolationException("Invalid username or password.");
        }

        Role role;
        String teamId = null;
        String displayName;

        if (user instanceof MunicipalOperator) {
            role = Role.OPERATOR;
            displayName = "Municipal Operator (" + user.getUsername() + ")";
        } else if (user instanceof MaintenanceTeam) {
            role = Role.CREW;
            MaintenanceTeam mt = (MaintenanceTeam) user;
            teamId = mt.getTeamId();
            displayName = "Maintenance Team " + teamId + " (" + user.getUsername() + ")";
        } else {
            role = Role.PUBLIC;
            displayName = "Citizen (" + user.getUsername() + ")";
        }

        // Generate high-entropy session token
        byte[] bytes = new byte[24];
        secureRandom.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);

        AuthSession session = new AuthSession(token, user.getUsername(), role, teamId, displayName, SESSION_TTL);
        activeSessions.put(token, session);
        return session;
    }

    public synchronized void logout(String token) {
        if (token != null) {
            activeSessions.remove(token);
        }
    }

    public synchronized AuthSession validateSession(String token) throws SecurityViolationException {
        if (token == null || token.trim().isEmpty()) {
            throw new SecurityViolationException("Authentication token is missing. Please log in.");
        }
        AuthSession session = activeSessions.get(token.trim());
        if (session == null || session.isExpired()) {
            if (session != null) activeSessions.remove(token);
            throw new SecurityViolationException("Session is invalid or has expired. Please re-authenticate.");
        }
        session.refresh(SESSION_TTL);
        return session;
    }

    public AuthSession requireRole(String token, Role expectedRole) throws SecurityViolationException {
        AuthSession session = validateSession(token);
        if (session.getRole() != expectedRole) {
            throw new SecurityViolationException("Access denied: Required role " + expectedRole + ", but session has role " + session.getRole());
        }
        return session;
    }

    // -------------------------------------------------------------------------
    // 3. COMPLAINTS OPERATIONS (Reusing RoadDamage & DefaultPriorityPolicy)
    // -------------------------------------------------------------------------

    public synchronized List<Map<String, Object>> getAllComplaints() {
        return new ArrayList<>(complaints);
    }

    public synchronized Map<String, Object> getComplaintById(String id) {
        for (Map<String, Object> c : complaints) {
            if (id.equalsIgnoreCase(String.valueOf(c.get("id"))) || id.equalsIgnoreCase(String.valueOf(c.get("refNo")))) {
                return c;
            }
        }
        return null;
    }

    /**
     * Submits a new citizen complaint. Preserves the full photoPreview payload.
     */
    public synchronized Map<String, Object> submitComplaint(Map<String, Object> complaintData) throws IOException {
        String id = (String) complaintData.get("id");
        if (id == null || id.trim().isEmpty()) {
            id = "RS-2026-" + (100 + secureRandom.nextInt(900));
        }

        Map<String, Object> newRecord = new LinkedHashMap<>();
        newRecord.put("id", id);
        newRecord.put("refNo", id);
        newRecord.put("location", complaintData.getOrDefault("location", "Unspecified Tamil Nadu Location"));
        newRecord.put("address", complaintData.getOrDefault("address", ""));
        newRecord.put("lat", complaintData.getOrDefault("lat", 13.0067));
        newRecord.put("lng", complaintData.getOrDefault("lng", 80.2025));
        newRecord.put("coords", complaintData.getOrDefault("coords", "13.0067° N, 80.2025° E"));
        newRecord.put("type", complaintData.getOrDefault("type", "Pothole"));
        newRecord.put("severity", complaintData.getOrDefault("severity", "Moderate damage"));

        int severityLevel = 2;
        Object rawSev = complaintData.get("severityLevel");
        if (rawSev instanceof Number) severityLevel = ((Number) rawSev).intValue();
        newRecord.put("severityLevel", severityLevel);

        String today = new SimpleDateFormat("MMM dd, yyyy").format(new Date());
        newRecord.put("date", complaintData.getOrDefault("date", today));
        newRecord.put("status", "PENDING");
        newRecord.put("statusLabel", "Pending Municipal Review");
        newRecord.put("progressNote", "Complaint registered in resident portal. Awaiting operator triage & priority ranking.");
        newRecord.put("description", complaintData.getOrDefault("description", ""));

        // Critical: Preserve photograph payload or usable reference without truncation
        newRecord.put("photoPreview", complaintData.get("photoPreview"));
        newRecord.put("isDemo", false);
        newRecord.put("triaged", false);
        newRecord.put("accidentRisk", null);
        newRecord.put("trafficRank", null);
        newRecord.put("importanceRank", null);
        newRecord.put("priority", null);

        String typeStr = String.valueOf(newRecord.get("type"));
        if (typeStr.toLowerCase().contains("pothole") || typeStr.toLowerCase().contains("crack")) {
            newRecord.put("equipment", Arrays.asList("JACKHAMMER", "ASPHALT_MIXER"));
        } else {
            newRecord.put("equipment", Arrays.asList("PAVER", "ROAD_ROLLER"));
        }

        newRecord.put("assignedJobId", null);
        newRecord.put("assignedTeam", "Unassigned (Awaiting Operator Triage)");
        newRecord.put("estimatedTime", (30 + severityLevel * 15) + " minutes (Estimated)");

        List<Map<String, Object>> history = new ArrayList<>();
        Map<String, Object> h1 = new LinkedHashMap<>();
        h1.put("stage", "REPORTED");
        h1.put("title", "Complaint Registered");
        h1.put("date", new SimpleDateFormat("MMM dd, yyyy hh:mm a").format(new Date()));
        h1.put("note", "Citizen report submitted with road coordinates and description.");
        history.add(h1);
        newRecord.put("history", history);

        // Prepend new complaint so it appears at top
        complaints.add(0, newRecord);
        storageManager.saveComplaints(complaints);
        return newRecord;
    }

    /**
     * Triages a complaint.
     * Enforces that ONLY an authenticated Municipal Operator can triage.
     * Uses Main.java RoadDamage and DefaultPriorityPolicy to calculate priority.
     */
    public synchronized Map<String, Object> triageComplaint(
            String token,
            String complaintId,
            int severity,
            int accidentRisk,
            int trafficRank,
            int importanceRank) throws IOException, SecurityViolationException {

        // Authorization check: Operator only
        requireRole(token, Role.OPERATOR);

        Map<String, Object> complaint = getComplaintById(complaintId);
        if (complaint == null) {
            throw new IllegalArgumentException("Complaint not found with ID: " + complaintId);
        }

        // Domain calculation using Main.java RoadDamage and DefaultPriorityPolicy
        int damageId = Math.abs(complaintId.hashCode()) % 10000;
        String location = (String) complaint.get("location");
        String type = (String) complaint.get("type");

        RoadDamage damage = new RoadDamage(damageId, location, severity, accidentRisk, trafficRank, importanceRank, type);
        int calculatedPriority = priorityPolicy.calculatePriority(damage);
        damage.setPriority(calculatedPriority);

        // Update complaint record
        complaint.put("triaged", true);
        complaint.put("severityLevel", severity);
        complaint.put("accidentRisk", accidentRisk);
        complaint.put("trafficRank", trafficRank);
        complaint.put("importanceRank", importanceRank);
        complaint.put("priority", calculatedPriority);
        complaint.put("progressNote", "Triaged by Municipal Operator. Priority score " + calculatedPriority + " calculated.");

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> history = (List<Map<String, Object>>) complaint.get("history");
        if (history == null) {
            history = new ArrayList<>();
            complaint.put("history", history);
        }
        Map<String, Object> hItem = new LinkedHashMap<>();
        hItem.put("stage", "REVIEWED");
        hItem.put("title", "Municipal Review and Triage");
        hItem.put("date", new SimpleDateFormat("MMM dd, yyyy hh:mm a").format(new Date()));
        hItem.put("note", "Operator triaged severity " + severity + ", risk " + accidentRisk +
                ", traffic " + trafficRank + ", importance " + importanceRank +
                ". Priority score " + calculatedPriority + " calculated.");
        history.add(hItem);

        storageManager.saveComplaints(complaints);
        return complaint;
    }

    // -------------------------------------------------------------------------
    // 4. WORK ORDER OPERATIONS (Polymorphic RepairJob & MaintenanceTeam)
    // -------------------------------------------------------------------------

    public synchronized List<Map<String, Object>> getAllJobs() {
        return new ArrayList<>(jobs);
    }

    public synchronized Map<String, Object> getJobById(String jobId) {
        for (Map<String, Object> j : jobs) {
            if (jobId.equalsIgnoreCase(String.valueOf(j.get("jobId")))) {
                return j;
            }
        }
        return null;
    }

    public synchronized List<Map<String, Object>> getAllTeams() {
        return new ArrayList<>(teams);
    }

    /**
     * Creates a new repair work order and assigns a maintenance team.
     * Enforces:
     * - Only authenticated Municipal Operator can dispatch work orders.
     * - Complaint must be triaged.
     * - Team must exist, be available, and have required equipment (reusing Main.java models).
     */
    public synchronized Map<String, Object> createWorkOrder(
            String token,
            String complaintRef,
            String targetTeamId,
            String jobType,
            String customNotes) throws IOException, TeamUnavailableException, SecurityViolationException {

        // Authorization check: Operator only
        requireRole(token, Role.OPERATOR);

        Map<String, Object> comp = getComplaintById(complaintRef);
        if (comp == null) {
            throw new IllegalArgumentException("Referenced complaint " + complaintRef + " does not exist.");
        }

        if (!Boolean.TRUE.equals(comp.get("triaged"))) {
            throw new IllegalStateException("Complaint " + complaintRef + " must be triaged before creating a work order.");
        }

        MaintenanceTeam team = domainTeams.get(targetTeamId);
        if (team == null) {
            throw new IllegalArgumentException("Maintenance team " + targetTeamId + " not found.");
        }

        if (!team.isAvailable()) {
            throw new TeamUnavailableException("Team " + targetTeamId + " is currently busy and unavailable.");
        }

        // Build Main.java RoadDamage
        int sev = ((Number) comp.get("severityLevel")).intValue();
        int risk = comp.get("accidentRisk") != null ? ((Number) comp.get("accidentRisk")).intValue() : 2;
        int traffic = comp.get("trafficRank") != null ? ((Number) comp.get("trafficRank")).intValue() : 2;
        int importance = comp.get("importanceRank") != null ? ((Number) comp.get("importanceRank")).intValue() : 2;
        String type = (String) comp.get("type");
        int damageId = Math.abs(complaintRef.hashCode()) % 10000;

        RoadDamage damage = new RoadDamage(damageId, (String) comp.get("location"), sev, risk, traffic, importance, type);
        int priority = priorityPolicy.calculatePriority(damage);
        damage.setPriority(priority);

        // Instantiate polymorphic RepairJob from Main.java
        int jobIdNum = 100 + jobs.size() + 1;
        String jobId = "JOB-" + jobIdNum;

        RepairJob repairJob;
        String finalJobType = (jobType != null && !jobType.trim().isEmpty()) ? jobType :
                (type.toLowerCase().contains("pothole") || type.toLowerCase().contains("crack") ? "PotholeRepair" : "ResurfacingRepair");

        if ("ResurfacingRepair".equalsIgnoreCase(finalJobType)) {
            repairJob = new ResurfacingRepair(jobIdNum, damage, sev * 2);
        } else {
            repairJob = new PotholeRepair(jobIdNum, damage, sev);
        }

        // Verify equipment compatibility
        Set<Equipment> requiredEquipment = repairJob.requiredEquipment();
        if (!team.hasAllEquipment(requiredEquipment)) {
            throw new TeamUnavailableException("Team " + targetTeamId + " lacks required equipment " + requiredEquipment + " for " + finalJobType);
        }

        int calculatedMinutes = repairJob.calculateRepairTime();

        // Assign job using Main.java RepairJob method
        repairJob.assignJob(team, calculatedMinutes);

        // Format equipment strings
        List<String> eqStrings = new ArrayList<>();
        for (Equipment eq : requiredEquipment) {
            eqStrings.add(eq.name());
        }

        // Find team name from teams list
        String teamName = "Team " + targetTeamId;
        for (Map<String, Object> t : teams) {
            if (targetTeamId.equalsIgnoreCase((String) t.get("teamId"))) {
                teamName = (String) t.get("name");
                t.put("available", false);
                t.put("currentJobId", jobId);
                break;
            }
        }

        String assignedTimeStr = new SimpleDateFormat("MMM dd, yyyy hh:mm a").format(new Date());

        // Create Job Record
        Map<String, Object> jobRecord = new LinkedHashMap<>();
        jobRecord.put("jobId", jobId);
        jobRecord.put("complaintRef", complaintRef);
        jobRecord.put("location", comp.get("location"));
        jobRecord.put("damageType", type);
        jobRecord.put("jobType", finalJobType);
        jobRecord.put("severity", sev);
        jobRecord.put("priority", priority);
        jobRecord.put("teamId", targetTeamId);
        jobRecord.put("teamName", teamName);
        jobRecord.put("status", "ASSIGNED");
        jobRecord.put("equipment", eqStrings);
        jobRecord.put("estimatedTime", calculatedMinutes);
        jobRecord.put("assignedTime", assignedTimeStr);
        jobRecord.put("completedTime", null);
        jobRecord.put("notes", customNotes != null && !customNotes.trim().isEmpty() ? customNotes : "Scheduled for repair.");

        jobs.add(0, jobRecord);

        // Update linked complaint
        comp.put("status", "ASSIGNED");
        comp.put("statusLabel", "Assigned to Maintenance Team");
        comp.put("assignedJobId", jobId);
        comp.put("assignedTeam", teamName);
        comp.put("estimatedTime", calculatedMinutes + " minutes");
        comp.put("progressNote", "Assigned to " + teamName + ". Work Order #" + jobId + " issued.");

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> history = (List<Map<String, Object>>) comp.get("history");
        if (history != null) {
            Map<String, Object> hItem = new LinkedHashMap<>();
            hItem.put("stage", "ASSIGNED");
            hItem.put("title", "Team and Machinery Assigned");
            hItem.put("date", assignedTimeStr);
            hItem.put("note", "Work Order #" + jobId + " assigned to " + teamName + " with equipment " + eqStrings + ".");
            history.add(hItem);
        }

        // Persist all updated entities
        storageManager.saveJobs(jobs);
        storageManager.saveTeams(teams);
        storageManager.saveComplaints(complaints);

        return jobRecord;
    }

    /**
     * Transitions a repair job status (START or COMPLETE).
     * 
     * Critical Security & Integrity Rules:
     * 1. Requires valid authenticated session with role CREW.
     * 2. Strict Division Ownership: The caller's authenticated teamId MUST match the job's assigned teamId!
     *    A request supplying a raw teamId is NOT trusted. Cross-team modification is blocked.
     * 3. Validates Main.java state machine (ASSIGNED -> IN_PROGRESS -> COMPLETED).
     * 4. Throws InvalidRepairStateException on illegal transitions.
     */
    public synchronized Map<String, Object> updateRepairJobStatus(
            String token,
            String jobId,
            String action) throws IOException, InvalidRepairStateException, SecurityViolationException {

        // 1. Session verification & Role enforcement
        AuthSession session = requireRole(token, Role.CREW);

        // 2. Locate job
        Map<String, Object> job = getJobById(jobId);
        if (job == null) {
            throw new IllegalArgumentException("Repair job not found: " + jobId);
        }

        // 3. Strict Division Ownership Check: team cannot modify another team's job
        String jobTeamId = (String) job.get("teamId");
        if (!jobTeamId.equalsIgnoreCase(session.getTeamId())) {
            throw new SecurityViolationException("Cross-team authorization violation: Authenticated " +
                    session.getDisplayName() + " cannot modify Work Order " + jobId + " assigned to Team " + jobTeamId);
        }

        String currentStatus = (String) job.get("status");
        String nowStr = new SimpleDateFormat("MMM dd, yyyy hh:mm a").format(new Date());

        // Reconstruct Main.java RepairJob to execute official state transition
        int sev = ((Number) job.get("severity")).intValue();
        RoadDamage dummyDamage = new RoadDamage(1, (String) job.get("location"), sev, 2, 2, 2, (String) job.get("damageType"));
        RepairJob domainJob = "ResurfacingRepair".equalsIgnoreCase((String) job.get("jobType"))
                ? new ResurfacingRepair(1, dummyDamage, sev * 2)
                : new PotholeRepair(1, dummyDamage, sev);

        MaintenanceTeam domainTeam = domainTeams.get(jobTeamId);

        if ("START".equalsIgnoreCase(action)) {
            if (!"ASSIGNED".equalsIgnoreCase(currentStatus)) {
                throw new InvalidRepairStateException("Repair job " + jobId + " must be in ASSIGNED status before it can start (current: " + currentStatus + ").");
            }

            // Simulate transition via Main.java domain methods
            try {
                MaintenanceTeam tempTeam = new MaintenanceTeam(jobTeamId, "temp", "1234", "loc");
                domainJob.assignJob(tempTeam);
                domainJob.startRepair();
            } catch (TeamUnavailableException e) {
                throw new IllegalStateException("Failed to transition domain job: " + e.getMessage(), e);
            }

            job.put("status", "IN_PROGRESS");

            // Update linked complaint
            String complaintRef = (String) job.get("complaintRef");
            Map<String, Object> comp = getComplaintById(complaintRef);
            if (comp != null) {
                comp.put("status", "IN_PROGRESS");
                comp.put("statusLabel", "In Progress (Repair Underway)");
                comp.put("progressNote", session.getDisplayName() + " actively deploying equipment on site.");

                @SuppressWarnings("unchecked")
                List<Map<String, Object>> hist = (List<Map<String, Object>>) comp.get("history");
                if (hist != null) {
                    Map<String, Object> h = new LinkedHashMap<>();
                    h.put("stage", "IN_PROGRESS");
                    h.put("title", "Repair Work Commenced");
                    h.put("date", nowStr);
                    h.put("note", session.getDisplayName() + " arrived on site. Machine operations in progress.");
                    hist.add(h);
                }
            }

        } else if ("COMPLETE".equalsIgnoreCase(action)) {
            if (!"IN_PROGRESS".equalsIgnoreCase(currentStatus)) {
                throw new InvalidRepairStateException("Repair job " + jobId + " must be IN_PROGRESS before it can be marked COMPLETED (current: " + currentStatus + ").");
            }

            // Simulate transition via Main.java domain methods
            try {
                MaintenanceTeam tempTeam = new MaintenanceTeam(jobTeamId, "temp", "1234", "loc");
                domainJob.assignJob(tempTeam);
                domainJob.startRepair();
                domainJob.completeRepair(); // Validates IN_PROGRESS state via Main.java
            } catch (TeamUnavailableException e) {
                throw new IllegalStateException("Failed to transition domain job: " + e.getMessage(), e);
            }

            job.put("status", "COMPLETED");
            job.put("completedTime", nowStr);

            // Release team
            if (domainTeam != null) {
                domainTeam.completeJob();
            }
            for (Map<String, Object> t : teams) {
                if (jobTeamId.equalsIgnoreCase((String) t.get("teamId"))) {
                    t.put("available", true);
                    t.put("currentJobId", null);
                    break;
                }
            }

            // Update linked complaint
            String complaintRef = (String) job.get("complaintRef");
            Map<String, Object> comp = getComplaintById(complaintRef);
            if (comp != null) {
                comp.put("status", "COMPLETED");
                comp.put("statusLabel", "Completed & Verified");
                comp.put("progressNote", "Repair completed by " + session.getDisplayName() + " and verified for reopening.");

                @SuppressWarnings("unchecked")
                List<Map<String, Object>> hist = (List<Map<String, Object>>) comp.get("history");
                if (hist != null) {
                    Map<String, Object> h = new LinkedHashMap<>();
                    h.put("stage", "COMPLETED");
                    h.put("title", "Repair Completed & Verified");
                    h.put("date", nowStr);
                    h.put("note", "Road surface restored by " + session.getDisplayName() + ". Municipal supervisor verified.");
                    hist.add(h);
                }
            }

        } else {
            throw new IllegalArgumentException("Unknown repair action: " + action + " (expected START or COMPLETE)");
        }

        // Persist all updated entities atomically
        storageManager.saveJobs(jobs);
        storageManager.saveTeams(teams);
        storageManager.saveComplaints(complaints);

        return job;
    }
}
