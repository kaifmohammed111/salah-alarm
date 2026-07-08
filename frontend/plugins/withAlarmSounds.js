const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Copies the built-in alarm sound files into android/app/src/main/res/raw/
 * during prebuild, so they can be attached directly to native notification
 * channels. Native channel sounds are guaranteed by Android to follow the
 * Notification volume stream, unlike JS-played audio (which follows Media
 * volume). Custom user-uploaded sounds are NOT included here — they continue
 * to be played via JS (expo-audio) and therefore follow Media volume.
 */
module.exports = function withAlarmSounds(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const rawDir = path.join(
        config.modRequest.platformProjectRoot,
        "app/src/main/res/raw",
      );
      fs.mkdirSync(rawDir, { recursive: true });

      const projectRoot = config.modRequest.projectRoot;
      const copies = [
        ["assets/sounds/beep.mp3", "beep.mp3"],
        ["assets/sounds/iqamat.mp3", "short_adhan.mp3"],
        ["assets/sounds/azan.mp3", "full_adhan.mp3"],
      ];

      for (const [src, dest] of copies) {
        const srcPath = path.join(projectRoot, src);
        const destPath = path.join(rawDir, dest);
        fs.copyFileSync(srcPath, destPath);
      }

      return config;
    },
  ]);
};
