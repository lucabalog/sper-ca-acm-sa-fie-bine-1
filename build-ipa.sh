#!/usr/bin/env bash
set -euo pipefail

echo "1/5 Installing dependencies..."
npm install

echo "2/5 Building Notifye web bundle..."
npm run build

echo "3/5 Setting up Capacitor iOS project..."
if [ -f "GoogleService-Info.plist" ]; then
  # Adds the native Google Sign-In plugin to package.json so `cap sync` registers it.
  npm install --legacy-peer-deps @capacitor/cli@^7 @capacitor/ios@^7 @capacitor-firebase/authentication@^7.5.0
else
  echo "Warning: GoogleService-Info.plist not found at repo root; building without native Google Sign-In."
  npm install --no-save @capacitor/cli@^7 @capacitor/ios@^7
fi
if [ ! -d "ios" ]; then
  npx cap add ios
fi
npx cap sync ios

echo "4/5 Configuring iOS display name, URL scheme, WidgetKit extension & app icon..."
if [ -f "ios-widget/setup-ios-widget.rb" ]; then
  if ! ruby -e "require 'xcodeproj'" 2>/dev/null; then
    gem install --no-document xcodeproj
  fi
  ruby ios-widget/setup-ios-widget.rb
fi

PLIST_PATH="ios/App/App/Info.plist"
if [ -f "$PLIST_PATH" ]; then
  /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName Notifye" "$PLIST_PATH" || \
    /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string Notifye" "$PLIST_PATH"
  /usr/libexec/PlistBuddy -c "Set :CFBundleName Notifye" "$PLIST_PATH" || true
  /usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes array" "$PLIST_PATH" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0 dict" "$PLIST_PATH" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLName string com.notifye.app" "$PLIST_PATH" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" "$PLIST_PATH" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string notifye" "$PLIST_PATH" 2>/dev/null || true
fi

ICON_DEST="ios/App/App/Assets.xcassets/AppIcon.appiconset"
if [ -f "public/pwa-512x512.png" ] && [ -d "$ICON_DEST" ]; then
  sips -z 1024 1024 public/pwa-512x512.png --out "$ICON_DEST/AppIcon-512@2x.png" >/dev/null
  cat > "$ICON_DEST/Contents.json" << 'EOF'
{
  "images" : [
    {
      "filename" : "AppIcon-512@2x.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
EOF
fi

if [ -f "GoogleService-Info.plist" ]; then
  ruby ios-native/setup-google-signin.rb
fi

echo "5/5 Archiving & packaging Notifye-unsigned.ipa..."
rm -rf build/Notifye.xcarchive build/ipa
if [ -d "ios/App/App.xcworkspace" ]; then
  XC_ARG=(-workspace ios/App/App.xcworkspace)
else
  XC_ARG=(-project ios/App/App.xcodeproj)
fi

xcodebuild \
  "${XC_ARG[@]}" \
  -scheme App \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -archivePath build/Notifye.xcarchive \
  archive \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY=""

mkdir -p build/ipa/Payload
APP_PATH=$(find build/Notifye.xcarchive/Products/Applications -maxdepth 1 -name "*.app" | head -n 1)
if [ -z "$APP_PATH" ]; then
  echo "Error: Could not find archived .app bundle." >&2
  exit 1
fi
cp -R "$APP_PATH" build/ipa/Payload/Notifye.app
(cd build/ipa && zip -r -y ../../Notifye-unsigned.ipa Payload >/dev/null)

echo "Done! Created ./Notifye-unsigned.ipa"
