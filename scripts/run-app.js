"use strict";

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function shouldUseWebServer(env = process.env) {
  return isTruthy(env.FORCE_WEB_SERVER)
    || isTruthy(env.RENDER)
    || Boolean(env.RENDER_SERVICE_ID)
    || Boolean(env.RENDER_EXTERNAL_URL)
    || Boolean(env.RENDER_EXTERNAL_HOSTNAME)
    || Boolean(env.RENDER_GIT_COMMIT)
    || Boolean(env.PORT)
    || Boolean(env.DATABASE_URL);
}

function startApp(env = process.env) {
  if (shouldUseWebServer(env)) {
    require('../src/start-web.js');
    return;
  }

  const { startElectronApp } = require('./run-electron.js');
  startElectronApp();
}

if (require.main === module) {
  startApp();
}

module.exports = {
  isTruthy,
  shouldUseWebServer,
  startApp
};
