const { withAppBuildGradle } = require("expo/config-plugins");

// Prebuild regenerates android/app/build.gradle with `release { signingConfig
// signingConfigs.debug }`, which silently signs release bundles with the debug
// key. This re-applies the upload keystore on every prebuild. Credentials live
// in ~/.gradle/gradle.properties, never in the repo.
const RELEASE_CONFIG = `        release {
            if (project.hasProperty('GRADEXIS_UPLOAD_STORE_FILE')) {
                storeFile file(GRADEXIS_UPLOAD_STORE_FILE)
                storePassword GRADEXIS_UPLOAD_STORE_PASSWORD
                keyAlias GRADEXIS_UPLOAD_KEY_ALIAS
                keyPassword GRADEXIS_UPLOAD_KEY_PASSWORD
            }
        }
`;

// lintVital runs on every release build and OOMs the Gradle daemon on a 16GB
// machine. Disabled here so `./gradlew bundleRelease` works unqualified; run
// `./gradlew lintRelease` on its own when you want the checks.
const LINT_CONFIG = `    lint {
        checkReleaseBuilds false
    }
`;

module.exports = function withReleaseSigning(config) {
  // EAS Build manages signing itself: it installs the keystore it holds for the
  // project and injects its own credentials into the same `signingConfigs`
  // block the signing half of this plugin rewrites. Both editing it produces a
  // build.gradle that dies in the "Run gradlew" phase. That half is only needed
  // for LOCAL release builds, where prebuild would otherwise leave release
  // signed with the debug key — so on EAS we keep the lint guard (lintVital
  // OOMs release builds there too) and leave signing alone.
  const onEas = !!process.env.EAS_BUILD;

  return withAppBuildGradle(config, (config) => {
    let gradle = config.modResults.contents;

    if (!gradle.includes("checkReleaseBuilds")) {
      const androidBlock = "android {\n";
      if (!gradle.includes(androidBlock)) {
        throw new Error(
          "withReleaseSigning: could not find android block in build.gradle"
        );
      }
      gradle = gradle.replace(androidBlock, androidBlock + LINT_CONFIG);
    }

    if (onEas) {
      config.modResults.contents = gradle;
      return config;
    }

    if (!gradle.includes("GRADEXIS_UPLOAD_STORE_FILE")) {
      const anchor = "    signingConfigs {\n";
      if (!gradle.includes(anchor)) {
        throw new Error(
          "withReleaseSigning: could not find signingConfigs block in build.gradle"
        );
      }
      gradle = gradle.replace(anchor, anchor + RELEASE_CONFIG);
    }

    // Only the release buildType's line follows the stock RN warning comment.
    const releaseSigning =
      /(signed-apk-android\.\s*\n\s*)signingConfig signingConfigs\.debug/;
    if (releaseSigning.test(gradle)) {
      gradle = gradle.replace(
        releaseSigning,
        "$1signingConfig project.hasProperty('GRADEXIS_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug"
      );
    } else if (!gradle.includes("signingConfigs.release")) {
      throw new Error(
        "withReleaseSigning: could not patch release buildType signingConfig"
      );
    }

    config.modResults.contents = gradle;
    return config;
  });
};
