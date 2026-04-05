function resolveAdminSeedPolicy(options = {}) {
  const env = options.env || process.env;
  const electronApp = options.app;
  const nodeEnv = env.NODE_ENV;
  const isDevEnv = nodeEnv === 'development' || nodeEnv === 'test';
  const isUnpackagedElectron = Boolean(electronApp && electronApp.isPackaged === false);

  if (isDevEnv || isUnpackagedElectron) {
    return {
      shouldSeed: true,
      name: 'المدير العام',
      username: 'admin',
      password: 'admin123',
      source: 'development-default'
    };
  }

  if (env.INITIAL_ADMIN_PASSWORD) {
    return {
      shouldSeed: true,
      name: env.INITIAL_ADMIN_NAME || 'مدير النظام',
      username: env.INITIAL_ADMIN_USERNAME || 'admin',
      password: env.INITIAL_ADMIN_PASSWORD,
      source: 'bootstrap-env'
    };
  }

  return {
    shouldSeed: false,
    source: 'disabled'
  };
}

module.exports = {
  resolveAdminSeedPolicy
};
