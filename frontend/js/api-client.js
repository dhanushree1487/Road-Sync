/**
 * Road Sync — Centralized REST API Client
 * 
 * Provides unified HTTP communication with the Java backend (com.sun.net.httpserver.HttpServer):
 * - Authoritative backend source of truth for complaints, repair jobs, and maintenance teams
 * - Session token management (Bearer token in Authorization header)
 * - Safe JSON serialization and response parsing
 * - Descriptive, non-leaking error handling (network offline, 401, 403, 404, 409, 500)
 * - Configurable API base URL with local development fallback
 */

const ApiClient = (() => {

  // Resolve API Base URL
  function resolveBaseUrl() {
    if (typeof window !== 'undefined' && window.ROADSYNC_API_BASE) {
      return window.ROADSYNC_API_BASE;
    }
    if (typeof window !== 'undefined' && window.ROADSYNC_CONFIG && window.ROADSYNC_CONFIG.apiBaseUrl) {
      return window.ROADSYNC_CONFIG.apiBaseUrl;
    }
    // If served from port 8080 directly, use relative '/api'
    if (typeof window !== 'undefined' && window.location && window.location.port === '8080') {
      return '/api';
    }
    // Default local Java server endpoint
    return 'http://localhost:8080/api';
  }

  const BASE_URL = resolveBaseUrl();
  const TOKEN_KEY = 'roadsync_token';
  const USER_KEY = 'roadsync_logged_user';

  // --------------------------------------------------------------------------
  // SESSION & TOKEN MANAGEMENT
  // --------------------------------------------------------------------------

  function getToken() {
    try {
      const token = sessionStorage.getItem(TOKEN_KEY);
      if (token) return token;
      const user = getUser();
      return user?.token || null;
    } catch (e) {
      return null;
    }
  }

  function getUser() {
    try {
      const raw = sessionStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setSession(authData) {
    try {
      if (authData.token) {
        sessionStorage.setItem(TOKEN_KEY, authData.token);
      }
      sessionStorage.setItem(USER_KEY, JSON.stringify(authData));
    } catch (e) {
      console.warn('Session write warning:', e);
    }
  }

  function clearSession() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    } catch (e) {
      console.warn('Session clear warning:', e);
    }
  }

  // --------------------------------------------------------------------------
  // CORE HTTP REQUEST HANDLER
  // --------------------------------------------------------------------------

  async function request(endpoint, options = {}) {
    const url = `${BASE_URL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    const token = getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['X-Auth-Token'] = token;
    }

    const config = {
      ...options,
      headers
    };

    let response;
    try {
      response = await fetch(url, config);
    } catch (networkErr) {
      console.error('[ApiClient] Network request failed:', networkErr);
      throw new Error(
        'Backend server is offline or unreachable. Please ensure the Java server is running on http://localhost:8080.'
      );
    }

    // Parse JSON response body if present
    let data = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        data = await response.json();
      } catch (jsonErr) {
        console.warn('[ApiClient] Failed to parse JSON response:', jsonErr);
      }
    } else {
      try {
        const text = await response.text();
        if (text) data = { message: text };
      } catch (e) {}
    }

    // Success response
    if (response.ok) {
      return data;
    }

    // Error response handling
    const errorMsg = data?.error || data?.message || `Server returned error status ${response.status}`;

    if (response.status === 401) {
      clearSession();
      throw new Error(`Authentication Required: ${errorMsg}`);
    }

    if (response.status === 403) {
      throw new Error(`Access Denied: ${errorMsg}`);
    }

    if (response.status === 404) {
      throw new Error(`Not Found: ${errorMsg}`);
    }

    if (response.status === 409) {
      throw new Error(`Conflict: ${errorMsg}`);
    }

    throw new Error(errorMsg);
  }

  // --------------------------------------------------------------------------
  // API ENDPOINT METHODS
  // --------------------------------------------------------------------------

  // Server health
  async function checkHealth() {
    return request('/health', { method: 'GET' });
  }

  // Authentication
  async function login(username, password) {
    const result = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    if (result && result.token) {
      setSession(result);
    }
    return result;
  }

  async function logout() {
    try {
      await request('/auth/logout', { method: 'POST' });
    } catch (e) {
      console.warn('[ApiClient] Logout request warning:', e);
    } finally {
      clearSession();
    }
  }

  // Complaints
  async function getComplaints(statusFilter = null) {
    let endpoint = '/complaints';
    if (statusFilter && statusFilter !== 'ALL') {
      endpoint += `?status=${encodeURIComponent(statusFilter)}`;
    }
    return request(endpoint, { method: 'GET' });
  }

  async function getComplaintById(id) {
    return request(`/complaints/${encodeURIComponent(id)}`, { method: 'GET' });
  }

  async function submitComplaint(complaintData) {
    return request('/complaints', {
      method: 'POST',
      body: JSON.stringify(complaintData)
    });
  }

  async function triageComplaint(id, factors) {
    return request(`/complaints/${encodeURIComponent(id)}/triage`, {
      method: 'POST',
      body: JSON.stringify(factors)
    });
  }

  // Repair Jobs
  async function getJobs(teamIdFilter = null) {
    let endpoint = '/jobs';
    if (teamIdFilter && teamIdFilter !== 'ALL') {
      endpoint += `?teamId=${encodeURIComponent(teamIdFilter)}`;
    }
    return request(endpoint, { method: 'GET' });
  }

  async function getJobById(id) {
    return request(`/jobs/${encodeURIComponent(id)}`, { method: 'GET' });
  }

  async function createJob(jobData) {
    return request('/jobs', {
      method: 'POST',
      body: JSON.stringify(jobData)
    });
  }

  async function updateJobStatus(jobId, action) {
    return request(`/jobs/${encodeURIComponent(jobId)}/status`, {
      method: 'POST',
      body: JSON.stringify({ action })
    });
  }

  // Maintenance Teams
  async function getTeams() {
    return request('/teams', { method: 'GET' });
  }

  // Parallel bulk fetch for store initialization
  async function fetchAllData() {
    const [complaints, jobs, teams] = await Promise.all([
      getComplaints(),
      getJobs(),
      getTeams()
    ]);
    return { complaints, jobs, teams };
  }

  return {
    BASE_URL,
    getToken,
    getUser,
    setSession,
    clearSession,
    checkHealth,
    login,
    logout,
    getComplaints,
    getComplaintById,
    submitComplaint,
    triageComplaint,
    getJobs,
    getJobById,
    createJob,
    updateJobStatus,
    getTeams,
    fetchAllData
  };

})();

// Attach globally
if (typeof window !== 'undefined') {
  window.ApiClient = ApiClient;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ApiClient;
}
