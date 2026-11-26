import BackgroundTasks
import Foundation
import UserNotifications

/// Lets the Notifye app itself notify you while it's closed, without Apple push (which needs a
/// paid developer account). iOS wakes the app in the background from time to time; each wake
/// reads the pair's latest ping from Firestore and shows a local notification if your partner
/// sent something since you last had the app open.
///
/// iOS decides when to run this: typically every 15 minutes to a few hours, based on how often
/// you use the app, battery and Low Power Mode. It doesn't run after you swipe the app away in
/// the app switcher. For instant delivery, use the optional ntfy setup.
enum NotifyeBackgroundCheck {
    static let taskId = "com.notifye.app.refresh"
    private static let lastSeenKey = "notifye_bg_last_seen_ms"

    /// Call from application(_:didFinishLaunchingWithOptions:), before it returns.
    static func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: taskId, using: nil) { task in
            guard let refresh = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            handle(refresh)
        }
    }

    /// The user is looking at the app, so everything up to now has been seen.
    static func markSeen() {
        UserDefaults.standard.set(Date().timeIntervalSince1970 * 1000.0, forKey: lastSeenKey)
    }

    static func schedule() {
        let request = BGAppRefreshTaskRequest(identifier: taskId)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    private static func handle(_ task: BGAppRefreshTask) {
        schedule() // keep the chain going
        guard #available(iOS 15.0, *) else {
            task.setTaskCompleted(success: true)
            return
        }
        let work = Task {
            let ok = await checkOnce()
            task.setTaskCompleted(success: ok)
        }
        task.expirationHandler = { work.cancel() }
    }

    /// Returns true if the check completed (with or without a notification).
    @available(iOS 15.0, *)
    @discardableResult
    static func checkOnce() async -> Bool {
        guard
            let data = NotifyeShared.loadStateData(),
            let state = try? JSONDecoder().decode(NotifyeWidgetState.self, from: data),
            state.isPaired
        else { return true }

        do {
            let token = try await NotifyeFirestore.idToken(apiKey: state.apiKey, refreshToken: state.refreshToken)
            let pair = try await NotifyeFirestore.pairSummary(state: state, idToken: token)
            guard pair.status == "active", let at = pair.lastPingAt else { return true }

            let atMs = at.timeIntervalSince1970 * 1000.0
            let lastSeen = UserDefaults.standard.double(forKey: lastSeenKey)
            guard atMs > lastSeen, pair.lastPingByUid != state.uid, !pair.lastPingByUid.isEmpty else {
                return true
            }
            UserDefaults.standard.set(atMs, forKey: lastSeenKey)

            let content = UNMutableNotificationContent()
            content.title = state.partnerName.isEmpty ? "Notifye" : "Notifye · \(state.partnerName)"
            content.body = pair.lastPingMessage.isEmpty ? "Your partner wants your attention" : pair.lastPingMessage
            content.sound = .default
            let request = UNNotificationRequest(identifier: "notifye-bg-\(Int(atMs))", content: content, trigger: nil)
            try await UNUserNotificationCenter.current().add(request)
            return true
        } catch {
            return false
        }
    }
}
