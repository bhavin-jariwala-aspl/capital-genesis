'use strict';

const fp  = require('fastify-plugin');
const jwt = require('@fastify/jwt');
const config = require('../config');

module.exports = fp(async function jwtPlugin(fastify) {
  fastify.register(jwt, {
    secret: config.jwt.secret,
    sign:   { expiresIn: config.jwt.expiry },
  });
});
