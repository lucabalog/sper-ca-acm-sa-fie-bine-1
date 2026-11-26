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
        NotifyeShared.saveStateData(jsonData)
        reloadWidgets()
        let group = NotifyeShared.appGroupId
        call.resolve(["appGroupAvailable": group != nil, "appGroup": group ?? ""])
    }

    @objc func clearWidgetState(_ call: CAPPluginCall) {
        NotifyeShared.clearStateData()
        reloadWidgets()
        call.resolve()
    }

    private func reloadWidgets() {
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
    }
}
