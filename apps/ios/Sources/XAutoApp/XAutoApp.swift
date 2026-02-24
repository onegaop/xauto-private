import SwiftUI

@main
struct XAutoApp: App {
    @StateObject private var navigation = AppNavigationState()

    init() {
        let defaults = SharedDefaults.userDefaults
        if XAutoTestMode.isUIOfflineSmokeEnabled {
            defaults.set(XAutoSharedKeys.offlineTestAPIBase, forKey: XAutoSharedKeys.apiBase)
            defaults.set(XAutoSharedKeys.offlineTestPAT, forKey: XAutoSharedKeys.pat)
        } else if defaults.string(forKey: XAutoSharedKeys.apiBase) == nil {
            defaults.set(XAutoSharedKeys.defaultAPIBase, forKey: XAutoSharedKeys.apiBase)
        }
        if defaults.object(forKey: XAutoSharedKeys.localFunAIEnabled) == nil {
            defaults.set(true, forKey: XAutoSharedKeys.localFunAIEnabled)
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(navigation)
                .onOpenURL { url in
                    if url.host == "today" {
                        navigation.selectedTab = .today
                        navigation.scrollToDigest = true
                    } else if url.host == "week" {
                        navigation.selectedTab = .week
                    } else if url.host == "settings" {
                        navigation.selectedTab = .settings
                    }
                }
        }
    }
}
