const base = {
  script: 'server.js',
  autorestart: true,
  restart_delay: 5000,
  env: { TZ: 'Asia/Kolkata', serviceName: 'cts-main' },
};

const allOperationsOff = {
  ENABLE_CMS_SCHEDULER: 'false',
  ENABLE_UMS_SCHEDULER: 'false',
  ENABLE_UMS_TEST_SCHEDULER: 'false',
};

module.exports = {
  apps: [
    {
      ...base,
      name: 'cms',
      env: {
        ...base.env,
        ...allOperationsOff,
        PORT: 5001,
        clientId: 'cms',
        ENABLE_CMS_SCHEDULER: 'true',
      },
    },
    {
      ...base,
      name: 'ums',
      env: {
        ...base.env,
        ...allOperationsOff,
        PORT: 5003,
        clientId: 'ums',
        ENABLE_UMS_SCHEDULER: 'true',
      },
    },
    {
      ...base,
      name: 'ums-test',
      env: {
        ...base.env,
        ...allOperationsOff,
        PORT: 5002,
        clientId: 'ums-test',
        // Supply only isolated test config/database URLs here.
        CONFIG_URL: 'REPLACE_WITH_ISOLATED_UMS_TEST_CONFIGURATION_URL',
        CONFIG_URLS: 'REPLACE_WITH_ISOLATED_UMS_TEST_CONFIGURATION_URL',
        ENABLE_UMS_TEST_SCHEDULER: 'true',
      },
    },
  ],
};
