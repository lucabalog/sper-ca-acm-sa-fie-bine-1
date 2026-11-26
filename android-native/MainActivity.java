package com.notifye.app;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import java.util.Locale;

/**
 * Full-screen (immersive) Notifye. Hides the status and navigation bars; swiping from the screen
 * edge shows them briefly. Copied over the generated MainActivity by the CI build.
 *
 * Android WebView doesn't reliably report env(safe-area-inset-*), so the real insets (camera
 * cutout, rounded-corner/gesture area) are pushed into the page as the CSS variables the layout
 * already uses (--safe-top/-bottom/-left/-right). Without this the header sat under the camera
 * and the bottom buttons ran into the gesture bar.
 */
public class MainActivity extends BridgeActivity {

    private int insetTop = 0;
    private int insetBottom = 0;
    private int insetLeft = 0;
    private int insetRight = 0;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NotifyeListenerPlugin.class);
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        hideSystemBars();

        WebView webView = getBridge().getWebView();
        // Android scales WebView text with the system font-size setting, which pushed labels and
        // buttons out of their boxes on phones with large fonts. The layout already sizes itself
        // to the screen, so keep text at 100%.
        webView.getSettings().setTextZoom(100);
        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            Insets cutout = windowInsets.getInsets(WindowInsetsCompat.Type.displayCutout());
            Insets visibleBars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            // Keep content above the navigation/gesture bar even while it's hidden, so taps on the
            // bottom tab bar are never swallowed by the system gesture area.
            Insets navArea = windowInsets.getInsetsIgnoringVisibility(WindowInsetsCompat.Type.navigationBars());
            insetTop = Math.max(cutout.top, visibleBars.top);
            insetBottom = Math.max(Math.max(cutout.bottom, visibleBars.bottom), navArea.bottom);
            insetLeft = Math.max(cutout.left, visibleBars.left);
            insetRight = Math.max(cutout.right, visibleBars.right);
            pushInsetsToPage();
            return windowInsets;
        });

        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView webView) {
                pushInsetsToPage();
            }
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        NotifyeListenerService.appVisible = true;
    }

    @Override
    public void onPause() {
        NotifyeListenerService.appVisible = false;
        super.onPause();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemBars();
        }
    }

    private void hideSystemBars() {
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.systemBars());
    }

    private void pushInsetsToPage() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        float density = getResources().getDisplayMetrics().density;
        String js = String.format(
            Locale.US,
            "(function(){var s=document.documentElement.style;" +
                "s.setProperty('--safe-top','%.1fpx');s.setProperty('--safe-bottom','%.1fpx');" +
                "s.setProperty('--safe-left','%.1fpx');s.setProperty('--safe-right','%.1fpx');})();",
            insetTop / density,
            insetBottom / density,
            insetLeft / density,
            insetRight / density
        );
        WebView webView = getBridge().getWebView();
        webView.post(() -> webView.evaluateJavascript(js, null));
    }
}
