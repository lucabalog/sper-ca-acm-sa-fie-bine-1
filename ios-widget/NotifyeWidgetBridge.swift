import Capacitor
import Foundation
import WidgetKit

@objc(NotifyeWidgetBridge)
public class NotifyeWidgetBridge: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NotifyeWidgetBridge"
    public let jsName = "NotifyeWidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "syncWidgetState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearWidgetState", returnType: CAPPluginReturnPromise)
    ]

    @objc func syncWidgetState(_ call: CAPPluginCall) {
        guard let jsonData = try? JSONSerialization.data(withJSONObject: call.options ?? [:]) else {
            call.reject("Invalid widget state payload")
            return
        }
        guard let defaults = NotifyeShared.defaults else {
            // Not entitled to any App Group (e.g. re-signed without one): the widget can't read state.
            call.resolve(["appGroupAvailable": false])
            return
        }
        defaults.set(jsonData, forKey: NotifyeShared.stateKey)
        reloadWidgets()
        call.resolve(["appGroupAvailable": true, "appGroup": NotifyeShared.appGroupId ?? ""])
    }

    @objc func clearWidgetState(_ call: CAPPluginCall) {
        NotifyeShared.defaults?.removeObject(forKey: NotifyeShared.stateKey)
        reloadWidgets()
        call.resolve()
    }

    private func reloadWidgets() {
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
    }
}
