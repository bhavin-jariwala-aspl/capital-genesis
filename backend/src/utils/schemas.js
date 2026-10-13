'use strict';

/**
 * Reusable Fastify JSON Schema patterns
 * Reduces duplication in route definitions and ensures consistency
 */

// Common property definitions
const commonProps = {
  id: { type: 'integer', minimum: 1 },
  stringId: { type: 'string', minLength: 1 },
  label: { type: 'string', minLength: 1, maxLength: 100 },
  name: { type: 'string', pattern: '^[a-z][a-z0-9_]*$', maxLength: 50 },
  description: { type: 'string', maxLength: 1000 },
  email: { type: 'string', format: 'email' },
  url: { type: 'string', format: 'uri' },
  phone: { type: 'string', pattern: '^[\\d\\s\\-\\+\\(\\)]+$' },
  color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
  timestamp: { type: 'string', format: 'date-time' },
  boolean: { type: 'boolean' },
  positiveNumber: { type: 'number', minimum: 0 },
  percentage: { type: 'number', minimum: 0, maximum: 100 },
};

// Common object schemas
const schemas = {
  // Standard pagination parameters
  pagination: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    },
  },

  // Standard success response
  successResponse: {
    type: 'object',
    required: ['success', 'data'],
    properties: {
      success: { type: 'boolean', const: true },
      data: {}, // Override this in specific routes
    },
  },

  // Standard error response
  errorResponse: {
    type: 'object',
    required: ['success', 'error'],
    properties: {
      success: { type: 'boolean', const: false },
      error: {
        type: 'object',
        required: ['code', 'message'],
        properties: {
          code: { type: 'string' },
          message: { type: 'string' },
          details: {},
        },
      },
    },
  },

  // Standard list response with pagination
  listResponse: {
    type: 'object',
    required: ['success', 'data', 'pagination'],
    properties: {
      success: { type: 'boolean', const: true },
      data: { type: 'array' },
      pagination: {
        type: 'object',
        properties: {
          total: { type: 'integer', minimum: 0 },
          page: { type: 'integer', minimum: 1 },
          limit: { type: 'integer', minimum: 1 },
          pages: { type: 'integer', minimum: 0 },
        },
      },
    },
  },

  // Common entity properties
  entityBase: {
    type: 'object',
    required: ['label', 'name'],
    properties: {
      label: commonProps.label,
      name: commonProps.name,
      description: commonProps.description,
    },
  },

  // Authentication
  loginRequest: {
    type: 'object',
    required: ['employee_id', 'password'],
    properties: {
      employee_id: commonProps.stringId,
      password: { type: 'string', minLength: 1 },
    },
  },

  passwordChangeRequest: {
    type: 'object',
    required: ['current_password', 'new_password'],
    properties: {
      current_password: { type: 'string', minLength: 1 },
      new_password: { type: 'string', minLength: 8 },
    },
  },

  forgotPasswordRequest: {
    type: 'object',
    required: ['identifier'],
    properties: {
      identifier: { type: 'string', minLength: 1 }, // employee_id or email
    },
  },

  resetPasswordRequest: {
    type: 'object',
    required: ['token', 'new_password'],
    properties: {
      token: { type: 'string', minLength: 1 },
      new_password: { type: 'string', minLength: 8 },
    },
  },

  // Module/Object creation
  moduleCreate: {
    type: 'object',
    required: ['label', 'name'],
    properties: {
      label: commonProps.label,
      name: commonProps.name,
      description: commonProps.description,
      icon: { type: 'string', maxLength: 50 },
      color: commonProps.color,
      order_index: { type: 'integer', minimum: 0 },
    },
  },

  // Field creation
  fieldCreate: {
    type: 'object',
    required: ['label', 'name', 'field_type'],
    properties: {
      label: commonProps.label,
      name: commonProps.name,
      description: commonProps.description,
      field_type: { 
        type: 'string',
        enum: ['text', 'textarea', 'number', 'email', 'phone', 'url', 'select', 'checkbox', 'date', 'datetime']
      },
      data_type: {
        type: 'string',
        enum: ['string', 'number', 'boolean', 'date', 'array', 'object']
      },
      is_required: commonProps.boolean,
      default_value: { type: 'string' },
      options: { type: 'string' },
      validation_rules: { type: 'string' },
    },
  },

  // Contact information
  contactCreate: {
    type: 'object',
    required: ['first_name', 'last_name'],
    properties: {
      first_name: { type: 'string', minLength: 1, maxLength: 50 },
      last_name: { type: 'string', minLength: 1, maxLength: 50 },
      email: commonProps.email,
      phone: commonProps.phone,
      company: { type: 'string', maxLength: 100 },
      title: { type: 'string', maxLength: 100 },
    },
  },

  // Pipeline stages
  pipelineStageCreate: {
    type: 'object',
    required: ['label', 'color', 'order_index'],
    properties: {
      label: commonProps.label,
      color: commonProps.color,
      order_index: { type: 'integer', minimum: 0 },
      forecast_weight: commonProps.percentage,
      is_final: commonProps.boolean,
    },
  },

  // Dashboard widget
  widgetCreate: {
    type: 'object',
    required: ['title', 'widget_type', 'position'],
    properties: {
      title: commonProps.label,
      widget_type: {
        type: 'string',
        enum: ['chart', 'metric', 'table', 'list', 'filter']
      },
      config: { type: 'object' },
      position: {
        type: 'object',
        required: ['x', 'y', 'w', 'h'],
        properties: {
          x: { type: 'integer', minimum: 0 },
          y: { type: 'integer', minimum: 0 },
          w: { type: 'integer', minimum: 1 },
          h: { type: 'integer', minimum: 1 },
        },
      },
    },
  },

  // Assignment rule
  assignmentRuleCreate: {
    type: 'object',
    required: ['name', 'rule_type'],
    properties: {
      name: commonProps.label,
      rule_type: {
        type: 'string',
        enum: ['fixed', 'round_robin', 'rule_based', 'load_balanced']
      },
      conditions: { type: 'array' },
      assignee_id: commonProps.stringId,
      pool_ids: { type: 'array', items: { type: 'string' } },
      fallback_id: commonProps.stringId,
      order_index: { type: 'integer', minimum: 0 },
      is_active: commonProps.boolean,
    },
  },

  // Workflow
  workflowCreate: {
    type: 'object',
    required: ['name', 'label', 'trigger_type'],
    properties: {
      name: commonProps.name,
      label: commonProps.label,
      description: commonProps.description,
      trigger_type: {
        type: 'string',
        enum: ['on_create', 'on_update', 'on_delete', 'scheduled', 'manual']
      },
      trigger_config: { type: 'object' },
      is_active: commonProps.boolean,
    },
  },
};

// Route schema builders
const routeSchemas = {
  /**
   * Create a standard GET route schema for listing entities
   */
  list(dataSchema, querySchema = schemas.pagination) {
    return {
      querystring: querySchema,
      response: {
        200: {
          ...schemas.listResponse,
          properties: {
            ...schemas.listResponse.properties,
            data: { type: 'array', items: dataSchema },
          },
        },
        400: schemas.errorResponse,
        401: schemas.errorResponse,
        403: schemas.errorResponse,
      },
    };
  },

  /**
   * Create a standard GET route schema for single entity
   */
  get(dataSchema) {
    return {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: commonProps.id },
      },
      response: {
        200: {
          ...schemas.successResponse,
          properties: {
            ...schemas.successResponse.properties,
            data: dataSchema,
          },
        },
        400: schemas.errorResponse,
        401: schemas.errorResponse,
        403: schemas.errorResponse,
        404: schemas.errorResponse,
      },
    };
  },

  /**
   * Create a standard POST route schema for entity creation
   */
  create(bodySchema, responseSchema = {}) {
    return {
      body: bodySchema,
      response: {
        201: {
          ...schemas.successResponse,
          properties: {
            ...schemas.successResponse.properties,
            data: responseSchema,
          },
        },
        400: schemas.errorResponse,
        401: schemas.errorResponse,
        403: schemas.errorResponse,
        409: schemas.errorResponse,
      },
    };
  },

  /**
   * Create a standard PUT route schema for entity updates
   */
  update(bodySchema, responseSchema = {}) {
    return {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: commonProps.id },
      },
      body: bodySchema,
      response: {
        200: {
          ...schemas.successResponse,
          properties: {
            ...schemas.successResponse.properties,
            data: responseSchema,
          },
        },
        400: schemas.errorResponse,
        401: schemas.errorResponse,
        403: schemas.errorResponse,
        404: schemas.errorResponse,
      },
    };
  },

  /**
   * Create a standard DELETE route schema
   */
  delete() {
    return {
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: commonProps.id },
      },
      response: {
        200: {
          ...schemas.successResponse,
          properties: {
            ...schemas.successResponse.properties,
            data: { type: 'object', properties: { success: { type: 'boolean', const: true } } },
          },
        },
        400: schemas.errorResponse,
        401: schemas.errorResponse,
        403: schemas.errorResponse,
        404: schemas.errorResponse,
      },
    };
  },
};

module.exports = {
  commonProps,
  schemas,
  routeSchemas,
};