'use strict';

const { NotFoundError } = require('./errors');

/**
 * Database repository base class with common query patterns
 * Reduces boilerplate in service classes and provides consistent error handling
 */
class BaseRepository {
  constructor(prisma, modelName) {
    this.db = prisma;
    this.model = prisma[modelName];
    this.modelName = modelName;
  }

  /**
   * Find all records with optional filtering, sorting, and pagination
   */
  async findMany(options = {}) {
    const {
      where = {},
      select,
      include,
      orderBy = { id: 'desc' },
      skip,
      take,
      distinct,
    } = options;

    return this.model.findMany({
      where,
      select,
      include,
      orderBy,
      skip,
      take,
      distinct,
    });
  }

  /**
   * Find records with pagination metadata
   */
  async findManyWithPagination(options = {}) {
    const { where = {}, page = 1, limit = 20, ...restOptions } = options;
    
    const skip = (page - 1) * limit;
    const take = Math.min(limit, 100); // Max 100 per page

    const [data, total] = await Promise.all([
      this.findMany({ where, skip, take, ...restOptions }),
      this.count({ where }),
    ]);

    return {
      data,
      pagination: {
        total,
        page,
        limit: take,
        pages: Math.ceil(total / take),
      },
    };
  }

  /**
   * Find a single record by ID
   */
  async findById(id, options = {}) {
    const { select, include } = options;
    
    const record = await this.model.findUnique({
      where: { id: Number(id) },
      select,
      include,
    });

    if (!record) {
      throw new NotFoundError(`${this.modelName} with ID ${id} not found`);
    }

    return record;
  }

  /**
   * Find a single record by unique field
   */
  async findByUnique(field, value, options = {}) {
    const { select, include } = options;
    
    const record = await this.model.findUnique({
      where: { [field]: value },
      select,
      include,
    });

    if (!record) {
      throw new NotFoundError(`${this.modelName} with ${field} '${value}' not found`);
    }

    return record;
  }

  /**
   * Find first record matching criteria
   */
  async findFirst(where = {}, options = {}) {
    const { select, include, orderBy } = options;
    
    return this.model.findFirst({
      where,
      select,
      include,
      orderBy,
    });
  }

  /**
   * Create a new record
   */
  async create(data, options = {}) {
    const { select, include } = options;
    
    return this.model.create({
      data,
      select,
      include,
    });
  }

  /**
   * Create multiple records
   */
  async createMany(data, options = {}) {
    const { skipDuplicates = false } = options;
    
    return this.model.createMany({
      data,
      skipDuplicates,
    });
  }

  /**
   * Update a record by ID
   */
  async updateById(id, data, options = {}) {
    const { select, include } = options;
    
    // Check if record exists first
    await this.findById(id);
    
    return this.model.update({
      where: { id: Number(id) },
      data,
      select,
      include,
    });
  }

  /**
   * Update multiple records
   */
  async updateMany(where, data) {
    return this.model.updateMany({
      where,
      data,
    });
  }

  /**
   * Upsert (create or update)
   */
  async upsert(where, create, update, options = {}) {
    const { select, include } = options;
    
    return this.model.upsert({
      where,
      create,
      update,
      select,
      include,
    });
  }

  /**
   * Delete a record by ID
   */
  async deleteById(id) {
    // Check if record exists first
    await this.findById(id);
    
    return this.model.delete({
      where: { id: Number(id) },
    });
  }

  /**
   * Delete multiple records
   */
  async deleteMany(where = {}) {
    return this.model.deleteMany({ where });
  }

  /**
   * Count records
   */
  async count(options = {}) {
    const { where = {} } = options;
    return this.model.count({ where });
  }

  /**
   * Check if record exists
   */
  async exists(where) {
    const count = await this.count({ where });
    return count > 0;
  }

  /**
   * Soft delete (if the model has deleted_at field)
   */
  async softDeleteById(id) {
    return this.updateById(id, { deleted_at: new Date() });
  }

  /**
   * Restore soft deleted record
   */
  async restoreById(id) {
    return this.updateById(id, { deleted_at: null });
  }

  /**
   * Find records excluding soft deleted (if model has deleted_at)
   */
  async findManyActive(options = {}) {
    return this.findMany({
      ...options,
      where: {
        ...options.where,
        deleted_at: null,
      },
    });
  }

  /**
   * Transaction wrapper
   */
  async transaction(callback) {
    return this.db.$transaction(callback);
  }
}

module.exports = {
  BaseRepository,
};