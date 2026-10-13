'use strict';

require('dotenv').config();

const config = require('./config');
const { buildApp } = require('./app');

async function start() {
  const fastify = await buildApp();

  // Graceful shutdown — fastify.close() properly releases the TCP port so the
  // next `npm run dev` never finds port 3001 still occupied.
  const shutdown = async (signal) => {
    // Force-exit after 3 s in case fastify.close() hangs on live keep-alive
    // connections — guarantees the port is released before nodemon restarts.
    const force = setTimeout(() => process.exit(0), 3000).unref();
    try {
      await fastify.close();
    } catch (_) {}
    clearTimeout(force);
    process.exit(0);
  };

  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await fastify.listen({ port: config.port, host: config.host });
    fastify.log.info(`Genesis CRM backend running at http://${config.host}:${config.port} [${config.env}]`);
    fastify.log.info(`Health: http://localhost:${config.port}/health`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
