'use strict';

const { authenticate, requireAdmin } = require('../../middleware/authenticate');
const MetadataService = require('../../services/metadata.service');
const CacheService    = require('../../services/cache.service');
const { ok, created } = require('../../utils/response');

module.exports = async function metadataRoutes(fastify) {
  const cache = new CacheService(fastify.redis);
  const svc   = new MetadataService(fastify.prisma, cache);

  // ── MODULES ──────────────────────────────────────────────

  fastify.get('/modules', { preHandler: [authenticate] }, async () => {
    return ok(await svc.getModules());
  });

  fastify.get('/modules/:id', { preHandler: [authenticate] }, async (req) => {
    return ok(await svc.getModule(Number(req.params.id)));
  });

  fastify.post('/modules', { preHandler: [requireAdmin] }, async (req, reply) => {
    reply.code(201);
    return created(await svc.createModule(req.body));
  });

  fastify.put('/modules/:id', { preHandler: [requireAdmin] }, async (req) => {
    return ok(await svc.updateModule(Number(req.params.id), req.body));
  });

  fastify.delete('/modules/:id', { preHandler: [requireAdmin] }, async (req, reply) => {
    await svc.deleteModule(Number(req.params.id));
    reply.code(204).send();
  });

  // ── OBJECTS ──────────────────────────────────────────────

  fastify.get('/objects', { preHandler: [authenticate] }, async (req) => {
    const moduleId = req.query.module_id ? Number(req.query.module_id) : undefined;
    return ok(await svc.getObjects(moduleId));
  });

  fastify.get('/objects/:id', { preHandler: [authenticate] }, async (req) => {
    return ok(await svc.getObject(Number(req.params.id)));
  });

  fastify.post('/objects', { preHandler: [requireAdmin] }, async (req, reply) => {
    reply.code(201);
    return created(await svc.createObject(req.body));
  });

  fastify.put('/objects/:id', { preHandler: [requireAdmin] }, async (req) => {
    return ok(await svc.updateObject(Number(req.params.id), req.body));
  });

  fastify.delete('/objects/:id', { preHandler: [requireAdmin] }, async (req, reply) => {
    await svc.deleteObject(Number(req.params.id));
    reply.code(204).send();
  });

  // ── FIELDS ───────────────────────────────────────────────

  fastify.get('/fields', { preHandler: [authenticate] }, async (req) => {
    const objectId = Number(req.query.object_id);
    return ok(await svc.getFields(objectId));
  });

  fastify.get('/fields/:id', { preHandler: [authenticate] }, async (req) => {
    return ok(await svc.getField(Number(req.params.id)));
  });

  fastify.post('/fields', { preHandler: [requireAdmin] }, async (req, reply) => {
    reply.code(201);
    return created(await svc.createField(req.body));
  });

  fastify.put('/fields/:id', { preHandler: [requireAdmin] }, async (req) => {
    return ok(await svc.updateField(Number(req.params.id), req.body));
  });

  fastify.delete('/fields/:id', { preHandler: [requireAdmin] }, async (req, reply) => {
    await svc.deleteField(Number(req.params.id));
    reply.code(204).send();
  });

  // ── FORMS ────────────────────────────────────────────────

  fastify.get('/forms', { preHandler: [authenticate] }, async (req) => {
    const objectId = req.query.object_id ? Number(req.query.object_id) : undefined;
    return ok(await svc.getForms(objectId));
  });

  fastify.get('/forms/:id', { preHandler: [authenticate] }, async (req) => {
    return ok(await svc.getFormFull(Number(req.params.id)));
  });

  fastify.post('/forms', { preHandler: [requireAdmin] }, async (req, reply) => {
    reply.code(201);
    return created(await svc.createForm(req.body));
  });

  fastify.put('/forms/:id', { preHandler: [requireAdmin] }, async (req) => {
    return ok(await svc.updateForm(Number(req.params.id), req.body));
  });

  fastify.delete('/forms/:id', { preHandler: [requireAdmin] }, async (req, reply) => {
    await svc.deleteForm(Number(req.params.id));
    reply.code(204).send();
  });

  // PUT /forms/:id/layout — bulk update field positions in a form
  fastify.put('/forms/:id/layout', { preHandler: [requireAdmin] }, async (req) => {
    await svc.upsertFormLayout(Number(req.params.id), req.body.layouts);
    return ok(await svc.getFormFull(Number(req.params.id)));
  });

  // ── VALIDATIONS ──────────────────────────────────────────

  fastify.get('/validations', { preHandler: [authenticate] }, async (req) => {
    return ok(await svc.getValidations(Number(req.query.field_id)));
  });

  fastify.post('/validations', { preHandler: [requireAdmin] }, async (req, reply) => {
    reply.code(201);
    return created(await svc.createValidation(req.body));
  });

  fastify.put('/validations/:id', { preHandler: [requireAdmin] }, async (req) => {
    return ok(await svc.updateValidation(Number(req.params.id), req.body));
  });

  fastify.delete('/validations/:id', { preHandler: [requireAdmin] }, async (req, reply) => {
    await svc.deleteValidation(Number(req.params.id));
    reply.code(204).send();
  });

  // ── DEPENDENCIES ─────────────────────────────────────────

  fastify.get('/dependencies', { preHandler: [authenticate] }, async (req) => {
    if (req.query.form_id) {
      return ok(await svc.getDependenciesForForm(Number(req.query.form_id)));
    }
    return ok(await svc.getDependencies(Number(req.query.field_id)));
  });

  fastify.post('/dependencies', { preHandler: [requireAdmin] }, async (req, reply) => {
    reply.code(201);
    return created(await svc.createDependency(req.body));
  });

  fastify.put('/dependencies/:id', { preHandler: [requireAdmin] }, async (req) => {
    return ok(await svc.updateDependency(Number(req.params.id), req.body));
  });

  fastify.delete('/dependencies/:id', { preHandler: [requireAdmin] }, async (req, reply) => {
    await svc.deleteDependency(Number(req.params.id));
    reply.code(204).send();
  });

};
