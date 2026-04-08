"use strict";

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function shouldUseWebServer() {
  return isTruthy(process.env.FORCE_WEB_SERVER)
    || isTruthy(process.env.RENDER)
    || Boolean(process.env.RENDER_SERVICE_ID)
    || Boolean(process.env.RENDER_EXTERNAL_URL)
    || Boolean(process.env.RENDER_EXTERNAL_HOSTNAME)
    || Boolean(process.env.RENDER_GIT_COMMIT);
}

if (shouldUseWebServer()) {
  require('../src/start-web.js');
} else {
  require('./run-electron.js');
}
