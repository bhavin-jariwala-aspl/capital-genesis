'use strict';

const { ADMIN_THRESHOLD, levelOf } = require('../middleware/authenticate');

/**
 * Request utilities to standardize common patterns
 */
class RequestUtils {
  /**
   * Get the authenticated user's employee ID consistently
   * Handles both employee_id and employeeId variations
   */
  static getUserId(req) {
    return req.user?.employee_id ?? req.user?.employeeId ?? null;
  }

  /**
   * Get user with role information
   */
  static getUser(req) {
    if (!req.user) return null;
    
    return {
      id: RequestUtils.getUserId(req),
      employeeId: RequestUtils.getUserId(req),
      employee_id: RequestUtils.getUserId(req), // snake_case for compatibility
      role: req.user.role,
      branchId: req.user.branchId || req.user.branch_id,
      regionId: req.user.regionId || req.user.region_id,
    };
  }

  /**
   * Check if current user has admin privileges (level <= ADMIN_THRESHOLD)
   */
  static isAdmin(req) {
    return levelOf(req.user) <= ADMIN_THRESHOLD;
  }

  /**
   * Assert that user has admin privileges (throws error if not)
   */
  static requireAdmin(req) {
    if (!RequestUtils.isAdmin(req)) {
      const { AuthorizationError } = require('../utils/errors');
      throw new AuthorizationError('Admin privileges required');
    }
  }

  /**
   * Extract pagination parameters from query string
   */
  static getPagination(req) {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    
    return { page, limit, skip };
  }
}

module.exports = RequestUtils;