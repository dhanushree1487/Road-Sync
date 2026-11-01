import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.*;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.Date;

/**
 * Road Sync — PostgreSQL Database Storage Manager (Supabase JDBC)
 * 
 * Extends StorageManager to provide a drop-in, polymorphic database persistence layer:
 * - Direct JDBC communication with Supabase PostgreSQL (PostgreSQL 17.11 over SSL)
 * - Prepared statements for all queries with zero string interpolation
 * - Preserves full Base64 photograph payloads and data structures identical to JSON storage
 * - Automatic foreign key resolution and duplicate prevention
 * - PBKDF2 password authentication support
 * - Graceful fallback to JSON file storage if database connection is unavailable
 */
public class PostgresStorageManager extends StorageManager {

    private final boolean databaseAvailable;

    public PostgresStorageManager() {
        this(Paths.get("data"));
    }

    public PostgresStorageManager(Path fallbackDataDir) {
        this(fallbackDataDir, true);
    }

    public PostgresStorageManager(Path fallbackDataDir, boolean allowDatabase) {
        super(fallbackDataDir);
        this.databaseAvailable = allowDatabase && checkConnectivity();
    }

    public boolean isDatabaseAvailable() {
        return databaseAvailable;
    }

    private boolean checkConnectivity() {
        try (Connection conn = DatabaseConfig.getConnection()) {
            return conn != null && conn.isValid(5);
        } catch (Exception e) {
            System.err.println("[PostgresStorageManager] PostgreSQL unavailable, falling back to JSON: " + DatabaseConfig.sanitizeErrorMessage(e.getMessage()));
            return false;
        }
    }

    // -------------------------------------------------------------------------
    // 1. MAINTENANCE TEAMS PERSISTENCE
    // -------------------------------------------------------------------------

    @Override
    public synchronized List<Map<String, Object>> loadTeams() {
        if (!databaseAvailable) {
            return super.loadTeams();
        }

        List<Map<String, Object>> result = new ArrayList<>();
        String sql = "SELECT id, team_name, availability FROM maintenance_teams ORDER BY id";

        try (Connection conn = DatabaseConfig.getConnection();
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery(sql)) {

            while (rs.next()) {
                String teamId = rs.getString("id");
                String teamName = rs.getString("team_name");
                String availStr = rs.getString("availability");
                boolean available = "AVAILABLE".equalsIgnoreCase(availStr);

                Map<String, Object> teamMap = buildTeamDetails(teamId, teamName, available);
                result.add(teamMap);
            }

            if (!result.isEmpty()) {
                return result;
            }
        } catch (SQLException e) {
            System.err.println("[PostgresStorageManager] Error loading teams from PostgreSQL: " + DatabaseConfig.sanitizeErrorMessage(e.getMessage()));
        }

        // Fallback to JSON if database returned 0 rows
        return super.loadTeams();
    }

    @Override
    public synchronized void saveTeams(List<Map<String, Object>> teams) throws IOException {
        // Also persist to JSON file for zero-data-loss redundancy
        super.saveTeams(teams);

        if (!databaseAvailable) return;

        String updateSql = "UPDATE maintenance_teams SET availability = ? WHERE id = ?";
        try (Connection conn = DatabaseConfig.getConnection();
             PreparedStatement ps = conn.prepareStatement(updateSql)) {

            for (Map<String, Object> t : teams) {
                String teamId = (String) t.get("teamId");
                boolean avail = Boolean.TRUE.equals(t.get("available"));
                ps.setString(1, avail ? "AVAILABLE" : "UNAVAILABLE");
                ps.setString(2, teamId);
                ps.addBatch();
            }
            ps.executeBatch();
        } catch (SQLException e) {
            System.err.println("[PostgresStorageManager] Warning: Failed to update teams in PostgreSQL: " + DatabaseConfig.sanitizeErrorMessage(e.getMessage()));
        }
    }

    // -------------------------------------------------------------------------
    // 2. COMPLAINTS PERSISTENCE
    // -------------------------------------------------------------------------

    @Override
    public synchronized List<Map<String, Object>> loadComplaints() {
        if (!databaseAvailable) {
            return super.loadComplaints();
        }

        List<Map<String, Object>> list = new ArrayList<>();
        String sql = "SELECT c.id, c.user_id, c.location, c.latitude, c.longitude, c.damage_type, " +
                     "c.severity, c.description, c.photo_url, c.status, c.priority_score, " +
                     "c.created_at, c.updated_at, u.username " +
                     "FROM complaints c " +
                     "LEFT JOIN users u ON c.user_id = u.id " +
                     "ORDER BY c.created_at DESC";

        try (Connection conn = DatabaseConfig.getConnection();
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery(sql)) {

            while (rs.next()) {
                Map<String, Object> c = new LinkedHashMap<>();
                String id = rs.getString("id");
                c.put("id", id);
                c.put("refNo", id);
                c.put("location", rs.getString("location"));
                c.put("address", rs.getString("location"));

                double lat = rs.getDouble("latitude");
                if (!rs.wasNull()) c.put("lat", lat); else c.put("lat", 13.0067);

                double lng = rs.getDouble("longitude");
                if (!rs.wasNull()) c.put("lng", lng); else c.put("lng", 80.2025);

                c.put("coords", String.format(Locale.ENGLISH, "%.4f° N, %.4f° E", (Double) c.get("lat"), (Double) c.get("lng")));
                c.put("type", rs.getString("damage_type"));
                c.put("severity", rs.getString("severity"));

                int sevLevel = parseSeverityLevel(rs.getString("severity"));
                c.put("severityLevel", sevLevel);

                Timestamp createdAt = rs.getTimestamp("created_at");
                String dateStr = createdAt != null ? new SimpleDateFormat("MMM dd, yyyy").format(createdAt) : "Today";
                c.put("date", dateStr);

                String status = rs.getString("status");
                c.put("status", status);
                c.put("statusLabel", formatStatusLabel(status));
                c.put("description", rs.getString("description"));
                c.put("photoPreview", rs.getString("photo_url"));
                boolean isDemo = id.startsWith("RS-2026-00") || "RS-2026-0105".equals(id);
                c.put("isDemo", isDemo);

                int priority = rs.getInt("priority_score");
                if (!rs.wasNull()) {
                    c.put("priority", priority);
                    c.put("triaged", true);
                } else {
                    c.put("priority", null);
                    c.put("triaged", false);
                }

                // Equipment needed
                String typeStr = String.valueOf(c.get("type")).toLowerCase();
                if (typeStr.contains("pothole") || typeStr.contains("crack")) {
                    c.put("equipment", Arrays.asList("JACKHAMMER", "ASPHALT_MIXER"));
                } else {
                    c.put("equipment", Arrays.asList("PAVER", "ROAD_ROLLER"));
                }

                // Load history milestones for this complaint
                List<Map<String, Object>> history = loadComplaintUpdates(conn, id);
                c.put("history", history);

                // Reconstruct triage factors (accidentRisk, trafficRank, importanceRank) from triage history milestone
                if (Boolean.TRUE.equals(c.get("triaged"))) {
                    int risk = 2, traffic = 2, importance = 2;
                    for (Map<String, Object> h : history) {
                        if ("REVIEWED".equalsIgnoreCase((String) h.get("stage"))) {
                            String noteStr = String.valueOf(h.get("note")).toLowerCase();
                            java.util.regex.Matcher mRisk = java.util.regex.Pattern.compile("(?:accident\\s+)?risk\\s+(\\d+)").matcher(noteStr);
                            if (mRisk.find()) risk = Integer.parseInt(mRisk.group(1));

                            java.util.regex.Matcher mTraffic = java.util.regex.Pattern.compile("traffic(?:\\s+rank)?\\s+(\\d+)").matcher(noteStr);
                            if (mTraffic.find()) traffic = Integer.parseInt(mTraffic.group(1));

                            java.util.regex.Matcher mImp = java.util.regex.Pattern.compile("importance(?:\\s+rank)?\\s+(\\d+)").matcher(noteStr);
                            if (mImp.find()) importance = Integer.parseInt(mImp.group(1));
                            break;
                        }
                    }
                    c.put("accidentRisk", risk);
                    c.put("trafficRank", traffic);
                    c.put("importanceRank", importance);
                } else {
                    c.put("accidentRisk", null);
                    c.put("trafficRank", null);
                    c.put("importanceRank", null);
                }

                // Derive progress note from latest history item
                if (!history.isEmpty()) {
                    Map<String, Object> latest = history.get(history.size() - 1);
                    c.put("progressNote", latest.get("note"));
                } else {
                    c.put("progressNote", "Complaint status: " + status);
                }

                list.add(c);
            }

            if (!list.isEmpty()) {
                // Link assigned job info if available
                enrichComplaintsWithJobs(conn, list);
                return list;
            }

        } catch (SQLException e) {
            System.err.println("[PostgresStorageManager] Error loading complaints from PostgreSQL: " + DatabaseConfig.sanitizeErrorMessage(e.getMessage()));
        }

        return super.loadComplaints();
    }

    private List<Map<String, Object>> loadComplaintUpdates(Connection conn, String complaintId) {
        List<Map<String, Object>> history = new ArrayList<>();
        String sql = "SELECT status, note, updated_by, created_at FROM complaint_updates " +
                     "WHERE complaint_id = ? ORDER BY created_at ASC, id ASC";

        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, complaintId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> item = new LinkedHashMap<>();
                    String status = rs.getString("status");
                    String note = rs.getString("note");
                    Timestamp ts = rs.getTimestamp("created_at");

                    item.put("stage", status);
                    String title = formatStageTitle(status);
                    String actualNote = note;
                    if (note != null && note.contains(": ")) {
                        int colonIdx = note.indexOf(": ");
                        String potentialTitle = note.substring(0, colonIdx).trim();
                        if (potentialTitle.length() < 40) {
                            title = potentialTitle;
                            actualNote = note.substring(colonIdx + 2).trim();
                        }
                    }
                    item.put("title", title);
                    item.put("date", ts != null ? new SimpleDateFormat("MMM dd, yyyy hh:mm a").format(ts) : "");
                    item.put("note", actualNote);
                    history.add(item);
                }
            }
        } catch (SQLException e) {
            System.err.println("[PostgresStorageManager] Failed to load updates for " + complaintId + ": " + DatabaseConfig.sanitizeErrorMessage(e.getMessage()));
        }
        return history;
    }

    private void enrichComplaintsWithJobs(Connection conn, List<Map<String, Object>> complaints) {
        String sql = "SELECT j.id, j.complaint_id, j.team_id, t.team_name " +
                     "FROM repair_jobs j " +
                     "LEFT JOIN maintenance_teams t ON j.team_id = t.id";

        try (Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery(sql)) {

            Map<String, String[]> jobMap = new HashMap<>(); // complaint_id -> [jobId, teamName]
            while (rs.next()) {
                String cId = rs.getString("complaint_id");
                String jId = rs.getString("id");
                String tName = rs.getString("team_name");
                if (cId != null) {
                    jobMap.put(cId, new String[]{jId, tName != null ? tName : "Maintenance Team"});
                }
            }

            for (Map<String, Object> c : complaints) {
                String cId = (String) c.get("id");
                if (jobMap.containsKey(cId)) {
                    String[] info = jobMap.get(cId);
                    c.put("assignedJobId", info[0]);
                    c.put("assignedTeam", info[1]);
                } else {
                    c.put("assignedJobId", null);
                    c.put("assignedTeam", "Unassigned (Awaiting Operator Triage)");
                }
            }
        } catch (SQLException ignored) {}
    }

    @Override
    public synchronized void saveComplaints(List<Map<String, Object>> complaints) throws IOException {
        // Redundant JSON backup
        super.saveComplaints(complaints);

        if (!databaseAvailable) return;

        String upsertSql = "INSERT INTO complaints (" +
                "id, location, latitude, longitude, damage_type, severity, description, photo_url, " +
                "status, priority_score, updated_at) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
                "ON CONFLICT (id) DO UPDATE SET " +
                "status = EXCLUDED.status, " +
                "priority_score = EXCLUDED.priority_score, " +
                "photo_url = COALESCE(EXCLUDED.photo_url, complaints.photo_url), " +
                "updated_at = EXCLUDED.updated_at";

        String insertUpdateSql = "INSERT INTO complaint_updates (complaint_id, status, note, updated_by, created_at) " +
                "SELECT ?, ?, ?, ?, ? " +
                "WHERE NOT EXISTS (SELECT 1 FROM complaint_updates WHERE complaint_id = ? AND status = ? AND note = ?)";

        try (Connection conn = DatabaseConfig.getConnection();
             PreparedStatement compPs = conn.prepareStatement(upsertSql);
             PreparedStatement updPs = conn.prepareStatement(insertUpdateSql)) {

            for (Map<String, Object> c : complaints) {
                String id = (String) c.get("id");
                compPs.setString(1, id);
                compPs.setString(2, (String) c.get("location"));

                Object lat = c.get("lat");
                if (lat instanceof Number) compPs.setDouble(3, ((Number) lat).doubleValue()); else compPs.setNull(3, Types.DOUBLE);

                Object lng = c.get("lng");
                if (lng instanceof Number) compPs.setDouble(4, ((Number) lng).doubleValue()); else compPs.setNull(4, Types.DOUBLE);

                compPs.setString(5, (String) c.get("type"));
                compPs.setString(6, (String) c.get("severity"));
                compPs.setString(7, (String) c.get("description"));

                Object photo = c.get("photoPreview");
                if (photo != null) compPs.setString(8, String.valueOf(photo)); else compPs.setNull(8, Types.VARCHAR);

                compPs.setString(9, (String) c.get("status"));

                Object prio = c.get("priority");
                if (prio instanceof Number) compPs.setInt(10, ((Number) prio).intValue()); else compPs.setNull(10, Types.INTEGER);

                compPs.setTimestamp(11, new Timestamp(System.currentTimeMillis()));
                compPs.addBatch();

                // Process history updates
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> hist = (List<Map<String, Object>>) c.get("history");
                if (hist != null) {
                    for (Map<String, Object> h : hist) {
                        String stage = (String) h.get("stage");
                        String title = (String) h.get("title");
                        String note = (String) h.get("note");
                        String fullNote = title != null && !title.isEmpty() ? title + ": " + note : note;
                        String actor = "Municipal System";

                        Timestamp ts = SupabaseMigration.parseTimestamp((String) h.get("date"));

                        updPs.setString(1, id);
                        updPs.setString(2, stage);
                        updPs.setString(3, fullNote);
                        updPs.setString(4, actor);
                        updPs.setTimestamp(5, ts);
                        updPs.setString(6, id);
                        updPs.setString(7, stage);
                        updPs.setString(8, fullNote);
                        updPs.addBatch();
                    }
                }
            }

            compPs.executeBatch();
            updPs.executeBatch();

        } catch (SQLException e) {
            System.err.println("[PostgresStorageManager] Warning: Failed to persist complaints to PostgreSQL: " + DatabaseConfig.sanitizeErrorMessage(e.getMessage()));
        }
    }

    // -------------------------------------------------------------------------
    // 3. REPAIR JOBS PERSISTENCE
    // -------------------------------------------------------------------------

    @Override
    public synchronized List<Map<String, Object>> loadJobs() {
        if (!databaseAvailable) {
            return super.loadJobs();
        }

        List<Map<String, Object>> list = new ArrayList<>();
        String sql = "SELECT j.id, j.complaint_id, j.team_id, j.repair_type, j.equipment, j.status, " +
                     "j.assigned_at, j.completed_at, t.team_name, c.location, c.damage_type, c.severity, c.priority_score " +
                     "FROM repair_jobs j " +
                     "LEFT JOIN maintenance_teams t ON j.team_id = t.id " +
                     "LEFT JOIN complaints c ON j.complaint_id = c.id " +
                     "ORDER BY j.assigned_at DESC";

        try (Connection conn = DatabaseConfig.getConnection();
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery(sql)) {

            while (rs.next()) {
                Map<String, Object> j = new LinkedHashMap<>();
                String id = rs.getString("id");
                j.put("jobId", id);
                j.put("complaintRef", rs.getString("complaint_id"));
                j.put("location", rs.getString("location"));
                j.put("damageType", rs.getString("damage_type"));
                j.put("jobType", rs.getString("repair_type"));

                String sevStr = rs.getString("severity");
                int sev = parseSeverityLevel(sevStr);
                j.put("severity", sev);

                int prio = rs.getInt("priority_score");
                j.put("priority", !rs.wasNull() ? prio : 20);

                j.put("teamId", rs.getString("team_id"));
                j.put("teamName", rs.getString("team_name"));
                j.put("status", rs.getString("status"));

                String eqStr = rs.getString("equipment");
                List<String> eqList = eqStr != null && !eqStr.isEmpty() ? Arrays.asList(eqStr.split("\\s*,\\s*")) : Collections.emptyList();
                j.put("equipment", eqList);

                Timestamp assignedAt = rs.getTimestamp("assigned_at");
                j.put("assignedTime", assignedAt != null ? new SimpleDateFormat("MMM dd, yyyy hh:mm a").format(assignedAt) : "");

                Timestamp completedAt = rs.getTimestamp("completed_at");
                j.put("completedTime", completedAt != null ? new SimpleDateFormat("MMM dd, yyyy hh:mm a").format(completedAt) : null);

                j.put("estimatedTime", 60);
                j.put("notes", "Scheduled for repair.");

                list.add(j);
            }

            if (!list.isEmpty()) {
                return list;
            }
        } catch (SQLException e) {
            System.err.println("[PostgresStorageManager] Error loading jobs from PostgreSQL: " + DatabaseConfig.sanitizeErrorMessage(e.getMessage()));
        }

        return super.loadJobs();
    }

    @Override
    public synchronized void saveJobs(List<Map<String, Object>> jobs) throws IOException {
        // Redundant JSON backup
        super.saveJobs(jobs);

        if (!databaseAvailable) return;

        String upsertSql = "INSERT INTO repair_jobs (" +
                "id, complaint_id, team_id, repair_type, equipment, status, assigned_at, completed_at) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?) " +
                "ON CONFLICT (id) DO UPDATE SET " +
                "status = EXCLUDED.status, " +
                "completed_at = EXCLUDED.completed_at";

        try (Connection conn = DatabaseConfig.getConnection();
             PreparedStatement ps = conn.prepareStatement(upsertSql)) {

            for (Map<String, Object> j : jobs) {
                ps.setString(1, (String) j.get("jobId"));
                ps.setString(2, (String) j.get("complaintRef"));
                ps.setString(3, (String) j.get("teamId"));
                ps.setString(4, (String) j.get("jobType"));

                @SuppressWarnings("unchecked")
                List<String> eq = (List<String>) j.get("equipment");
                ps.setString(5, eq != null ? String.join(", ", eq) : "");

                ps.setString(6, (String) j.get("status"));

                Timestamp assigned = SupabaseMigration.parseTimestamp((String) j.get("assignedTime"));
                ps.setTimestamp(7, assigned != null ? assigned : new Timestamp(System.currentTimeMillis()));

                Timestamp completed = SupabaseMigration.parseTimestamp((String) j.get("completedTime"));
                if (completed != null) ps.setTimestamp(8, completed); else ps.setNull(8, Types.TIMESTAMP_WITH_TIMEZONE);

                ps.addBatch();
            }
            ps.executeBatch();
        } catch (SQLException e) {
            System.err.println("[PostgresStorageManager] Warning: Failed to persist jobs to PostgreSQL: " + DatabaseConfig.sanitizeErrorMessage(e.getMessage()));
        }
    }

    // -------------------------------------------------------------------------
    // 4. USER AUTHENTICATION SUPPORT (PBKDF2)
    // -------------------------------------------------------------------------

    public boolean authenticateUser(String username, String password) {
        if (!databaseAvailable || username == null || password == null) return false;

        String sql = "SELECT password_hash FROM users WHERE LOWER(username) = LOWER(?)";
        try (Connection conn = DatabaseConfig.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {

            ps.setString(1, username.trim());
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    String hash = rs.getString("password_hash");
                    return PasswordHasher.verify(password, hash);
                }
            }
        } catch (SQLException e) {
            System.err.println("[PostgresStorageManager] Auth query failed: " + DatabaseConfig.sanitizeErrorMessage(e.getMessage()));
        }
        return false;
    }

    // -------------------------------------------------------------------------
    // HELPERS
    // -------------------------------------------------------------------------

    private Map<String, Object> buildTeamDetails(String teamId, String teamName, boolean available) {
        Map<String, Object> t = new LinkedHashMap<>();
        t.put("teamId", teamId);
        t.put("name", teamName);
        t.put("available", available);
        t.put("currentJobId", null);

        if ("T01".equalsIgnoreCase(teamId)) {
            t.put("username", "team01");
            t.put("division", "Chennai Municipal Corporation");
            t.put("baseLocation", "L2 (Guindy Maintenance Depot)");
            t.put("equipment", Arrays.asList("JACKHAMMER", "ASPHALT_MIXER"));
            t.put("membersCount", 6);
            t.put("lead", "K. Ramanathan (Foreman)");
        } else if ("T02".equalsIgnoreCase(teamId)) {
            t.put("username", "team02");
            t.put("division", "Coimbatore City Municipal Corp");
            t.put("baseLocation", "L4 (Gandhipuram Highway Yard)");
            t.put("equipment", Arrays.asList("PAVER", "ROAD_ROLLER"));
            t.put("membersCount", 8);
            t.put("lead", "M. Senthil Kumar (Supervisor)");
        } else if ("T03".equalsIgnoreCase(teamId)) {
            t.put("username", "team03");
            t.put("division", "Madurai Corporation Works Dept");
            t.put("baseLocation", "L5 (Mattuthavani Operations Depot)");
            t.put("equipment", Arrays.asList("JACKHAMMER", "ASPHALT_MIXER", "PAVER", "ROAD_ROLLER"));
            t.put("membersCount", 10);
            t.put("lead", "S. Alagarsamy (Senior Engineer)");
        } else {
            t.put("username", teamId.toLowerCase());
            t.put("division", "General Public Works Division");
            t.put("baseLocation", "Central Depot");
            t.put("equipment", Collections.emptyList());
            t.put("membersCount", 5);
            t.put("lead", "Field Lead");
        }
        return t;
    }

    private int parseSeverityLevel(String severity) {
        if (severity == null) return 2;
        String lower = severity.toLowerCase();
        if (lower.contains("large") || lower.contains("deep") || lower.contains("3") || lower.contains("severe")) return 3;
        if (lower.contains("small") || lower.contains("shallow") || lower.contains("1") || lower.contains("minor")) return 1;
        return 2;
    }

    private String formatStatusLabel(String status) {
        if (status == null) return "Pending Review";
        switch (status.toUpperCase()) {
            case "REGISTERED":
            case "PENDING":
                return "Pending Municipal Review";
            case "REVIEWED":
                return "Reviewed & Triaged";
            case "ASSIGNED":
                return "Assigned to Maintenance Team";
            case "IN_PROGRESS":
                return "In Progress (Repair Underway)";
            case "COMPLETED":
                return "Completed & Verified";
            default:
                return status;
        }
    }

    private String formatStageTitle(String stage) {
        if (stage == null) return "Status Update";
        switch (stage.toUpperCase()) {
            case "REPORTED": return "Complaint Registered";
            case "REVIEWED": return "Municipal Review and Triage";
            case "ASSIGNED": return "Team and Machinery Assigned";
            case "IN_PROGRESS": return "Repair Work Commenced";
            case "COMPLETED": return "Repair Completed & Verified";
            default: return "Status Update";
        }
    }
}
