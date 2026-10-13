/**
 * Standardized response wrapper for API calls
 * Extracts nested data consistently: { data: { data: payload } } -> { data: payload }
 */
export const apiWrapper = {
  // Standard wrapper for most endpoints
  wrap: (apiCall) => apiCall.then((r) => ({ data: r.data?.data ?? r.data })),
  
  // Direct data extraction (legacy compatibility)
  extract: (apiCall) => apiCall.then((r) => r.data?.data ?? r.data),
  
  // For blob responses (exports, files)
  blob: (apiCall) => apiCall,
  
  // For delete operations (no data expected)
  delete: (apiCall) => apiCall,
};