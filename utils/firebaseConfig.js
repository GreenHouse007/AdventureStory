const FIREBASE_CONFIG_MAP = {
  FIREBASE_API_KEY: "apiKey",
  FIREBASE_AUTH_DOMAIN: "authDomain",
  FIREBASE_PROJECT_ID: "projectId",
  FIREBASE_STORAGE_BUCKET: "storageBucket",
  FIREBASE_MESSAGING_SENDER_ID: "messagingSenderId",
  FIREBASE_APP_ID: "appId",
  FIREBASE_MEASUREMENT_ID: "measurementId",
};

const buildFirebaseConfig = () => {
  const config = {};
  Object.entries(FIREBASE_CONFIG_MAP).forEach(([envKey, configKey]) => {
    if (process.env[envKey]) {
      config[configKey] = process.env[envKey];
    }
  });
  return config;
};

module.exports = { buildFirebaseConfig };
