import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.IOException;
import java.net.URI;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.*;

/**
 * Road Sync — Supabase PostgreSQL Database Configuration
 * 
 * Manages JDBC connectivity for Supabase PostgreSQL:
 * - Reads credentials strictly from environment variables or local .env file (never hardcoded)
 * - Enforces SSL connectivity (sslmode=require) for secure cloud database transit
 * - Safe connection testing and credential masking (never logs passwords or tokens)
 * - Zero external build tool dependencies; compatible with plain Java 25 + PostgreSQL JDBC driver
 */
public class DatabaseConfig {

    private static final String DRIVER_CLASS = "org.postgresql.Driver";
    private static final int DEFAULT_LOGIN_TIMEOUT_SECONDS = 10;

    // Expected Supabase tables for Road Sync Stage 8
    public static final List<String> EXPECTED_TABLES = Arrays.asList(
        "users",
        "maintenance_teams",
        "complaints",
        "repair_jobs",
        "complaint_updates"
    );

    public static class ConnectionTestResult {
        private final boolean success;
        private final String message;
        private final String databaseVersion;
        private final List<String> detectedTables;
        private final String maskedUrl;

        public ConnectionTestResult(boolean success, String message, String databaseVersion, List<String> detectedTables, String maskedUrl) {
            this.success = success;
            this.message = message;
            this.databaseVersion = databaseVersion;
            this.detectedTables = detectedTables != null ? detectedTables : Collections.emptyList();
            this.maskedUrl = maskedUrl;
        }

        public boolean isSuccess() { return success; }
        public String getMessage() { return message; }
        public String getDatabaseVersion() { return databaseVersion; }
        public List<String> getDetectedTables() { return detectedTables; }
        public String getMaskedUrl() { return maskedUrl; }
    }

    /**
     * Resolves a key from environment variables, falling back to a local .env file if present.
     */
    public static String getEnv(String key) {
        String val = System.getenv(key);
        if (val != null && !val.trim().isEmpty()) {
            return val.trim();
        }

        // Fallback: check .env file in working directory
        Map<String, String> dotEnv = loadDotEnv();
        val = dotEnv.get(key);
        if (val != null && !val.trim().isEmpty()) {
            return val.trim();
        }

        return null;
    }

    private static Map<String, String> dotEnvCache = null;

    private static synchronized Map<String, String> loadDotEnv() {
        if (dotEnvCache != null) return dotEnvCache;
        Map<String, String> map = new HashMap<>();
        File envFile = new File(".env");
        if (envFile.exists() && envFile.isFile()) {
            try (BufferedReader reader = new BufferedReader(new FileReader(envFile))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    line = line.trim();
                    if (line.isEmpty() || line.startsWith("#")) continue;
                    int eqIdx = line.indexOf('=');
                    if (eqIdx > 0) {
                        String k = line.substring(0, eqIdx).trim();
                        String v = line.substring(eqIdx + 1).trim();
                        if ((v.startsWith("\"") && v.endsWith("\"")) || (v.startsWith("'") && v.endsWith("'"))) {
                            v = v.substring(1, v.length() - 1);
                        }
                        map.put(k, v);
                    }
                }
            } catch (IOException ignored) {}
        }
        dotEnvCache = map;
        return dotEnvCache;
    }

    /**
     * Resolves the PostgreSQL JDBC URL from environment variables and enforces SSL.
     */
    public static String getJdbcUrl() {
        // Priority 1: Direct JDBC URL
        String jdbcUrl = getEnv("SUPABASE_DB_URL");
        if (jdbcUrl == null) jdbcUrl = getEnv("DATABASE_URL");
        if (jdbcUrl == null) jdbcUrl = getEnv("JDBC_DATABASE_URL");

        if (jdbcUrl != null && !jdbcUrl.isEmpty()) {
            // If provided as postgres:// or postgresql:// URI without 'jdbc:', adapt it
            if (jdbcUrl.startsWith("postgres://") || jdbcUrl.startsWith("postgresql://")) {
                try {
                    URI uri = URI.create(jdbcUrl);
                    String host = uri.getHost();
                    int port = uri.getPort() > 0 ? uri.getPort() : 5432;
                    String path = uri.getPath();
                    if (path != null && path.startsWith("/")) path = path.substring(1);
                    if (path == null || path.isEmpty()) path = "postgres";

                    jdbcUrl = "jdbc:postgresql://" + host + ":" + port + "/" + path;
                } catch (Exception e) {
                    if (!jdbcUrl.startsWith("jdbc:")) {
                        jdbcUrl = "jdbc:" + jdbcUrl;
                    }
                }
            }

            return enforceSsl(jdbcUrl);
        }

        // Priority 2: Individual connection parameters
        String host = getEnv("SUPABASE_DB_HOST");
        if (host == null) host = getEnv("DB_HOST");
        if (host == null) host = getEnv("PGHOST");

        if (host != null && !host.isEmpty()) {
            String portStr = getEnv("SUPABASE_DB_PORT");
            if (portStr == null) portStr = getEnv("DB_PORT");
            if (portStr == null) portStr = getEnv("PGPORT");
            int port = 5432;
            if (portStr != null) {
                try { port = Integer.parseInt(portStr); } catch (NumberFormatException ignored) {}
            }

            String dbName = getEnv("SUPABASE_DB_NAME");
            if (dbName == null) dbName = getEnv("DB_NAME");
            if (dbName == null) dbName = getEnv("PGDATABASE");
            if (dbName == null || dbName.isEmpty()) dbName = "postgres";

            String constructed = "jdbc:postgresql://" + host + ":" + port + "/" + dbName;
            return enforceSsl(constructed);
        }

        return null;
    }

    /**
     * Resolves the database username.
     */
    public static String getUsername() {
        String user = getEnv("SUPABASE_DB_USER");
        if (user == null) user = getEnv("DB_USER");
        if (user == null) user = getEnv("PGUSER");

        if (user == null) {
            // Check if embedded in DATABASE_URL
            String rawUrl = getEnv("SUPABASE_DB_URL");
            if (rawUrl == null) rawUrl = getEnv("DATABASE_URL");
            if (rawUrl != null && (rawUrl.startsWith("postgres://") || rawUrl.startsWith("postgresql://"))) {
                try {
                    URI uri = URI.create(rawUrl);
                    String userInfo = uri.getUserInfo();
                    if (userInfo != null) {
                        String[] parts = userInfo.split(":", 2);
                        return parts[0];
                    }
                } catch (Exception ignored) {}
            }
        }

        return user;
    }

    /**
     * Resolves the database password.
     */
    public static String getPassword() {
        String pass = getEnv("SUPABASE_DB_PASSWORD");
        if (pass == null) pass = getEnv("DB_PASSWORD");
        if (pass == null) pass = getEnv("PGPASSWORD");

        if (pass == null) {
            // Check if embedded in DATABASE_URL
            String rawUrl = getEnv("SUPABASE_DB_URL");
            if (rawUrl == null) rawUrl = getEnv("DATABASE_URL");
            if (rawUrl != null && (rawUrl.startsWith("postgres://") || rawUrl.startsWith("postgresql://"))) {
                try {
                    URI uri = URI.create(rawUrl);
                    String userInfo = uri.getUserInfo();
                    if (userInfo != null) {
                        String[] parts = userInfo.split(":", 2);
                        if (parts.length > 1) {
                            return parts[1];
                        }
                    }
                } catch (Exception ignored) {}
            }
        }

        return pass;
    }

    /**
     * Enforces SSL mode in the JDBC URL (sslmode=require).
     */
    public static String enforceSsl(String url) {
        if (url == null) return null;
        if (!url.toLowerCase().contains("sslmode=")) {
            String separator = url.contains("?") ? "&" : "?";
            return url + separator + "sslmode=require";
        }
        return url;
    }

    /**
     * Creates a new Connection to Supabase PostgreSQL with SSL enforced.
     */
    public static Connection getConnection() throws SQLException {
        String url = getJdbcUrl();
        if (url == null) {
            throw new SQLException("Database connection URL is not configured. Please set SUPABASE_DB_URL or DB_HOST environment variables.");
        }

        try {
            Class.forName(DRIVER_CLASS);
        } catch (ClassNotFoundException e) {
            throw new SQLException("PostgreSQL JDBC driver not found on classpath. Ensure postgresql-*.jar is in the classpath.", e);
        }

        Properties props = new Properties();
        String user = getUsername();
        String pass = getPassword();

        if (user != null) props.setProperty("user", user);
        if (pass != null) props.setProperty("password", pass);

        // Strict SSL enforcement
        props.setProperty("ssl", "true");
        props.setProperty("sslmode", "require");
        props.setProperty("connectTimeout", "10");

        DriverManager.setLoginTimeout(DEFAULT_LOGIN_TIMEOUT_SECONDS);
        return DriverManager.getConnection(url, props);
    }

    /**
     * Safely tests the Supabase PostgreSQL connection without exposing credentials.
     */
    public static ConnectionTestResult testConnection() {
        String rawUrl = getJdbcUrl();
        if (rawUrl == null) {
            return new ConnectionTestResult(
                false,
                "Configuration missing: No database connection parameters found. Please set SUPABASE_DB_URL (or DB_HOST, DB_USER, DB_PASSWORD) in environment variables or .env file.",
                null,
                null,
                "none"
            );
        }

        String maskedUrl = maskUrl(rawUrl);

        try (Connection conn = getConnection()) {
            if (!conn.isValid(DEFAULT_LOGIN_TIMEOUT_SECONDS)) {
                return new ConnectionTestResult(false, "Connection was established but failed validation check.", null, null, maskedUrl);
            }

            DatabaseMetaData meta = conn.getMetaData();
            String dbVersion = meta.getDatabaseProductName() + " " + meta.getDatabaseProductVersion();

            // Check for expected Stage 8 tables in public schema
            List<String> foundTables = new ArrayList<>();
            try (Statement stmt = conn.createStatement();
                 ResultSet rs = stmt.executeQuery(
                     "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
                 )) {
                while (rs.next()) {
                    String tbl = rs.getString("table_name");
                    if (EXPECTED_TABLES.contains(tbl.toLowerCase())) {
                        foundTables.add(tbl.toLowerCase());
                    }
                }
            }

            return new ConnectionTestResult(
                true,
                "Connection successful: Connected to Supabase PostgreSQL with SSL required.",
                dbVersion,
                foundTables,
                maskedUrl
            );

        } catch (SQLException e) {
            String safeMsg = sanitizeErrorMessage(e.getMessage());
            return new ConnectionTestResult(
                false,
                "Connection failed: " + safeMsg,
                null,
                null,
                maskedUrl
            );
        } catch (Exception e) {
            return new ConnectionTestResult(
                false,
                "Unexpected error during connection test: " + sanitizeErrorMessage(e.getMessage()),
                null,
                null,
                maskedUrl
            );
        }
    }

    /**
     * Sanitizes error messages by scrubbing potential passwords or credentials.
     */
    public static String sanitizeErrorMessage(String msg) {
        if (msg == null) return "Unknown error";
        String pass = getPassword();
        if (pass != null && !pass.isEmpty() && msg.contains(pass)) {
            msg = msg.replace(pass, "*****");
        }
        return maskUrl(msg);
    }

    /**
     * Masks passwords in connection URLs or messages.
     */
    public static String maskUrl(String str) {
        if (str == null) return "null";
        String masked = str.replaceAll(":[^/@:]+@", ":*****@");
        masked = masked.replaceAll("(?i)(password=)[^&;]+", "$1*****");
        return masked;
    }

    /**
     * Standalone CLI entrypoint for testing the connection.
     */
    public static void main(String[] args) {
        System.out.println("==================================================================");
        System.out.println("  ROAD SYNC — SUPABASE POSTGRESQL JDBC CONNECTION TEST");
        System.out.println("==================================================================\n");

        ConnectionTestResult result = testConnection();

        System.out.println("Endpoint: " + result.getMaskedUrl());
        System.out.println("SSL Mode: required (enforced)");
        System.out.println("Status:   " + (result.isSuccess() ? "[SUCCESS]" : "[FAILED]"));
        System.out.println("Message:  " + result.getMessage());

        if (result.isSuccess()) {
            System.out.println("Database: " + result.getDatabaseVersion());
            System.out.println("\nExpected Supabase Tables Checked:");
            for (String expected : EXPECTED_TABLES) {
                boolean present = result.getDetectedTables().contains(expected);
                System.out.println("  [" + (present ? "FOUND" : "NOT FOUND") + "] " + expected);
            }
            System.out.println("\nDatabase is ready for Stage 8 migration.");
        } else {
            System.out.println("\nTip: To configure the Supabase connection, set the environment variable:");
            System.out.println("  $env:SUPABASE_DB_URL = \"postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require\"");
            System.out.println("Or create a local .env file with:");
            System.out.println("  SUPABASE_DB_URL=postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require");
        }

        System.out.println("\n==================================================================");
        if (!result.isSuccess() && result.getMessage().startsWith("Configuration missing")) {
            System.exit(0); // Exit cleanly when credentials are not yet supplied
        } else if (!result.isSuccess()) {
            System.exit(1);
        }
    }
}
