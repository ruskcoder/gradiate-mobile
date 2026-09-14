const { withAndroidManifest, withDangerousMod, AndroidConfig } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

// Android renders the notification *small* icon as an alpha mask tinted with the
// notification colour, so it can never be a full-colour image. The *large* icon
// (the thumbnail on the trailing edge of the row, which stays visible when the
// notification is expanded) can be, and expo-notifications reads it from this
// manifest meta-data key — but its config plugin exposes no prop for it yet, so
// wire it up here.
//
// Lives in drawable-nodpi so Android doesn't density-scale the 256px bitmap up
// to 768px on xxxhdpi devices just to shrink it again for a ~64dp slot.
const SOURCE = path.join("assets", "images", "notification-large-icon.png");
const RES_DIR = path.join("android", "app", "src", "main", "res", "drawable-nodpi");
const RESOURCE_NAME = "notification_large_icon";
const META_DATA_KEY = "expo.modules.notifications.large_notification_icon";

function withLargeIconAsset(config) {
  return withDangerousMod(config, [
    "android",
    (config) => {
      const root = config.modRequest.projectRoot;
      const source = path.join(root, SOURCE);
      if (!fs.existsSync(source)) {
        throw new Error(`withNotificationLargeIcon: missing ${SOURCE}`);
      }
      const destinationDir = path.join(root, RES_DIR);
      fs.mkdirSync(destinationDir, { recursive: true });
      fs.copyFileSync(source, path.join(destinationDir, `${RESOURCE_NAME}.png`));
      return config;
    },
  ]);
}

function withLargeIconManifest(config) {
  return withAndroidManifest(config, (config) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      mainApplication,
      META_DATA_KEY,
      `@drawable/${RESOURCE_NAME}`,
      "resource"
    );
    return config;
  });
}

module.exports = function withNotificationLargeIcon(config) {
  return withLargeIconManifest(withLargeIconAsset(config));
};
