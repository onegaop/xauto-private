import SwiftUI

@main
struct XAutoApp: App {
    @StateObject private var navigation = AppNavigationState()

    init() {
        let defaults = SharedDefaults.userDefaults
        if defaults.string(forKey: XAutoSharedKeys.apiBase) == nil {
            defaults.set(XAutoSharedKeys.defaultAPIBase, forKey: XAutoSharedKeys.apiBase)
        }
        if defaults.object(forKey: XAutoSharedKeys.localFunAIEnabled) == nil {
            defaults.set(true, forKey: XAutoSharedKeys.localFunAIEnabled)
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView(selectedTab: $navigation.selectedTab)
                .onOpenURL { url in
                    if url.host == "today" {
                        navigation.selectedTab = .today
                    } else if url.host == "week" {
                        navigation.selectedTab = .week
                    } else if url.host == "settings" {
                        navigation.selectedTab = .settings
                    }
                }
        }
    }
}
