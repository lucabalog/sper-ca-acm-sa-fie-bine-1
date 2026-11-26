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
3. **Notify:** tap the big button to send a notification. Every tap sends one, even when you tap quickly. Hold the button for 3 seconds to send a **priority** alert.
4. **Customize:** the bottom bar has **Notifications** (history and alert style), **Widgets** and **Customize** (colors, shape, size, night mode).

### iPhone Home Screen widget (iOS 17+)

1. Touch and hold an empty part of the Home Screen (or the Lock Screen) and tap **+** (or **Customize**).
2. Search for **Notifye** and pick a size.
3. Tap the widget's button to notify your partner without opening the app. It uses the same colors as your in-app button.

To show your partner's name and send in the background, the widget reads the pairing from storage it shares with the app (an *App Group*). Some re-signing setups remove that shared storage. When it's missing, tapping the widget opens Notifye, which then sends the notification. The **Widgets** screen in the app tells you when this is happening.

### Notifications

- **While the app is open:** a banner, a sound and a vibration.
- **While the app is in the background:** a system notification, for as long as the phone keeps the app running.
- **When the app is fully closed (free, iPhone and Android):** after pairing, Notifye suggests turning this on. You can also find it any time under **Notifications → Notify me when Notifye is closed**. Tap **Turn on**:
  - **Android:** ntfy opens already subscribed. If ntfy isn't installed, Google Play opens first, and ntfy opens by itself when you come back. Back in Notifye, a test notification is sent automatically.
  - **iPhone:** your private code is copied. Open ntfy, tap **+**, paste and tap **Subscribe**. Back in Notifye, a test notification is sent automatically. The ntfy iPhone app doesn't accept subscribe links from other apps, so this one paste can't be automated.

  Each person does this once on their own phone. After that, every tap also goes to the partner's ntfy, which shows it even when Notifye is closed. During a burst of fast taps, the first tap arrives right away and the rest are combined into one follow-up ("+3 more"), because ntfy.sh allows about one message every 5 seconds and 250 a day per phone.

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
- **Closed-app notifications:** `src/utils/closedAppPush.ts` publishes each ping to the partner's [ntfy](https://ntfy.sh) topic. The topic is a long random string, and the partner's phone reads it from Firestore (`pairs/{pairId}/devices/{uid}`). The iOS widget publishes the same way.

### Project layout

```
src/
  App.tsx                  app state, Firebase listeners, sending pings
  components/              screens (NameSetupView, PairingView, PairedStudio) and sheets
  utils/                   theme colors, haptics, chime, widget bridge, deep links, notifications
ios-widget/                iOS widget + bridge sources and the Xcode setup script
android-native/            Android MainActivity (full screen)
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
  cp android-native/MainActivity.java android/app/src/main/java/com/notifye/app/MainActivity.java
  npx cap sync android
  cd android && ./gradlew assembleDebug   # app/build/outputs/apk/debug/app-debug.apk
  ```

## Limitations

- **Closed-app notifications go through ntfy.** Notifye itself can't receive push notifications, because Apple only allows that for apps signed with a paid developer account. ntfy is a separate free app that already has that permission, so it delivers the notification instead, and tapping it opens ntfy, not Notifye.
  - Messages pass through the public ntfy.sh server. Only someone who knows your long topic can read them.
  - The free tier allows 250 messages a day per phone.
- **Android signing:** the APK is signed with a temporary debug key that changes on each CI build. Updating to a newer build may mean uninstalling the old one first, which deletes the phone's saved name and pairing.
- **No Android widget yet.**
