import AppIntents
import Foundation
import SwiftUI
import UIKit
import WidgetKit

// Storage keys and App Group lookup live in NotifyeShared.swift (compiled into both targets).

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
            let data = NotifyeShared.defaults?.data(forKey: NotifyeShared.stateKey),
            let state = try? JSONDecoder().decode(NotifyeWidgetState.self, from: data)
        else { return nil }
        return state
    }
}

// MARK: - Send intent (runs in the widget process, no app launch)

@available(iOS 17.0, *)
struct SendNotifyePingIntent: AppIntent {
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
        let defaults = NotifyeShared.defaults
        guard let state = NotifyeWidgetState.load(), state.isPaired else {
            defaults?.set("Open Notifye to pair", forKey: NotifyeShared.lastStatusKey)
            defaults?.set(Date().timeIntervalSince1970 * 1000.0, forKey: NotifyeShared.lastSentKey)
            WidgetCenter.shared.reloadAllTimelines()
            return .result()
        }

        do {
            let idToken = try await exchangeRefreshToken(apiKey: state.apiKey, refreshToken: state.refreshToken)
            try await commitFirestorePing(state: state, idToken: idToken, isUrgent: isUrgent)
            await sendClosedAppPush(state: state, isUrgent: isUrgent)
            defaults?.set(
                isUrgent ? "Priority sent to \(state.partnerName)" : "Sent to \(state.partnerName)",
                forKey: NotifyeShared.lastStatusKey
            )
        } catch {
            defaults?.set("Couldn't send · open Notifye", forKey: NotifyeShared.lastStatusKey)
        }
        defaults?.set(Date().timeIntervalSince1970 * 1000.0, forKey: NotifyeShared.lastSentKey)

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

    private func exchangeRefreshToken(apiKey: String, refreshToken: String) async throws -> String {
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

// MARK: - Timeline

struct NotifyeTimelineEntry: TimelineEntry {
    let date: Date
    let state: NotifyeWidgetState
    let isPaired: Bool
    let lastStatus: String
    let showStatus: Bool
    let statusIsError: Bool
}

private let kStatusVisibleSeconds: TimeInterval = 8

struct NotifyeProvider: TimelineProvider {
    func placeholder(in context: Context) -> NotifyeTimelineEntry {
        NotifyeTimelineEntry(
            date: Date(), state: .placeholder, isPaired: true,
            lastStatus: "", showStatus: false, statusIsError: false
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (NotifyeTimelineEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : loadEntry(at: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<NotifyeTimelineEntry>) -> Void) {
        let now = Date()
        let entry = loadEntry(at: now)
        var entries = [entry]
        if entry.showStatus {
            // Clear the "Sent" confirmation a few seconds later.
            let lastSentMs = NotifyeShared.defaults?.double(forKey: NotifyeShared.lastSentKey) ?? 0
            let clearAt = Date(timeIntervalSince1970: lastSentMs / 1000.0 + kStatusVisibleSeconds)
            if clearAt > now {
                entries.append(
                    NotifyeTimelineEntry(
                        date: clearAt, state: entry.state, isPaired: entry.isPaired,
                        lastStatus: "", showStatus: false, statusIsError: false
                    )
                )
            }
        }
        let nextRefresh = Calendar.current.date(byAdding: .minute, value: 30, to: now) ?? now
        completion(Timeline(entries: entries, policy: .after(nextRefresh)))
    }

    private func loadEntry(at date: Date) -> NotifyeTimelineEntry {
        let defaults = NotifyeShared.defaults
        let state = NotifyeWidgetState.load() ?? .placeholder
        let lastSentMs = defaults?.double(forKey: NotifyeShared.lastSentKey) ?? 0
        let showStatus = (date.timeIntervalSince1970 * 1000.0 - lastSentMs) < kStatusVisibleSeconds * 1000
        let status = showStatus ? (defaults?.string(forKey: NotifyeShared.lastStatusKey) ?? "") : ""
        let isError = status.hasPrefix("Couldn't") || status.hasPrefix("Open")
        return NotifyeTimelineEntry(
            date: date, state: state, isPaired: state.isPaired,
            lastStatus: status, showStatus: showStatus && !status.isEmpty, statusIsError: isError
        )
    }
}

// MARK: - Views

@available(iOS 17.0, *)
private struct Palette {
    let accent: Color
    let buttonTop: Color
    let buttonBottom: Color
    let bg: Color
    let bgTop: Color
    let ink: Color
    let isSquircle: Bool
    let priority = Color(hex: "#FB7185")

    init(state: NotifyeWidgetState) {
        accent = Color(hex: state.buttonColorHex)
        buttonTop = state.buttonTopHex.map { Color(hex: $0) } ?? accent.blend(with: .white, by: 0.1)
        buttonBottom = state.buttonBottomHex.map { Color(hex: $0) } ?? accent.blend(with: .black, by: 0.06)
        bg = Color(hex: state.backgroundColorHex)
        bgTop = Color(hex: state.backgroundColorHex).blend(with: .white, by: 0.08)
        if let inkHex = state.buttonInkHex {
            ink = Color(hex: inkHex)
        } else {
            ink = accent.isLight ? Color(hex: "#0B0B0F") : .white
        }
        isSquircle = state.buttonShape == "squircle"
    }

    var background: some View {
        LinearGradient(colors: [bgTop, bg], startPoint: .top, endPoint: .bottom)
    }

    /// Same vertical gradient as the in-app button: top tint → colour at 60% → bottom tint.
    var buttonFill: LinearGradient {
        LinearGradient(
            stops: [
                .init(color: buttonTop, location: 0),
                .init(color: accent, location: 0.6),
                .init(color: buttonBottom, location: 1),
            ],
            startPoint: .top,
            endPoint: .bottom
        )
    }
}

@available(iOS 17.0, *)
private struct PartnerAvatar: View {
    let name: String
    let accent: Color
    var size: CGFloat = 26

    var body: some View {
        Text(String(name.trimmingCharacters(in: .whitespaces).prefix(1)).uppercased())
            .font(.system(size: size * 0.46, weight: .bold, design: .rounded))
            .foregroundStyle(accent)
            .frame(width: size, height: size)
            .background(accent.opacity(0.18), in: Circle())
            .overlay(Circle().stroke(accent.opacity(0.35), lineWidth: 1))
    }
}

@available(iOS 17.0, *)
struct NotifyeWidgetView: View {
    @Environment(\.widgetFamily) var family
    var entry: NotifyeTimelineEntry

    private var palette: Palette { Palette(state: entry.state) }
    private var partner: String { entry.state.partnerName.isEmpty ? "Partner" : entry.state.partnerName }

    var body: some View {
        switch family {
        case .accessoryCircular: circular
        case .accessoryRectangular: rectangular
        case .systemMedium: medium
        default: small
        }
    }

    /// Paired: runs the send intent in place. Not paired / no shared state: opens Notifye via
    /// widgetURL, and the app sends the notification.
    @ViewBuilder
    private func tapToSend<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        if entry.isPaired {
            Button(intent: SendNotifyePingIntent(isUrgent: entry.state.defaultUrgent)) { content() }
                .buttonStyle(.plain)
        } else {
            content()
        }
    }

    // Lock Screen: round
    private var circular: some View {
        tapToSend {
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: entry.showStatus && !entry.statusIsError ? "checkmark" : "bell.fill")
                    .font(.system(size: 20, weight: .semibold))
            }
        }
        .widgetAccentable()
        .widgetURL(entry.isPaired ? nil : NotifyeLinks.send(urgent: entry.state.defaultUrgent))
        .containerBackground(.clear, for: .widget)
    }

    // Lock Screen: wide
    private var rectangular: some View {
        tapToSend {
            HStack(spacing: 8) {
                Image(systemName: entry.showStatus && !entry.statusIsError ? "checkmark.circle.fill" : "bell.badge.fill")
                    .font(.system(size: 22, weight: .semibold))
                VStack(alignment: .leading, spacing: 1) {
                    Text(entry.isPaired ? "Notify \(partner)" : "Notifye")
                        .font(.headline)
                        .lineLimit(1)
                    Text(entry.showStatus ? entry.lastStatus : (entry.isPaired ? "Tap to send" : "Tap to send via app"))
                        .font(.caption2)
                        .lineLimit(1)
                        .opacity(0.8)
                }
                Spacer(minLength: 0)
            }
        }
        .widgetAccentable()
        .widgetURL(entry.isPaired ? nil : NotifyeLinks.send(urgent: entry.state.defaultUrgent))
        .containerBackground(.clear, for: .widget)
    }

    // Home Screen: small
    private var small: some View {
        VStack(spacing: 0) {
            HStack(spacing: 6) {
                PartnerAvatar(name: entry.isPaired ? partner : "N", accent: palette.accent, size: 22)
                Text(entry.isPaired ? partner : "Notifye")
                    .font(.system(size: 13, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white.opacity(0.9))
                    .lineLimit(1)
                Spacer(minLength: 0)
            }

            Spacer(minLength: 4)

            if entry.isPaired {
                Button(intent: SendNotifyePingIntent(isUrgent: entry.state.defaultUrgent)) {
                    sendCircle(diameter: 64)
                }
                .buttonStyle(.plain)
            } else {
                // No shared state yet: tapping opens Notifye, which sends the notification.
                sendCircle(diameter: 64)
            }

            Spacer(minLength: 4)

            statusLine(default: entry.isPaired ? entry.state.buttonLabel : "Tap to send via app")
        }
        .widgetURL(entry.isPaired ? nil : NotifyeLinks.send(urgent: entry.state.defaultUrgent))
        .containerBackground(for: .widget) { palette.background }
    }

    // Home Screen: medium
    private var medium: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    PartnerAvatar(name: entry.isPaired ? partner : "N", accent: palette.accent, size: 30)
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Notifye")
                            .font(.system(size: 11, weight: .semibold, design: .rounded))
                            .foregroundStyle(.white.opacity(0.55))
                        Text(entry.isPaired ? partner : "Not paired")
                            .font(.system(size: 16, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
                statusLine(default: entry.isPaired ? "Tap to let them know" : "Opens Notifye to send", alignLeading: true)
            }

            Spacer(minLength: 0)

            HStack(spacing: 8) {
                let normalTile = actionTile(
                    icon: entry.showStatus && !entry.statusIsError ? "checkmark" : "bell.fill",
                    title: entry.state.buttonLabel,
                    fill: AnyShapeStyle(palette.buttonFill),
                    ink: palette.ink,
                    width: 84,
                    stroke: .white.opacity(0.22)
                )
                let priorityTile = actionTile(
                    icon: "exclamationmark.2",
                    title: "Priority",
                    fill: AnyShapeStyle(palette.priority.opacity(0.2)),
                    ink: Color(hex: "#FDA4AF"),
                    width: 66,
                    stroke: palette.priority.opacity(0.45)
                )
                if entry.isPaired {
                    Button(intent: SendNotifyePingIntent(isUrgent: false)) { normalTile }
                        .buttonStyle(.plain)
                    Button(intent: SendNotifyePingIntent(isUrgent: true)) { priorityTile }
                        .buttonStyle(.plain)
                } else {
                    // No shared state yet: open Notifye, which sends the notification.
                    Link(destination: NotifyeLinks.send(urgent: false)) { normalTile }
                    Link(destination: NotifyeLinks.send(urgent: true)) { priorityTile }
                }
            }
        }
        .containerBackground(for: .widget) { palette.background }
    }

    private func sendCircle(diameter: CGFloat) -> some View {
        let sent = entry.showStatus && !entry.statusIsError
        let shape = palette.isSquircle
            ? AnyShape(RoundedRectangle(cornerRadius: diameter * 0.3, style: .continuous))
            : AnyShape(Circle())
        return ZStack {
            shape
                .fill(palette.buttonFill)
                .shadow(color: palette.accent.opacity(0.4), radius: 12, y: 2)
            shape.stroke(
                LinearGradient(colors: [.white.opacity(0.4), .clear], startPoint: .top, endPoint: .center),
                lineWidth: 1
            )
            Image(systemName: sent ? "checkmark" : "bell.badge.fill")
                .font(.system(size: diameter * 0.32, weight: .bold))
                .foregroundStyle(palette.ink)
                .contentTransition(.symbolEffect(.replace))
        }
        .frame(width: diameter, height: diameter)
    }

    private func actionTile(
        icon: String, title: String, fill: AnyShapeStyle, ink: Color, width: CGFloat, stroke: Color = .clear
    ) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 20, weight: .bold))
                .contentTransition(.symbolEffect(.replace))
            Text(title)
                .font(.system(size: 11, weight: .semibold, design: .rounded))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .foregroundStyle(ink)
        .frame(width: width)
        .frame(maxHeight: .infinity)
        .background(fill, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(stroke, lineWidth: 1))
    }

    private func statusLine(default text: String, alignLeading: Bool = false) -> some View {
        Text(entry.showStatus ? entry.lastStatus : text)
            .font(.system(size: 11, weight: entry.showStatus ? .semibold : .medium, design: .rounded))
            .foregroundStyle(
                entry.showStatus
                    ? (entry.statusIsError ? Color(hex: "#FDA4AF") : palette.accent)
                    : .white.opacity(0.6)
            )
            .lineLimit(alignLeading ? 2 : 1)
            .minimumScaleFactor(0.8)
            .multilineTextAlignment(alignLeading ? .leading : .center)
    }
}

@available(iOS 17.0, *)
struct NotifyeQuickButtonWidget: Widget {
    let kind: String = "NotifyeQuickButtonWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: NotifyeProvider()) { entry in
            NotifyeWidgetView(entry: entry)
        }
        .configurationDisplayName("Notify Partner")
        .description("Tap to send a notification to your partner without opening the app.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
    }
}

@available(iOS 17.0, *)
@main
struct NotifyeWidgetBundle: WidgetBundle {
    var body: some Widget {
        NotifyeQuickButtonWidget()
    }
}

// MARK: - Deep links (handled in src/utils/deepLinks.ts)

enum NotifyeLinks {
    static func send(urgent: Bool) -> URL {
        URL(string: urgent ? "notifye://send?kind=priority" : "notifye://send")!
    }
}

// MARK: - Color helpers

extension Color {
    init(hex: String) {
        let cleaned = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: cleaned).scanHexInt64(&int)
        let r, g, b: UInt64
        if cleaned.count == 6 {
            (r, g, b) = ((int >> 16) & 0xFF, (int >> 8) & 0xFF, int & 0xFF)
        } else {
            (r, g, b) = (245, 158, 11)
        }
        self.init(.sRGB, red: Double(r) / 255.0, green: Double(g) / 255.0, blue: Double(b) / 255.0, opacity: 1.0)
    }

    private var rgb: (Double, Double, Double) {
        let ui = UIColor(self)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        ui.getRed(&r, green: &g, blue: &b, alpha: &a)
        return (Double(r), Double(g), Double(b))
    }

    var isLight: Bool {
        let (r, g, b) = rgb
        return (0.299 * r + 0.587 * g + 0.114 * b) > 0.6
    }

    func blend(with other: Color, by amount: Double) -> Color {
        let (r1, g1, b1) = rgb
        let (r2, g2, b2) = other.rgb
        let t = max(0, min(1, amount))
        return Color(.sRGB, red: r1 + (r2 - r1) * t, green: g1 + (g2 - g1) * t, blue: b1 + (b2 - b1) * t, opacity: 1)
    }
}
