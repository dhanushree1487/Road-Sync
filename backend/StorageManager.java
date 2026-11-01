import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.text.SimpleDateFormat;
import java.util.*;

/**
 * Road Sync — Resilient JSON File Persistence Manager
 * 
 * Manages zero-dependency file-based storage for complaints, repair jobs, and maintenance teams:
 * - Atomic write operations using temporary staging files (.tmp) and atomic file moves
 * - Corruption detection and automatic safety backup creation (.corrupted.<timestamp>.bak)
 * - Safe missing-file seeding that preserves demo data and NEVER silently overwrites existing data
 * - Full fidelity preservation of Base64 image payloads (photoPreview) without truncation
 * - Zero third-party dependencies; strictly standard Java (java.nio, java.util, java.io)
 */
public class StorageManager {

    private final Path dataDirectory;
    private final Path complaintsFile;
    private final Path jobsFile;
    private final Path teamsFile;

    // Default constructor uses "./data"
    public StorageManager() {
        this(Paths.get("data"));
    }

    // Constructor with custom directory (useful for testing or staging)
    public StorageManager(Path dataDir) {
        this.dataDirectory = dataDir;
        this.complaintsFile = dataDir.resolve("complaints.json");
        this.jobsFile = dataDir.resolve("jobs.json");
        this.teamsFile = dataDir.resolve("teams.json");
        ensureDirectoryExists();
    }

    public Path getDataDirectory() {
        return dataDirectory;
    }

    public Path getComplaintsFile() {
        return complaintsFile;
    }

    public Path getJobsFile() {
        return jobsFile;
    }

    public Path getTeamsFile() {
        return teamsFile;
    }

    private void ensureDirectoryExists() {
        try {
            if (!Files.exists(dataDirectory)) {
                Files.createDirectories(dataDirectory);
            }
        } catch (IOException e) {
            System.err.println("[StorageManager] Warning: Failed to create storage directory " + dataDirectory + ": " + e.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // ATOMIC PERSISTENCE CORE
    // -------------------------------------------------------------------------

    /**
     * Atomically writes data to a target JSON file.
     * Writes to a temporary staging file first, flushes, and then atomically renames to the target.
     * Prevents partial writes or sudden system interruptions from corrupting existing database files.
     */
    public synchronized void saveJsonAtomically(Path targetPath, Object data) throws IOException {
        ensureDirectoryExists();
        Path tempPath = targetPath.resolveSibling(targetPath.getFileName().toString() + ".tmp");
        String jsonString = JsonHelper.toJson(data);

        // 1. Write fully to temporary file
        Files.writeString(tempPath, jsonString, StandardCharsets.UTF_8,
                StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE);

        // 2. Atomically rename/replace target file
        try {
            Files.move(tempPath, targetPath, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } catch (AtomicMoveNotSupportedException e) {
            // Fall back to standard replace if filesystem does not support atomic move
            Files.move(tempPath, targetPath, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            // Clean up temp file on failure if still exists
            try { Files.deleteIfExists(tempPath); } catch (Exception ignored) {}
            throw e;
        }
    }

    /**
     * Reads and parses a JSON file safely.
     * If the file is missing, returns null so the caller can seed or initialize appropriately.
     * If the file is corrupted/malformed, creates a timestamped safety backup and returns null.
     */
    public synchronized Object loadJsonSafely(Path targetPath) {
        if (!Files.exists(targetPath)) {
            return null;
        }

        try {
            String content = Files.readString(targetPath, StandardCharsets.UTF_8).trim();
            if (content.isEmpty()) {
                return null;
            }
            return JsonHelper.parse(content);
        } catch (JsonHelper.JsonParseException e) {
            System.err.println("[StorageManager] CRITICAL WARNING: File " + targetPath + " contains malformed JSON: " + e.getMessage());
            createCorruptedBackup(targetPath);
            return null;
        } catch (IOException e) {
            System.err.println("[StorageManager] Warning: Error reading " + targetPath + ": " + e.getMessage());
            return null;
        }
    }

    private void createCorruptedBackup(Path targetPath) {
        try {
            String timestamp = new SimpleDateFormat("yyyyMMdd_HHmmss").format(new Date());
            Path backupPath = targetPath.resolveSibling(targetPath.getFileName().toString() + ".corrupted." + timestamp + ".bak");
            Files.copy(targetPath, backupPath, StandardCopyOption.REPLACE_EXISTING);
            System.err.println("[StorageManager] Safety backup created at: " + backupPath);
        } catch (IOException backupEx) {
            System.err.println("[StorageManager] Failed to create corrupted backup copy: " + backupEx.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // COMPLAINTS PERSISTENCE
    // -------------------------------------------------------------------------

    @SuppressWarnings("unchecked")
    public synchronized List<Map<String, Object>> loadComplaints() {
        Object raw = loadJsonSafely(complaintsFile);
        if (raw instanceof List) {
            return (List<Map<String, Object>>) raw;
        }

        // If file does not exist, seed initial demonstration records
        List<Map<String, Object>> initialComplaints = createDefaultDemoComplaints();
        try {
            saveJsonAtomically(complaintsFile, initialComplaints);
            System.out.println("[StorageManager] Seeded initial complaints to " + complaintsFile);
        } catch (IOException e) {
            System.err.println("[StorageManager] Failed to persist initial complaints: " + e.getMessage());
        }
        return initialComplaints;
    }

    public synchronized void saveComplaints(List<Map<String, Object>> complaints) throws IOException {
        saveJsonAtomically(complaintsFile, complaints);
    }

    // -------------------------------------------------------------------------
    // REPAIR JOBS PERSISTENCE
    // -------------------------------------------------------------------------

    @SuppressWarnings("unchecked")
    public synchronized List<Map<String, Object>> loadJobs() {
        Object raw = loadJsonSafely(jobsFile);
        if (raw instanceof List) {
            return (List<Map<String, Object>>) raw;
        }

        // If file does not exist, seed initial demonstration jobs
        List<Map<String, Object>> initialJobs = createDefaultDemoJobs();
        try {
            saveJsonAtomically(jobsFile, initialJobs);
            System.out.println("[StorageManager] Seeded initial repair jobs to " + jobsFile);
        } catch (IOException e) {
            System.err.println("[StorageManager] Failed to persist initial jobs: " + e.getMessage());
        }
        return initialJobs;
    }

    public synchronized void saveJobs(List<Map<String, Object>> jobs) throws IOException {
        saveJsonAtomically(jobsFile, jobs);
    }

    // -------------------------------------------------------------------------
    // MAINTENANCE TEAMS PERSISTENCE
    // -------------------------------------------------------------------------

    @SuppressWarnings("unchecked")
    public synchronized List<Map<String, Object>> loadTeams() {
        Object raw = loadJsonSafely(teamsFile);
        if (raw instanceof List) {
            return (List<Map<String, Object>>) raw;
        }

        // If file does not exist, seed initial teams aligned with Main.java
        List<Map<String, Object>> initialTeams = createDefaultDemoTeams();
        try {
            saveJsonAtomically(teamsFile, initialTeams);
            System.out.println("[StorageManager] Seeded initial maintenance teams to " + teamsFile);
        } catch (IOException e) {
            System.err.println("[StorageManager] Failed to persist initial teams: " + e.getMessage());
        }
        return initialTeams;
    }

    public synchronized void saveTeams(List<Map<String, Object>> teams) throws IOException {
        saveJsonAtomically(teamsFile, teams);
    }

    // -------------------------------------------------------------------------
    // PRE-SEEDED DEMONSTRATION DATA (Preserved from Stage 4 & Stage 5)
    // -------------------------------------------------------------------------

    public static List<Map<String, Object>> createDefaultDemoComplaints() {
        List<Map<String, Object>> list = new ArrayList<>();

        // 1. RS-2026-0098 (Chennai - In Progress)
        Map<String, Object> c1 = new LinkedHashMap<>();
        c1.put("id", "RS-2026-0098");
        c1.put("refNo", "RS-2026-0098");
        c1.put("location", "Anna Salai (Mount Road) - Near Guindy");
        c1.put("address", "Anna Salai Arterial Highway, Near Guindy Junction, Chennai, Tamil Nadu 600032");
        c1.put("lat", 13.0067);
        c1.put("lng", 80.2025);
        c1.put("coords", "13.0067° N, 80.2025° E");
        c1.put("type", "Pothole");
        c1.put("severity", "Large crack or deep pothole");
        c1.put("severityLevel", 3);
        c1.put("date", "Oct 08, 2026");
        c1.put("status", "IN_PROGRESS");
        c1.put("statusLabel", "In Progress (Repair Underway)");
        c1.put("progressNote", "Maintenance Team T01 actively deploying Asphalt Mixer & Road Roller on site.");
        c1.put("description", "Deep pothole approximately 12 cm deep in northbound central lane. Hazardous for two-wheelers during evening peak transit.");
        c1.put("photoPreview", null);
        c1.put("isDemo", true);
        c1.put("triaged", true);
        c1.put("accidentRisk", 3);
        c1.put("trafficRank", 3);
        c1.put("importanceRank", 3);
        c1.put("priority", 30); // (3*3) + (3*3) + (3*2) + (3*2) = 30
        c1.put("equipment", Arrays.asList("ASPHALT_MIXER", "ROAD_ROLLER", "JACKHAMMER"));
        c1.put("assignedJobId", "JOB-102");
        c1.put("assignedTeam", "Team T01 (Chennai South Rapid Unit)");
        c1.put("estimatedTime", "60 minutes");
        List<Map<String, Object>> h1 = new ArrayList<>();
        h1.add(createHistoryItem("REPORTED", "Complaint Registered", "Oct 08, 2026 09:15 AM", "Report logged with Tamil Nadu GPS coordinates and lane details."));
        h1.add(createHistoryItem("REVIEWED", "Municipal Review and Triage", "Oct 08, 2026 10:30 AM", "Operator triaged severity 3, accident risk 3, arterial traffic 3, importance 3. Priority score 30 calculated."));
        h1.add(createHistoryItem("ASSIGNED", "Team and Machinery Assigned", "Oct 08, 2026 01:45 PM", "Work Order #JOB-102 assigned to Team T01 with Asphalt Mixer & Road Roller. Compaction underway."));
        c1.put("history", h1);
        list.add(c1);

        // 2. RS-2026-0084 (Coimbatore - Assigned)
        Map<String, Object> c2 = new LinkedHashMap<>();
        c2.put("id", "RS-2026-0084");
        c2.put("refNo", "RS-2026-0084");
        c2.put("location", "Avinashi Road Corridor - Near Gandhipuram");
        c2.put("address", "Avinashi Road Express Flyover Ramp, Gandhipuram, Coimbatore, Tamil Nadu 641018");
        c2.put("lat", 11.0168);
        c2.put("lng", 76.9558);
        c2.put("coords", "11.0168° N, 76.9558° E");
        c2.put("type", "Uneven road surface");
        c2.put("severity", "Moderate damage");
        c2.put("severityLevel", 2);
        c2.put("date", "Oct 05, 2026");
        c2.put("status", "ASSIGNED");
        c2.put("statusLabel", "Assigned to Maintenance Team");
        c2.put("progressNote", "Assigned to Maintenance Team T02. Scheduled for off-peak evening milling.");
        c2.put("description", "Asphalt rutting and wavy corrugated road surface across 15 meters on the flyover incline. Vehicles experiencing abrupt deceleration.");
        c2.put("photoPreview", null);
        c2.put("isDemo", true);
        c2.put("triaged", true);
        c2.put("accidentRisk", 2);
        c2.put("trafficRank", 2);
        c2.put("importanceRank", 2);
        c2.put("priority", 20); // (2*3) + (2*3) + (2*2) + (2*2) = 20
        c2.put("equipment", Arrays.asList("PAVER", "ROAD_ROLLER"));
        c2.put("assignedJobId", "JOB-101");
        c2.put("assignedTeam", "Team T02 (Coimbatore Central Unit)");
        c2.put("estimatedTime", "90 minutes");
        List<Map<String, Object>> h2 = new ArrayList<>();
        h2.add(createHistoryItem("REPORTED", "Complaint Registered", "Oct 05, 2026 08:40 AM", "Citizen report filed via online portal."));
        h2.add(createHistoryItem("REVIEWED", "Municipal Review and Triage", "Oct 05, 2026 11:15 AM", "Operator triaged severity 2, accident risk 2, traffic rank 2, importance 2. Priority score 20 calculated."));
        h2.add(createHistoryItem("ASSIGNED", "Team and Machinery Assigned", "Oct 05, 2026 04:30 PM", "Work Order #JOB-101 assigned to Team T02 for nighttime milling and paving."));
        c2.put("history", h2);
        list.add(c2);

        // 3. RS-2026-0071 (Madurai - Completed)
        Map<String, Object> c3 = new LinkedHashMap<>();
        c3.put("id", "RS-2026-0071");
        c3.put("refNo", "RS-2026-0071");
        c3.put("location", "Madurai Ring Road - Near Mattuthavani");
        c3.put("address", "Ring Road Bypass, Near Mattuthavani Bus Terminal, Madurai, Tamil Nadu 625007");
        c3.put("lat", 9.9252);
        c3.put("lng", 78.1198);
        c3.put("coords", "9.9252° N, 78.1198° E");
        c3.put("type", "Road crack");
        c3.put("severity", "Small crack or shallow pothole");
        c3.put("severityLevel", 1);
        c3.put("date", "Sep 28, 2026");
        c3.put("status", "COMPLETED");
        c3.put("statusLabel", "Completed & Verified");
        c3.put("progressNote", "Crack sealing and hot-pour sealant applied. Quality verified and road reopened.");
        c3.put("description", "Longitudinal fissures opening up along the curb lane following heavy seasonal rain.");
        c3.put("photoPreview", null);
        c3.put("isDemo", true);
        c3.put("triaged", true);
        c3.put("accidentRisk", 1);
        c3.put("trafficRank", 2);
        c3.put("importanceRank", 2);
        c3.put("priority", 14); // (1*3) + (1*3) + (2*2) + (2*2) = 14
        c3.put("equipment", Arrays.asList("JACKHAMMER", "ASPHALT_MIXER"));
        c3.put("assignedJobId", "JOB-103");
        c3.put("assignedTeam", "Team T03 (Madurai North Division)");
        c3.put("estimatedTime", "45 minutes");
        List<Map<String, Object>> h3 = new ArrayList<>();
        h3.add(createHistoryItem("REPORTED", "Complaint Registered", "Sep 28, 2026 10:00 AM", "Report logged by resident."));
        h3.add(createHistoryItem("REVIEWED", "Municipal Review and Triage", "Sep 28, 2026 02:30 PM", "Operator triaged severity 1, accident risk 1, traffic 2, importance 2. Priority score 14."));
        h3.add(createHistoryItem("ASSIGNED", "Team and Machinery Assigned", "Sep 30, 2026 08:30 AM", "Work Order #JOB-103 dispatched to Team T03 with sealant materials."));
        h3.add(createHistoryItem("COMPLETED", "Repair Completed and Verified", "Sep 30, 2026 11:15 AM", "Job completed. Quality verified by municipal field supervisor."));
        c3.put("history", h3);
        list.add(c3);

        // 4. RS-2026-0105 (Salem - Pending Untriaged)
        Map<String, Object> c4 = new LinkedHashMap<>();
        c4.put("id", "RS-2026-0105");
        c4.put("refNo", "RS-2026-0105");
        c4.put("location", "Bangalore Highway (NH44) - Salem Junction");
        c4.put("address", "NH44 Bangalore-Salem Bypass, Near Five Roads, Salem, Tamil Nadu 636004");
        c4.put("lat", 11.6643);
        c4.put("lng", 78.1460);
        c4.put("coords", "11.6643° N, 78.1460° E");
        c4.put("type", "Pothole");
        c4.put("severity", "Large crack or deep pothole");
        c4.put("severityLevel", 3);
        c4.put("date", "Oct 11, 2026");
        c4.put("status", "PENDING");
        c4.put("statusLabel", "Pending Triage");
        c4.put("progressNote", "Citizen report filed online. Awaiting municipal operator review and priority ranking.");
        c4.put("description", "Cluster of multiple deep potholes in Salem bypass merge lane causing sudden braking and swerving of heavy vehicles.");
        c4.put("photoPreview", null);
        c4.put("isDemo", true);
        c4.put("triaged", false);
        c4.put("accidentRisk", null);
        c4.put("trafficRank", null);
        c4.put("importanceRank", null);
        c4.put("priority", null);
        c4.put("equipment", Arrays.asList("JACKHAMMER", "ASPHALT_MIXER"));
        c4.put("assignedJobId", null);
        c4.put("assignedTeam", "Unassigned (Awaiting Operator Triage)");
        c4.put("estimatedTime", "Uncalculated");
        List<Map<String, Object>> h4 = new ArrayList<>();
        h4.add(createHistoryItem("REPORTED", "Complaint Registered", "Oct 11, 2026 09:30 AM", "Resident report received with road GPS coordinates and lane details."));
        c4.put("history", h4);
        list.add(c4);

        return list;
    }

    public static List<Map<String, Object>> createDefaultDemoJobs() {
        List<Map<String, Object>> list = new ArrayList<>();

        Map<String, Object> j1 = new LinkedHashMap<>();
        j1.put("jobId", "JOB-101");
        j1.put("complaintRef", "RS-2026-0084");
        j1.put("location", "Avinashi Road Corridor - Near Gandhipuram");
        j1.put("damageType", "Uneven road surface");
        j1.put("jobType", "ResurfacingRepair");
        j1.put("severity", 2);
        j1.put("priority", 20);
        j1.put("teamId", "T02");
        j1.put("teamName", "Team T02 (Coimbatore Central Unit)");
        j1.put("status", "ASSIGNED");
        j1.put("equipment", Arrays.asList("PAVER", "ROAD_ROLLER"));
        j1.put("estimatedTime", 90);
        j1.put("assignedTime", "Oct 05, 2026 04:30 PM");
        j1.put("completedTime", null);
        j1.put("notes", "Nighttime resurfacing and asphalt compaction scheduled.");
        list.add(j1);

        Map<String, Object> j2 = new LinkedHashMap<>();
        j2.put("jobId", "JOB-102");
        j2.put("complaintRef", "RS-2026-0098");
        j2.put("location", "Anna Salai (Mount Road) - Near Guindy");
        j2.put("damageType", "Pothole");
        j2.put("jobType", "PotholeRepair");
        j2.put("severity", 3);
        j2.put("priority", 30);
        j2.put("teamId", "T01");
        j2.put("teamName", "Team T01 (Chennai South Rapid Unit)");
        j2.put("status", "IN_PROGRESS");
        j2.put("equipment", Arrays.asList("JACKHAMMER", "ASPHALT_MIXER", "ROAD_ROLLER"));
        j2.put("estimatedTime", 60);
        j2.put("assignedTime", "Oct 08, 2026 01:45 PM");
        j2.put("completedTime", null);
        j2.put("notes", "Active asphalt hot-mix patching and compaction underway.");
        list.add(j2);

        Map<String, Object> j3 = new LinkedHashMap<>();
        j3.put("jobId", "JOB-103");
        j3.put("complaintRef", "RS-2026-0071");
        j3.put("location", "Madurai Ring Road - Near Mattuthavani");
        j3.put("damageType", "Road crack");
        j3.put("jobType", "PotholeRepair");
        j3.put("severity", 1);
        j3.put("priority", 14);
        j3.put("teamId", "T03");
        j3.put("teamName", "Team T03 (Madurai North Division)");
        j3.put("status", "COMPLETED");
        j3.put("equipment", Arrays.asList("JACKHAMMER", "ASPHALT_MIXER"));
        j3.put("estimatedTime", 45);
        j3.put("assignedTime", "Sep 30, 2026 08:30 AM");
        j3.put("completedTime", "Sep 30, 2026 11:15 AM");
        j3.put("notes", "Crack sealing completed and verified by municipal engineer.");
        list.add(j3);

        return list;
    }

    public static List<Map<String, Object>> createDefaultDemoTeams() {
        List<Map<String, Object>> list = new ArrayList<>();

        Map<String, Object> t1 = new LinkedHashMap<>();
        t1.put("teamId", "T01");
        t1.put("username", "team01");
        t1.put("name", "Team T01 — Chennai South Rapid Unit");
        t1.put("division", "Chennai Municipal Corporation");
        t1.put("baseLocation", "L2 (Guindy Maintenance Depot)");
        t1.put("available", false);
        t1.put("currentJobId", "JOB-102");
        t1.put("equipment", Arrays.asList("JACKHAMMER", "ASPHALT_MIXER"));
        t1.put("membersCount", 6);
        t1.put("lead", "K. Ramanathan (Foreman)");
        list.add(t1);

        Map<String, Object> t2 = new LinkedHashMap<>();
        t2.put("teamId", "T02");
        t2.put("username", "team02");
        t2.put("name", "Team T02 — Coimbatore Central Division");
        t2.put("division", "Coimbatore City Municipal Corp");
        t2.put("baseLocation", "L4 (Gandhipuram Highway Yard)");
        t2.put("available", false);
        t2.put("currentJobId", "JOB-101");
        t2.put("equipment", Arrays.asList("PAVER", "ROAD_ROLLER"));
        t2.put("membersCount", 8);
        t2.put("lead", "M. Senthil Kumar (Supervisor)");
        list.add(t2);

        Map<String, Object> t3 = new LinkedHashMap<>();
        t3.put("teamId", "T03");
        t3.put("username", "team03");
        t3.put("name", "Team T03 — Madurai North Heavy Division");
        t3.put("division", "Madurai Corporation Works Dept");
        t3.put("baseLocation", "L5 (Mattuthavani Operations Depot)");
        t3.put("available", true);
        t3.put("currentJobId", null);
        t3.put("equipment", Arrays.asList("JACKHAMMER", "ASPHALT_MIXER", "PAVER", "ROAD_ROLLER"));
        t3.put("membersCount", 10);
        t3.put("lead", "S. Alagarsamy (Senior Engineer)");
        list.add(t3);

        return list;
    }

    private static Map<String, Object> createHistoryItem(String stage, String title, String date, String note) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("stage", stage);
        item.put("title", title);
        item.put("date", date);
        item.put("note", note);
        return item;
    }
}
