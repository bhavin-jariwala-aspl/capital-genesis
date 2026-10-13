'use strict';

const fp   = require('fastify-plugin');
const cors = require('@fastify/cors');
const config = require('../config');

module.exports = fp(async function corsPlugin(fastify) {
  fastify.register(cors, {
    origin: config.isDev
      ? ['http://localhost:5173', 'http://127.0.0.1:5173']
      : (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean),
    methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });
});
