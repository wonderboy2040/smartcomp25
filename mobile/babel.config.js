module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // reanimated plugin MUST be last per docs to avoid HMR errors
      'react-native-reanimated/plugin',
    ],
  };
};
