import AVFoundation
import Capacitor
import Foundation
import UIKit
import UserNotifications

/// Instant notifications on iPhone without Apple push (which needs a paid developer account).
///
/// iOS suspends apps shortly after they leave the screen. An app that is playing audio is kept
/// running, so Notifye plays a silent, looping sound (mixed with other audio, so music isn't
/// interrupted) while it's in the background. That keeps this listener's streaming connection to
/// the phone's private relay channel open, and every partner tap becomes a Notifye notification
/// with sound right away. Same relay channel as the Android NotifyeListenerService.
///
/// This is not allowed on the App Store but works for sideloaded installs. It stops if the user
/// swipes Notifye away in the app switcher; NotifyeBackgroundCheck is the fallback then.
final class NotifyeLiveListener: NSObject, URLSessionDataDelegate {
    static let shared = NotifyeLiveListener()

    private static let topicKey = "notifye_listener_topic"
    private static let partnerKey = "notifye_listener_partner"
    private static let lastIdKey = "notifye_listener_last_id"

    private var session: URLSession?
    private var task: URLSessionDataTask?
    private var buffer = Data()
    private var backoff: TimeInterval = 2
    private var running = false
    private var player: AVAudioPlayer?
    private let queue = DispatchQueue(label: "notifye.listener")

    private var topic: String {
        let t = UserDefaults.standard.string(forKey: Self.topicKey) ?? ""
        return t.range(of: "^notifye-[a-z0-9]{24}$", options: .regularExpression) != nil ? t : ""
    }

    // MARK: Lifecycle

    func configure(topic: String, partnerName: String) {
        UserDefaults.standard.set(topic, forKey: Self.topicKey)
        UserDefaults.standard.set(partnerName, forKey: Self.partnerKey)
        start()
    }

    func clear() {
        UserDefaults.standard.removeObject(forKey: Self.topicKey)
        stop()
    }

    /// Called at launch and when the app is configured; no-op if not paired.
    func start() {
        queue.async {
            guard !self.topic.isEmpty, !self.running else { return }
            self.running = true
            self.backoff = 2
            self.connect()
        }
        DispatchQueue.main.async { self.startKeepAlive() }
    }

    func stop() {
        queue.async {
            self.running = false
            self.task?.cancel()
            self.task = nil
        }
        DispatchQueue.main.async { self.stopKeepAlive() }
    }

    /// The app came back on screen: make sure the connection and keep-alive are healthy.
    func appBecameActive() {
        if topic.isEmpty { return }
        start()
        queue.async {
            // A connection that survived a long suspension may be dead; reconnect right away.
            if self.running, self.task?.state != .running { self.connect() }
        }
    }

    // MARK: Streaming connection

    private func connect() {
        guard running, !topic.isEmpty else { return }
        task?.cancel()
        buffer.removeAll()
        let lastId = UserDefaults.standard.string(forKey: Self.lastIdKey) ?? ""
        var urlString = "https://ntfy.sh/\(topic)/json"
        if !lastId.isEmpty { urlString += "?since=\(lastId)" }
        guard let url = URL(string: urlString) else { return }
        var req = URLRequest(url: url)
        req.timeoutInterval = 90 // the relay sends a keepalive about every 45 s
        req.setValue("Notifye-iOS", forHTTPHeaderField: "User-Agent")
        if session == nil {
            let config = URLSessionConfiguration.default
            config.timeoutIntervalForRequest = 90
            config.timeoutIntervalForResource = 60 * 60 * 24
            config.waitsForConnectivity = true
            session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
        }
        task = session?.dataTask(with: req)
        task?.resume()
    }

    private func scheduleReconnect() {
        guard running else { return }
        let delay = backoff
        backoff = min(backoff * 2, 60)
        queue.asyncAfter(deadline: .now() + delay) { [weak self] in self?.connect() }
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        queue.async {
            self.backoff = 2
            self.buffer.append(data)
            while let nl = self.buffer.firstIndex(of: 0x0A) {
                let line = self.buffer.subdata(in: self.buffer.startIndex..<nl)
                self.buffer.removeSubrange(self.buffer.startIndex...nl)
                self.handle(line: line)
            }
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        queue.async {
            guard task === self.task else { return }
            self.scheduleReconnect()
        }
    }

    private func handle(line: Data) {
        guard
            let obj = try? JSONSerialization.jsonObject(with: line) as? [String: Any],
            obj["event"] as? String == "message"
        else { return }
        if let id = obj["id"] as? String { UserDefaults.standard.set(id, forKey: Self.lastIdKey) }
        let time = (obj["time"] as? Double) ?? Date().timeIntervalSince1970
        if Date().timeIntervalSince1970 - time > 600 { return } // stale replay after long offline
        let title = (obj["title"] as? String) ?? "Notifye"
        let body = (obj["message"] as? String) ?? "Your partner wants your attention"
        let urgent = ((obj["priority"] as? Int) ?? 3) >= 5
        DispatchQueue.main.async {
            // On screen, the in-app banner + chime already show the tap.
            guard UIApplication.shared.applicationState != .active else { return }
            NotifyeLiveListener.notify(title: urgent ? "⚠️ \(title)" : title, body: body)
        }
    }

    static func notify(title: String, body: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        if #available(iOS 15.0, *) { content.interruptionLevel = .timeSensitive }
        let req = UNNotificationRequest(identifier: "notifye-live-\(UUID().uuidString)", content: content, trigger: nil)
        UNUserNotificationCenter.current().add(req)
        NotifyeBackgroundCheck.markSeen() // the background check must not repeat this tap
    }

    // MARK: Background keep-alive (silent audio)

    private func startKeepAlive() {
        guard !topic.isEmpty else { return }
        let audio = AVAudioSession.sharedInstance()
        try? audio.setCategory(.playback, options: [.mixWithOthers])
        try? audio.setActive(true)
        if player == nil {
            player = try? AVAudioPlayer(data: Self.silentWav())
            player?.numberOfLoops = -1
            player?.volume = 0
        }
        player?.play()
        NotificationCenter.default.removeObserver(self, name: AVAudioSession.interruptionNotification, object: nil)
        NotificationCenter.default.addObserver(
            self, selector: #selector(audioInterrupted(_:)),
            name: AVAudioSession.interruptionNotification, object: nil
        )
    }

    private func stopKeepAlive() {
        player?.stop()
        NotificationCenter.default.removeObserver(self, name: AVAudioSession.interruptionNotification, object: nil)
    }

    /// Phone calls, Siri, alarms pause the silent sound; restart it afterwards.
    @objc private func audioInterrupted(_ note: Notification) {
        guard
            let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
            AVAudioSession.InterruptionType(rawValue: raw) == .ended
        else { return }
        try? AVAudioSession.sharedInstance().setActive(true)
        player?.play()
    }

    /// One second of 8 kHz mono 16-bit silence as a WAV file.
    private static func silentWav() -> Data {
        let sampleRate: UInt32 = 8000
        let samples = Int(sampleRate)
        var d = Data()
        func u32(_ v: UInt32) { var x = v.littleEndian; d.append(Data(bytes: &x, count: 4)) }
        func u16(_ v: UInt16) { var x = v.littleEndian; d.append(Data(bytes: &x, count: 2)) }
        d.append(contentsOf: Array("RIFF".utf8)); u32(UInt32(36 + samples * 2))
        d.append(contentsOf: Array("WAVE".utf8))
        d.append(contentsOf: Array("fmt ".utf8)); u32(16); u16(1); u16(1); u32(sampleRate); u32(sampleRate * 2); u16(2); u16(16)
        d.append(contentsOf: Array("data".utf8)); u32(UInt32(samples * 2))
        d.append(Data(count: samples * 2))
        return d
    }
}

/// JS bridge, same name and methods as the Android plugin (src/utils/backgroundListener.ts).
@objc(NotifyeListenerPlugin)
public class NotifyeListenerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NotifyeListenerPlugin"
    public let jsName = "NotifyeListener"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openBatterySettings", returnType: CAPPluginReturnPromise),
    ]

    @objc func start(_ call: CAPPluginCall) {
        let topic = call.getString("topic") ?? ""
        guard topic.range(of: "^notifye-[a-z0-9]{24}$", options: .regularExpression) != nil else {
            call.reject("Invalid topic")
            return
        }
        NotifyeLiveListener.shared.configure(topic: topic, partnerName: call.getString("partnerName") ?? "")
        call.resolve()
    }

    @objc func stop(_ call: CAPPluginCall) {
        NotifyeLiveListener.shared.clear()
        call.resolve()
    }

    @objc func openBatterySettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url)
            }
        }
        call.resolve()
    }
}
