import Foundation

/// Shared between the App target and the NotifyeWidgets extension.
enum NotifyeShared {
    static let defaultAppGroup = "group.com.notifye.app"
    static let stateKey = "notifye_widget_state"
    static let lastSentKey = "notifye_widget_last_sent_ms"
    static let lastStatusKey = "notifye_widget_last_status"

    /// The App Group both targets can actually use.
    ///
    /// Re-signing tools (Sideloadly, AltStore) rewrite the bundle ID and App Group, often to
    /// something like "group.<new bundle id>" or "group.com.notifye.app.<TEAMID>". The real
    /// group ends up in the provisioning profile embedded in each bundle, so read it from there
    /// first and only fall back to guessed names.
    static let appGroupId: String? = {
        var candidates = provisionedAppGroups()
        let bundleId = Bundle.main.bundleIdentifier ?? ""
        let appBundleId = bundleId.hasSuffix(".widgets")
            ? String(bundleId.dropLast(".widgets".count))
            : bundleId
        if !appBundleId.isEmpty {
            candidates.append("group.\(appBundleId)")
        }
        candidates.append(defaultAppGroup)
        for id in candidates
        where FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: id) != nil {
            return id
        }
        return nil
    }()

    static var defaults: UserDefaults? {
        guard let id = appGroupId else { return nil }
        return UserDefaults(suiteName: id)
    }

    /// App Groups listed in this bundle's embedded.mobileprovision (present on sideloaded and
    /// development builds; absent on App Store builds, where the fallbacks apply).
    private static func provisionedAppGroups() -> [String] {
        guard
            let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
            let data = try? Data(contentsOf: url),
            let start = data.range(of: Data("<?xml".utf8)),
            let end = data.range(of: Data("</plist>".utf8), in: start.lowerBound..<data.endIndex)
        else { return [] }
        let plistData = data.subdata(in: start.lowerBound..<end.upperBound)
        guard
            let plist = try? PropertyListSerialization.propertyList(from: plistData, format: nil) as? [String: Any],
            let entitlements = plist["Entitlements"] as? [String: Any],
            let groups = entitlements["com.apple.security.application-groups"] as? [String]
        else { return [] }
        return groups
    }
}
