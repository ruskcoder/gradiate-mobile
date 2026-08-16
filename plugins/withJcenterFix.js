const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

// `jcenter()` was removed in Gradle 9, which EAS Build now uses. Any dependency
// still declaring it fails the whole build during project evaluation:
//
//   Build file 'node_modules/@react-native-cookies/cookies/android/build.gradle' line: 70
//   > Could not find method jcenter() ...
//
// Local builds don't hit this only because the checked-out android/ project
// pins an older Gradle. jcenter has been frozen read-only since 2021 and every
// artifact that mattered was mirrored to Maven Central, so swapping the
// declaration is safe rather than merely expedient.
//
// Patched here instead of with patch-package because the file lives in a
// transitive dependency that prebuild re-installs on the builder.
const OFFENDERS = ["@react-native-cookies/cookies/android/build.gradle"];

module.exports = function withJcenterFix(config) {
  return withDangerousMod(config, [
    "android",
    (config) => {
      const root = config.modRequest.projectRoot;
      for (const relative of OFFENDERS) {
        const file = path.join(root, "node_modules", ...relative.split("/"));
        if (!fs.existsSync(file)) continue;
        const source = fs.readFileSync(file, "utf8");
        if (!source.includes("jcenter()")) continue;
        fs.writeFileSync(file, source.replace(/jcenter\(\)/g, "mavenCentral()"));
        console.log(`withJcenterFix: replaced jcenter() in ${relative}`);
      }
      return config;
    },
  ]);
};
