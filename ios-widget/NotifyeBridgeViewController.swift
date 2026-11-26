import Capacitor
import UIKit

/// Capacitor 7 only auto-registers plugins from npm packages (capacitor.config.json
/// `packageClassList`). App-local plugins must be registered explicitly, otherwise the JS side
/// never sees `NotifyeWidgetBridge` and the widget never receives the pairing state.
/// setup-ios-widget.rb points Main.storyboard at this class.
class NotifyeBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(NotifyeWidgetBridge())
        // Full screen: no status bar; the web layout pads for the notch via safe-area insets.
        setStatusBarVisible(false)
    }

    override var prefersHomeIndicatorAutoHidden: Bool {
        true
    }
}
