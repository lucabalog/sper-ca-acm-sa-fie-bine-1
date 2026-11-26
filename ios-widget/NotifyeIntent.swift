import AppIntents
import Foundation
import WidgetKit

// Compiled into BOTH the App target and the NotifyeWidgets extension (see setup-ios-widget.rb).

struct NotifyeWidgetState: Codable {
    var apiKey: String
    var projectId: String
    var databaseId: String
    var refreshToken: String
    var uid: String
    var displayName: String
    var pairId: String
    var partnerName: String
    var memberUids: [String]
    var buttonLabel: String
    var buttonColorHex: String
    var backgroundColorHex: String
    var normalMessage: String
    var priorityMessage: String
    var defaultUrgent: Bool
    // Exact in-app button look (optional so older saved state still decodes)
    var buttonTopHex: String? = nil
    var buttonBottomHex: String? = nil
    var buttonInkHex: String? = nil
    var buttonShape: String? = nil
    /// Partner's ntfy topic for notifications while their app is closed ('' / nil if off).
    var partnerPushTopic: String? = nil

    static let placeholder = NotifyeWidgetState(
        apiKey: "",
        projectId: "",
        databaseId: "(default)",
        refreshToken: "",
        uid: "",
        displayName: "You",
        pairId: "",
        partnerName: "Partner",
        memberUids: [],
        buttonLabel: "Think of me",
        buttonColorHex: "#F59E0B",
        backgroundColorHex: "#0B0B0F",
        normalMessage: "Your partner wants your attention",
        priorityMessage: "Your partner really needs your attention",
        defaultUrgent: false
    )

    var isPaired: Bool {
        !pairId.isEmpty && memberUids.count == 2 && !refreshToken.isEmpty && !apiKey.isEmpty
    }

    static func load() -> NotifyeWidgetState? {
        guard
            let data = NotifyeShared.loadStateData(),
            let state = try? JSONDecoder().decode(NotifyeWidgetState.self, from: data)
        else { return nil }
        return state
    }
}

// MARK: - Send intent

/// Widget button action. Conforming to LiveActivityIntent makes iOS run perform() inside the
/// Notifye app process (started in the background, nothing opens on screen) instead of the
/// widget extension, so it can use the app's own storage even when the App Group doesn't work.
/// If iOS runs it in the extension instead, it uses the App Group copy.
@available(iOS 17.0, *)
struct SendNotifyePingIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Notify Partner"
    static var description = IntentDescription("Sends a Notifye notification to your paired partner.")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Priority Alert", default: false)
    var isUrgent: Bool

    init() {
        self.isUrgent = false
    }

    init(isUrgent: Bool) {
        self.isUrgent = isUrgent
    }

    func perform() async throws -> some IntentResult {
        guard let state = NotifyeWidgetState.load(), state.isPaired else {
            NotifyeShared.setStatus("Open Notifye once to connect")
            WidgetCenter.shared.reloadAllTimelines()
            return .result()
        }

        do {
            let idToken = try await NotifyeFirestore.idToken(apiKey: state.apiKey, refreshToken: state.refreshToken)
            try await commitFirestorePing(state: state, idToken: idToken, isUrgent: isUrgent)
            await sendClosedAppPush(state: state, isUrgent: isUrgent)
            NotifyeShared.setStatus(isUrgent ? "Priority sent to \(state.partnerName)" : "Sent to \(state.partnerName)")
        } catch {
            NotifyeShared.setStatus("Couldn't send · check internet")
        }

        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }

    /// Same as sendClosedAppPush() in src/utils/closedAppPush.ts: publish to the partner's ntfy topic.
    private func sendClosedAppPush(state: NotifyeWidgetState, isUrgent: Bool) async {
        guard
            let topic = state.partnerPushTopic,
            topic.range(of: "^notifye-[a-z0-9]{24}$", options: .regularExpression) != nil,
            let url = URL(string: "https://ntfy.sh")
        else { return }
        let body: [String: Any] = [
            "topic": topic,
            "title": isUrgent ? "Priority from \(state.displayName)" : state.displayName,
            "message": isUrgent ? state.priorityMessage : state.normalMessage,
            "priority": isUrgent ? 5 : 4,
            "tags": [isUrgent ? "rotating_light" : "bell"],
        ]
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 10
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        _ = try? await URLSession.shared.data(for: req)
    }

    private func commitFirestorePing(state: NotifyeWidgetState, idToken: String, isUrgent: Bool) async throws {
        let dbId = state.databaseId.isEmpty ? "(default)" : state.databaseId
        guard let url = URL(
            string: "https://firestore.googleapis.com/v1/projects/\(state.projectId)/databases/\(dbId)/documents:commit"
        ) else {
            throw URLError(.badURL)
        }

        let nowMs = Int64(Date().timeIntervalSince1970 * 1000.0)
        let rev = String(format: "%013lld", max(0, 9999999999999 - nowMs))
        let suffix = String(state.uid.prefix(6)).filter { $0.isLetter || $0.isNumber }
        let rand = String(UUID().uuidString.prefix(4)).lowercased()
        let pingId = "\(rev)_\(suffix.isEmpty ? "wgt" : suffix)_\(rand)"

        let message = isUrgent ? state.priorityMessage : state.normalMessage
        let kind = isUrgent ? "urgent_attention" : "attention"
        let baseDocPath = "projects/\(state.projectId)/databases/\(dbId)/documents"
        let pairDocName = "\(baseDocPath)/pairs/\(state.pairId)"
        let pingDocName = "\(pairDocName)/pings/\(pingId)"

        let memberArray = state.memberUids.map { ["stringValue": $0] }

        let body: [String: Any] = [
            "writes": [
                [
                    "update": [
                        "name": pairDocName,
                        "fields": [
                            "lastPingByUid": ["stringValue": state.uid],
                            "lastPingMessage": ["stringValue": message],
                        ],
                    ],
                    "updateMask": [
                        "fieldPaths": ["lastPingByUid", "lastPingMessage"],
                    ],
                    "updateTransforms": [
                        ["fieldPath": "lastPingAt", "setToServerValue": "REQUEST_TIME"],
                        ["fieldPath": "updatedAt", "setToServerValue": "REQUEST_TIME"],
                        ["fieldPath": "pingCount", "increment": ["integerValue": "1"]],
                    ],
                ],
                [
                    "currentDocument": ["exists": false],
                    "update": [
                        "name": pingDocName,
                        "fields": [
                            "pingId": ["stringValue": pingId],
                            "pairId": ["stringValue": state.pairId],
                            "memberUids": ["arrayValue": ["values": memberArray]],
                            "senderUid": ["stringValue": state.uid],
                            "senderName": ["stringValue": state.displayName],
                            "message": ["stringValue": message],
                            "kind": ["stringValue": kind],
                            "momentCardUrl": ["stringValue": ""],
                            "aspectRatio": ["stringValue": ""],
                        ],
                    ],
                    "updateTransforms": [
                        ["fieldPath": "createdAt", "setToServerValue": "REQUEST_TIME"],
                    ],
                ],
            ],
        ]

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 15
        req.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (_, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
    }
}

// MARK: - Firestore REST helpers (shared by the widget intent and the background check)

@available(iOS 15.0, *)
enum NotifyeFirestore {
    /// Exchanges the saved Firebase refresh token for a short-lived ID token.
    static func idToken(apiKey: String, refreshToken: String) async throws -> String {
        guard let url = URL(string: "https://securetoken.googleapis.com/v1/token?key=\(apiKey)") else {
            throw URLError(.badURL)
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 15
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        let encoded = refreshToken.addingPercentEncoding(withAllowedCharacters: allowed) ?? refreshToken
        req.httpBody = "grant_type=refresh_token&refresh_token=\(encoded)".data(using: .utf8)

        let (respData, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw URLError(.userAuthenticationRequired)
        }
        guard
            let json = try JSONSerialization.jsonObject(with: respData) as? [String: Any],
            let idToken = json["id_token"] as? String
        else {
            throw URLError(.cannotParseResponse)
        }
        return idToken
    }

    struct PairSummary {
        let lastPingAt: Date?
        let lastPingByUid: String
        let lastPingMessage: String
        let status: String
    }

    /// Reads the pair's summary fields (updated on every burst of pings).
    static func pairSummary(state: NotifyeWidgetState, idToken: String) async throws -> PairSummary {
        let dbId = state.databaseId.isEmpty ? "(default)" : state.databaseId
        let fields = ["lastPingAt", "lastPingByUid", "lastPingMessage", "status"]
            .map { "mask.fieldPaths=\($0)" }
            .joined(separator: "&")
        guard let url = URL(
            string: "https://firestore.googleapis.com/v1/projects/\(state.projectId)/databases/\(dbId)/documents/pairs/\(state.pairId)?\(fields)"
        ) else {
            throw URLError(.badURL)
        }
        var req = URLRequest(url: url)
        req.timeoutInterval = 15
        req.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        let json = (try JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
        let f = (json["fields"] as? [String: Any]) ?? [:]
        func str(_ key: String) -> String {
            ((f[key] as? [String: Any])?["stringValue"] as? String) ?? ""
        }
        var date: Date?
        if let ts = (f["lastPingAt"] as? [String: Any])?["timestampValue"] as? String {
            let fmt = ISO8601DateFormatter()
            fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            date = fmt.date(from: ts) ?? ISO8601DateFormatter().date(from: ts)
        }
        return PairSummary(
            lastPingAt: date,
            lastPingByUid: str("lastPingByUid"),
            lastPingMessage: str("lastPingMessage"),
            status: str("status")
        )
    }
}
