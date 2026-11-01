import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.Executors;

/**
 * Road Sync — Built-in Java HTTP Server & REST API
 * 
 * Implements Stage 6 Step 2 REST API endpoints using standard Java (com.sun.net.httpserver.HttpServer):
 * - Zero external dependencies (zero Maven/Gradle, zero paid services)
 * - Directly reuses Main.java domain logic and RoadSyncService
 * - Enforces session authentication and maintenance-team division ownership
 * - Safe JSON handling, comprehensive HTTP status codes, and non-leaking error responses
 * - Local CORS configuration for frontend development
 */
public class RoadSyncServer {

    private final HttpServer server;
    private final RoadSyncService service;
    private final int port;

    public RoadSyncServer() throws IOException {
        this(8080);
    }

    public RoadSyncServer(int port) throws IOException {
        this(port, new RoadSyncService(new PostgresStorageManager()));
    }

    public RoadSyncServer(int port, RoadSyncService service) throws IOException {
        this.port = port;
        this.service = service;
        this.server = HttpServer.create(new InetSocketAddress(port), 0);
        this.server.createContext("/api", new ApiDispatcher());
        this.server.setExecutor(Executors.newFixedThreadPool(10));
    }

    public void start() {
        server.start();
        System.out.println("[RoadSyncServer] Server started successfully on " + getBaseUrl());
    }

    public void stop(int delaySeconds) {
        server.stop(delaySeconds);
        System.out.println("[RoadSyncServer] Server stopped.");
    }

    public int getPort() {
        return server.getAddress().getPort();
    }

    public String getBaseUrl() {
        return "http://localhost:" + getPort();
    }

    public RoadSyncService getService() {
        return service;
    }

    // -------------------------------------------------------------------------
    // DISPATCHER & CORS ROUTER
    // -------------------------------------------------------------------------

    private class ApiDispatcher implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            try {
                // 1. Handle CORS Preflight OPTIONS requests
                if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                    handleCorsPreflight(exchange);
                    return;
                }

                String path = exchange.getRequestURI().getPath();
                String method = exchange.getRequestMethod().toUpperCase();

                // 2. Route matching
                if ("/api/health".equals(path)) {
                    if ("GET".equals(method)) handleHealth(exchange);
                    else sendError(exchange, 405, "Method not allowed. Use GET.");
                } else if ("/api/auth/login".equals(path)) {
                    if ("POST".equals(method)) handleLogin(exchange);
                    else sendError(exchange, 405, "Method not allowed. Use POST.");
                } else if ("/api/auth/logout".equals(path)) {
                    if ("POST".equals(method)) handleLogout(exchange);
                    else sendError(exchange, 405, "Method not allowed. Use POST.");
                } else if ("/api/complaints".equals(path)) {
                    if ("GET".equals(method)) handleListComplaints(exchange);
                    else if ("POST".equals(method)) handleSubmitComplaint(exchange);
                    else sendError(exchange, 405, "Method not allowed. Use GET or POST.");
                } else if (path.startsWith("/api/complaints/")) {
                    handleComplaintSubPaths(exchange, path, method);
                } else if ("/api/jobs".equals(path)) {
                    if ("GET".equals(method)) handleListJobs(exchange);
                    else if ("POST".equals(method)) handleCreateJob(exchange);
                    else sendError(exchange, 405, "Method not allowed. Use GET or POST.");
                } else if (path.startsWith("/api/jobs/")) {
                    handleJobSubPaths(exchange, path, method);
                } else if ("/api/teams".equals(path)) {
                    if ("GET".equals(method)) handleListTeams(exchange);
                    else sendError(exchange, 405, "Method not allowed. Use GET.");
                } else {
                    sendError(exchange, 404, "Endpoint not found: " + path);
                }

            } catch (JsonHelper.JsonParseException e) {
                sendError(exchange, 400, "Malformed JSON request body: " + e.getMessage());
            } catch (RoadSyncService.SecurityViolationException e) {
                // Return 401 if missing/invalid session token, 403 if role/ownership forbidden
                int status = (e.getMessage() != null && e.getMessage().toLowerCase().contains("access denied")) ? 403 :
                             (e.getMessage() != null && e.getMessage().toLowerCase().contains("cross-team")) ? 403 : 401;
                sendError(exchange, status, e.getMessage());
            } catch (TeamUnavailableException e) {
                sendError(exchange, 409, "Team unavailable: " + e.getMessage());
            } catch (InvalidRepairStateException e) {
                sendError(exchange, 409, "Invalid repair lifecycle transition: " + e.getMessage());
            } catch (IllegalArgumentException e) {
                sendError(exchange, 400, e.getMessage());
            } catch (IllegalStateException e) {
                sendError(exchange, 400, e.getMessage());
            } catch (Throwable t) {
                System.err.println("[RoadSyncServer] Unhandled server error: " + t.getMessage());
                t.printStackTrace();
                sendError(exchange, 500, "An internal server error occurred.");
            }
        }
    }

    // -------------------------------------------------------------------------
    // ENDPOINT HANDLERS
    // -------------------------------------------------------------------------

    // GET /api/health
    private void handleHealth(HttpExchange exchange) throws IOException {
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("status", "UP");
        resp.put("service", "RoadSync Municipal Maintenance API");
        resp.put("timestamp", Instant.now().toString());
        resp.put("version", "1.0.0");
        sendJson(exchange, 200, resp);
    }

    // POST /api/auth/login
    private void handleLogin(HttpExchange exchange) throws IOException, JsonHelper.JsonParseException {
        Map<String, Object> body = readJsonBody(exchange);
        String username = getStringField(body, "username");
        String password = getStringField(body, "password");

        if (username == null || username.trim().isEmpty() || password == null || password.trim().isEmpty()) {
            sendError(exchange, 400, "Fields 'username' and 'password' are required.");
            return;
        }

        RoadSyncService.AuthSession session = service.login(username, password);
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("token", session.getToken());
        resp.put("username", session.getUsername());
        resp.put("role", session.getRole().name().toLowerCase());
        resp.put("displayName", session.getDisplayName());
        if (session.getTeamId() != null) {
            resp.put("teamId", session.getTeamId());
        }
        sendJson(exchange, 200, resp);
    }

    // POST /api/auth/logout
    private void handleLogout(HttpExchange exchange) throws IOException, JsonHelper.JsonParseException {
        String token = extractAuthToken(exchange);
        if (token == null) {
            // Also check body if not in header
            Map<String, Object> body = readJsonBodySilently(exchange);
            if (body != null) {
                token = getStringField(body, "token");
            }
        }

        if (token != null) {
            service.logout(token);
        }
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("message", "Session successfully invalidated.");
        sendJson(exchange, 200, resp);
    }

    // GET /api/complaints (with optional ?status=...)
    private void handleListComplaints(HttpExchange exchange) throws IOException {
        Map<String, String> query = parseQueryParams(exchange);
        String filterStatus = query.get("status");

        List<Map<String, Object>> all = service.getAllComplaints();
        if (filterStatus == null || filterStatus.trim().isEmpty()) {
            sendJson(exchange, 200, all);
            return;
        }

        List<Map<String, Object>> filtered = new ArrayList<>();
        for (Map<String, Object> c : all) {
            String st = String.valueOf(c.get("status"));
            if (filterStatus.equalsIgnoreCase(st)) {
                filtered.add(c);
            }
        }
        sendJson(exchange, 200, filtered);
    }

    // POST /api/complaints
    private void handleSubmitComplaint(HttpExchange exchange) throws IOException, JsonHelper.JsonParseException {
        Map<String, Object> body = readJsonBody(exchange);

        String location = getStringField(body, "location");
        String type = getStringField(body, "type");
        String description = getStringField(body, "description");

        if (location == null || location.trim().isEmpty()) {
            sendError(exchange, 400, "Road location is required.");
            return;
        }
        if (type == null || type.trim().isEmpty()) {
            sendError(exchange, 400, "Damage type is required.");
            return;
        }
        if (description == null || description.trim().length() < 10) {
            sendError(exchange, 400, "Description must be at least 10 characters detailing road damage.");
            return;
        }

        Map<String, Object> created = service.submitComplaint(body);
        sendJson(exchange, 201, created);
    }

    // Routes: /api/complaints/{id} and /api/complaints/{id}/triage
    private void handleComplaintSubPaths(HttpExchange exchange, String path, String method) throws IOException, JsonHelper.JsonParseException {
        String sub = path.substring("/api/complaints/".length());
        String[] parts = sub.split("/");

        if (parts.length == 1) {
            // GET /api/complaints/{id}
            if ("GET".equals(method)) {
                String id = decodeUrl(parts[0]);
                Map<String, Object> comp = service.getComplaintById(id);
                if (comp == null) {
                    sendError(exchange, 404, "Complaint not found with ID: " + id);
                } else {
                    sendJson(exchange, 200, comp);
                }
            } else {
                sendError(exchange, 405, "Method not allowed. Use GET.");
            }
        } else if (parts.length == 2 && "triage".equalsIgnoreCase(parts[1])) {
            // POST /api/complaints/{id}/triage
            if ("POST".equals(method)) {
                handleTriageComplaint(exchange, decodeUrl(parts[0]));
            } else {
                sendError(exchange, 405, "Method not allowed. Use POST.");
            }
        } else {
            sendError(exchange, 404, "Endpoint not found: " + path);
        }
    }

    // POST /api/complaints/{id}/triage
    private void handleTriageComplaint(HttpExchange exchange, String complaintId) throws IOException, JsonHelper.JsonParseException {
        String token = extractAuthToken(exchange);
        if (token == null) {
            sendError(exchange, 401, "Authentication token is required for municipal triage.");
            return;
        }

        Map<String, Object> body = readJsonBody(exchange);

        Object rawSev = body.get("severityLevel");
        if (rawSev == null) rawSev = body.get("severity");
        Object rawRisk = body.get("accidentRisk");
        Object rawTraffic = body.get("trafficRank");
        Object rawImportance = body.get("importanceRank");

        if (rawSev == null || rawRisk == null || rawTraffic == null || rawImportance == null) {
            sendError(exchange, 400, "Missing required priority factor(s). Fields 'severity', 'accidentRisk', 'trafficRank', and 'importanceRank' are all required.");
            return;
        }

        int severity = parsePriorityFactor(rawSev);
        int accidentRisk = parsePriorityFactor(rawRisk);
        int trafficRank = parsePriorityFactor(rawTraffic);
        int importanceRank = parsePriorityFactor(rawImportance);

        // Strict 1-3 range verification per requirements
        if (severity < 1 || severity > 3 ||
            accidentRisk < 1 || accidentRisk > 3 ||
            trafficRank < 1 || trafficRank > 3 ||
            importanceRank < 1 || importanceRank > 3) {
            sendError(exchange, 400, "All priority factors (severity, accidentRisk, trafficRank, importanceRank) must be valid integers between 1 and 3.");
            return;
        }

        Map<String, Object> triaged = service.triageComplaint(token, complaintId, severity, accidentRisk, trafficRank, importanceRank);
        sendJson(exchange, 200, triaged);
    }

    // GET /api/jobs (with optional ?teamId=...)
    private void handleListJobs(HttpExchange exchange) throws IOException {
        Map<String, String> query = parseQueryParams(exchange);
        String filterTeam = query.get("teamId");

        List<Map<String, Object>> all = service.getAllJobs();
        if (filterTeam == null || filterTeam.trim().isEmpty()) {
            sendJson(exchange, 200, all);
            return;
        }

        List<Map<String, Object>> filtered = new ArrayList<>();
        for (Map<String, Object> j : all) {
            String tid = String.valueOf(j.get("teamId"));
            if (filterTeam.equalsIgnoreCase(tid)) {
                filtered.add(j);
            }
        }
        sendJson(exchange, 200, filtered);
    }

    // POST /api/jobs
    private void handleCreateJob(HttpExchange exchange) throws IOException, JsonHelper.JsonParseException, TeamUnavailableException {
        String token = extractAuthToken(exchange);
        if (token == null) {
            sendError(exchange, 401, "Authentication token is required to create work orders.");
            return;
        }

        Map<String, Object> body = readJsonBody(exchange);

        String complaintRef = getStringField(body, "complaintRef");
        String teamId = getStringField(body, "teamId");
        String jobType = getStringField(body, "jobType");
        String notes = getStringField(body, "notes");

        if (complaintRef == null || complaintRef.trim().isEmpty()) {
            sendError(exchange, 400, "Field 'complaintRef' is required.");
            return;
        }
        if (teamId == null || teamId.trim().isEmpty()) {
            sendError(exchange, 400, "Field 'teamId' is required.");
            return;
        }

        Map<String, Object> createdJob = service.createWorkOrder(token, complaintRef, teamId, jobType, notes);
        sendJson(exchange, 201, createdJob);
    }

    // Routes: /api/jobs/{id} and /api/jobs/{id}/status
    private void handleJobSubPaths(HttpExchange exchange, String path, String method) throws IOException, JsonHelper.JsonParseException, InvalidRepairStateException {
        String sub = path.substring("/api/jobs/".length());
        String[] parts = sub.split("/");

        if (parts.length == 1) {
            // GET /api/jobs/{id}
            if ("GET".equals(method)) {
                String id = decodeUrl(parts[0]);
                Map<String, Object> job = service.getJobById(id);
                if (job == null) {
                    sendError(exchange, 404, "Repair job not found with ID: " + id);
                } else {
                    sendJson(exchange, 200, job);
                }
            } else {
                sendError(exchange, 405, "Method not allowed. Use GET.");
            }
        } else if (parts.length == 2 && "status".equalsIgnoreCase(parts[1])) {
            // POST /api/jobs/{id}/status
            if ("POST".equals(method)) {
                handleUpdateJobStatus(exchange, decodeUrl(parts[0]));
            } else {
                sendError(exchange, 405, "Method not allowed. Use POST.");
            }
        } else {
            sendError(exchange, 404, "Endpoint not found: " + path);
        }
    }

    // POST /api/jobs/{id}/status
    private void handleUpdateJobStatus(HttpExchange exchange, String jobId) throws IOException, JsonHelper.JsonParseException, InvalidRepairStateException {
        String token = extractAuthToken(exchange);
        if (token == null) {
            sendError(exchange, 401, "Authentication token is required to update repair status.");
            return;
        }

        Map<String, Object> body = readJsonBody(exchange);
        String action = getStringField(body, "action");

        if (action == null || (!"START".equalsIgnoreCase(action) && !"COMPLETE".equalsIgnoreCase(action))) {
            sendError(exchange, 400, "Field 'action' is required and must be either 'START' or 'COMPLETE'.");
            return;
        }

        Map<String, Object> updatedJob = service.updateRepairJobStatus(token, jobId, action);
        sendJson(exchange, 200, updatedJob);
    }

    // GET /api/teams
    private void handleListTeams(HttpExchange exchange) throws IOException {
        List<Map<String, Object>> teams = service.getAllTeams();
        sendJson(exchange, 200, teams);
    }

    // -------------------------------------------------------------------------
    // HELPERS: CORS, REQUEST BODY, QUERY PARSING, AUTH HEADER
    // -------------------------------------------------------------------------

    private void handleCorsPreflight(HttpExchange exchange) throws IOException {
        addCorsHeaders(exchange);
        exchange.getResponseHeaders().set("Access-Control-Max-Age", "86400");
        exchange.sendResponseHeaders(204, -1);
        exchange.close();
    }

    private void addCorsHeaders(HttpExchange exchange) {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Auth-Token");
    }

    private String extractAuthToken(HttpExchange exchange) {
        // 1. Check Authorization: Bearer <token>
        String authHeader = exchange.getRequestHeaders().getFirst("Authorization");
        if (authHeader != null && !authHeader.trim().isEmpty()) {
            if (authHeader.startsWith("Bearer ") || authHeader.startsWith("bearer ")) {
                return authHeader.substring(7).trim();
            }
            return authHeader.trim();
        }

        // 2. Check X-Auth-Token header
        String customHeader = exchange.getRequestHeaders().getFirst("X-Auth-Token");
        if (customHeader != null && !customHeader.trim().isEmpty()) {
            return customHeader.trim();
        }

        return null;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> readJsonBody(HttpExchange exchange) throws IOException, JsonHelper.JsonParseException {
        try (InputStream is = exchange.getRequestBody()) {
            byte[] bytes = is.readAllBytes();
            if (bytes.length == 0) {
                throw new IllegalArgumentException("Request body cannot be empty.");
            }
            String json = new String(bytes, StandardCharsets.UTF_8);
            Object parsed = JsonHelper.parse(json);
            if (!(parsed instanceof Map)) {
                throw new IllegalArgumentException("Expected JSON object body, but received " + (parsed == null ? "null" : parsed.getClass().getSimpleName()));
            }
            return (Map<String, Object>) parsed;
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> readJsonBodySilently(HttpExchange exchange) {
        try (InputStream is = exchange.getRequestBody()) {
            byte[] bytes = is.readAllBytes();
            if (bytes.length == 0) return null;
            Object parsed = JsonHelper.parse(new String(bytes, StandardCharsets.UTF_8));
            return (parsed instanceof Map) ? (Map<String, Object>) parsed : null;
        } catch (Exception e) {
            return null;
        }
    }

    private String getStringField(Map<String, Object> map, String key) {
        if (map == null || !map.containsKey(key)) return null;
        Object val = map.get(key);
        return val != null ? String.valueOf(val).trim() : null;
    }

    private int parsePriorityFactor(Object val) {
        if (val instanceof Number) {
            return ((Number) val).intValue();
        }
        if (val instanceof String) {
            try {
                return Integer.parseInt(((String) val).trim());
            } catch (NumberFormatException ignored) {}
        }
        return -1;
    }

    private Map<String, String> parseQueryParams(HttpExchange exchange) {
        Map<String, String> map = new HashMap<>();
        String rawQuery = exchange.getRequestURI().getRawQuery();
        if (rawQuery == null || rawQuery.trim().isEmpty()) return map;

        String[] pairs = rawQuery.split("&");
        for (String pair : pairs) {
            String[] kv = pair.split("=", 2);
            if (kv.length == 2) {
                map.put(decodeUrl(kv[0]), decodeUrl(kv[1]));
            } else if (kv.length == 1) {
                map.put(decodeUrl(kv[0]), "");
            }
        }
        return map;
    }

    private String decodeUrl(String val) {
        try {
            return URLDecoder.decode(val, StandardCharsets.UTF_8);
        } catch (Exception e) {
            return val;
        }
    }

    private void sendJson(HttpExchange exchange, int statusCode, Object data) throws IOException {
        String json = JsonHelper.toJson(data);
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        addCorsHeaders(exchange);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
        exchange.sendResponseHeaders(statusCode, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    private void sendError(HttpExchange exchange, int statusCode, String message) throws IOException {
        Map<String, Object> errorMap = new LinkedHashMap<>();
        errorMap.put("error", message);
        sendJson(exchange, statusCode, errorMap);
    }

    // -------------------------------------------------------------------------
    // COMMAND-LINE ENTRY POINT
    // -------------------------------------------------------------------------

    public static void main(String[] args) {
        int port = 8080;
        if (args.length > 0) {
            try {
                port = Integer.parseInt(args[0]);
            } catch (NumberFormatException e) {
                System.err.println("[RoadSyncServer] Invalid port number '" + args[0] + "', defaulting to 8080.");
            }
        }

        try {
            RoadSyncServer server = new RoadSyncServer(port);
            server.start();

            Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                System.out.println("[RoadSyncServer] Shutting down server...");
                server.stop(1);
            }));

            System.out.println("==================================================================");
            System.out.println("  ROAD SYNC — JAVA REST API SERVER READY");
            System.out.println("  Base URL: " + server.getBaseUrl());
            System.out.println("  Press Ctrl+C to stop.");
            System.out.println("==================================================================");

        } catch (IOException e) {
            System.err.println("[RoadSyncServer] FATAL: Failed to start server: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        }
    }
}
