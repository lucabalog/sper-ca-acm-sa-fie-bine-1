# Notifye

Notifye is a small app for two people. You pair two phones once with a 6-character code, and then one tap on the button sends a notification to your partner. There's no account and no sign-up.

It runs as a web app and as native apps for iPhone (iOS 14+) and Android (6.0+).

## Download

Ready-made builds are attached to each [GitHub Release](../../releases):

| Platform | File | How to install |
| --- | --- | --- |
| iPhone | `Notifye-vX.Y.Z-unsigned.ipa` | Sign and install with [Sideloadly](https://sideloadly.io) or AltStore. Then on the iPhone, open **Settings → General → VPN & Device Management** and trust your Apple ID. |
| Android | `Notifye-vX.Y.Z.apk` | Open the file on the phone and allow installing from that source. |

With a free Apple ID, an iPhone sideload stops opening after 7 days. Re-sign it, or let Sideloadly refresh it automatically.

## Using the app

1. **Name:** on first launch, choose the name your partner will see.
2. **Pair:** one phone taps **Create pairing code**, and the other types that code under **Enter partner's code**.
3. **Notify:** tap the big button to send a notification. If you change the button's text in **Customize**, that text is what your partner's notification says. Every tap sends one, even when you tap quickly. Hold the button for 3 seconds to send a **priority** alert.
4. **Customize:** the bottom bar has **Notifications** (history, alert style, closed-app notifications) and **Customize** (colors, shape, size, night mode).

### iPhone Home Screen widget (iOS 17+)

1. Touch and hold an empty part of the Home Screen (or the Lock Screen) and tap **+** (or **Customize**).
2. Search for **Notifye** and pick a size.
3. Tap the widget's button to notify your partner without opening the app. It uses the same colors as your in-app button.

Tapping the widget never opens Notifye. iOS runs the send inside the Notifye app in the background, so it works even when re-signing removed the storage the app shares with its widget (an *App Group*). Without that shared storage, the widget can't show your partner's name or the "Sent" confirmation, but it still sends. Open Notifye once after installing so the widget has your pairing.

### Notifications

- **While the app is open:** a banner, a sound and a vibration.
- **While the app is in the background:** a system notification, for as long as the phone keeps the app running.
- **Android, app closed:** Notifye shows the notification itself, instantly. Nothing to set up and nothing else to install. After pairing, Notifye runs a small background connection. Android requires a permanent "Notifye: Ready for …'s taps" notification for that; you can hide it by long-pressing it and turning off **Background connection**. It restarts by itself after a reboot. Some phones (Xiaomi, Huawei, Samsung with strict battery saving) may still stop it; if taps stop arriving, set Notifye's battery usage to **Unrestricted**.
- **iPhone, app closed:** Notifye shows the notification itself, with sound, right away. While it's in the background it plays a silent sound (mixed with your music, so nothing is interrupted), which keeps it running so it can stay connected. This is not allowed for App Store apps but works for sideloaded ones; it uses a little more battery. If you swipe Notifye away in the app switcher it stops; then it falls back to a background check that iOS runs when it chooses (usually every 15 minutes to a few hours). Open Notifye again to restore instant notifications.

## How it works

- **Frontend:** React 19, Vite 8, Tailwind CSS 4 and Motion. The source is in `src/`.
- **Backend:** Firebase.
  - Anonymous Authentication gives each phone a private identity that stays on the device.
  - Firestore stores profiles, pairing codes, pairs and pings.
  - The Firestore security rules allow any signed-in device, but each device can only edit its own data.
- **Native apps:** [Capacitor 7](https://capacitorjs.com). The `ios/` and `android/` projects are generated in CI and not committed. Native plugins used:
  - `@capacitor/local-notifications`
  - `@capacitor/app` (handles the widget's `notifye://send` links)
- **iOS widget:** `ios-widget/` holds the files that `ios-widget/setup-ios-widget.rb` adds to the generated Xcode project:
  - The WidgetKit extension.
  - `NotifyeWidgetBridge`, a Capacitor plugin that shares the pairing state with the widget.
  - `NotifyeBridgeViewController`, which registers that plugin and hides the status bar.
  - The widget sends a ping itself with Firestore's REST API.
- **Android:** `android-native/MainActivity.java` replaces the generated activity. It runs the app full screen (immersive) and keeps text at 100% size. It also passes the real camera-cutout and gesture-bar sizes to the page, because Android WebView doesn't report safe areas reliably.
- **Closed-app notifications (Android):** `android-native/NotifyeListenerService.java` is a foreground service that keeps a streaming connection to the phone's private relay channel on [ntfy.sh](https://ntfy.sh) (a free public relay; the ntfy app is not needed) and shows Notifye notifications. The sender's app publishes each ping there (`src/utils/closedAppPush.ts`). The channel name is a long random string shared with the partner through Firestore (`pairs/{pairId}/devices/{uid}`).

### Project layout

```
src/
  App.tsx                  app state, Firebase listeners, sending pings
  components/              screens (NameSetupView, PairingView, PairedStudio) and sheets
  utils/                   theme colors, haptics, chime, widget bridge, deep links, notifications, background listener
ios-widget/                iOS widget + bridge sources and the Xcode setup script
android-native/            Android MainActivity (full screen), background listener service, boot receiver, manifest patch
.github/workflows/main.yml CI: builds the IPA (macOS) and the APK (Ubuntu)
firebase-applet-config.json Firebase web config (client keys, safe to ship)
```

## Development

Requirements: Node.js 22 or newer (24 recommended).

```bash
npm install
npx vite             # dev server at http://localhost:5173
npm run build        # production build in dist/
npm run lint         # type check (tsc --noEmit)
```

## Building the apps

**In CI (recommended):** every push to `main` runs `.github/workflows/main.yml`. It produces two build artifacts, `Notifye-iOS-IPA` and `Notifye-Android-APK`. When you publish a GitHub Release, the same workflow builds both apps and attaches the `.ipa` and `.apk` to that release.

**Locally:**

- **iOS** (Mac with Xcode 16 or newer): run `./build-ipa.sh`. It writes `Notifye-unsigned.ipa`.
- **Android** (JDK 21 and the Android SDK):
  ```bash
  npm install && npm run build
  npm install --no-save @capacitor/cli@^7 @capacitor/android@^7
  npx cap add android
  cp android-native/*.java android/app/src/main/java/com/notifye/app/
  python3 android-native/patch-manifest.py android/app/src/main/AndroidManifest.xml
  npx cap sync android
  cd android && ./gradlew assembleDebug   # app/build/outputs/apk/debug/app-debug.apk
  ```

## Limitations

- **Instant notifications on a closed iPhone** need Apple push, which Apple only allows for apps signed with a paid developer account. Free-signed iPhones get Notifye's background check instead (see above).
- **Android relay:** taps pass through the public ntfy.sh relay. Only someone who knows the long random channel name can read them. Fast bursts are combined ("+3 more") to stay within ntfy.sh's limits (about one message every 5 seconds, 250 a day per phone).
- **Android signing:** the APK is signed with a temporary debug key that changes on each CI build. Updating to a newer build may mean uninstalling the old one first, which deletes the phone's saved name and pairing.
- **No Android widget yet.**
