const appJson = require("./app.json");

module.exports = ({ config }) => {
  const baseConfig = {
    ...config,
    ...appJson.expo,
  };
  const easProjectId =
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
    baseConfig.extra?.eas?.projectId ||
    undefined;

  return {
    ...baseConfig,
    extra: {
      ...(baseConfig.extra || {}),
      eas: {
        ...(baseConfig.extra?.eas || {}),
        projectId: easProjectId,
      },
    },
  };
};
