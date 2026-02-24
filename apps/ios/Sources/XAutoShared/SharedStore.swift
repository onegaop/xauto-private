import Foundation

enum XAutoSharedKeys {
    static let appGroupID = "group.com.xauto.shared"
    static let apiBase = "xauto_api_base"
    static let pat = "xauto_pat"
    static let localFunAIEnabled = "xauto_local_fun_ai_enabled"
    static let widgetDigest = "xauto_widget_digest"
    static let widgetKind = "XAutoWidget"
    static let defaultAPIBase = "https://xauto-api-516721184000.asia-east1.run.app"
    static let offlineTestAPIBase = "https://offline.test.local"
    static let offlineTestPAT = "pat_ui_offline_smoke"
}

enum XAutoTestMode: String {
    case uiOfflineSmoke = "ui_offline_smoke"

    static let environmentKey = "XAUTO_TEST_MODE"

    static var current: XAutoTestMode? {
        guard let raw = ProcessInfo.processInfo.environment[environmentKey]?.trimmingCharacters(in: .whitespacesAndNewlines),
              !raw.isEmpty else {
            return nil
        }
        return XAutoTestMode(rawValue: raw)
    }

    static var isUIOfflineSmokeEnabled: Bool {
        current == .uiOfflineSmoke
    }
}

enum SharedDefaults {
    static var userDefaults: UserDefaults {
        UserDefaults(suiteName: XAutoSharedKeys.appGroupID) ?? .standard
    }
}

struct XAutoRuntimeConfig {
    let apiBaseURL: String
    let pat: String

    var isReady: Bool {
        !apiBaseURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !pat.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

enum RuntimeConfigStore {
    static func load() -> XAutoRuntimeConfig {
        let defaults = SharedDefaults.userDefaults
        let apiBaseURL = defaults.string(forKey: XAutoSharedKeys.apiBase) ?? XAutoSharedKeys.defaultAPIBase
        let pat = defaults.string(forKey: XAutoSharedKeys.pat) ?? ""
        return XAutoRuntimeConfig(apiBaseURL: apiBaseURL, pat: pat)
    }
}

enum WidgetDigestStore {
    static func save(snapshot: WidgetDigestSnapshot) {
        let encoder = JSONEncoder()
        guard let encoded = try? encoder.encode(snapshot) else {
            return
        }
        SharedDefaults.userDefaults.set(encoded, forKey: XAutoSharedKeys.widgetDigest)
    }

    static func load() -> WidgetDigestSnapshot? {
        guard let data = SharedDefaults.userDefaults.data(forKey: XAutoSharedKeys.widgetDigest) else {
            return nil
        }
        return try? JSONDecoder().decode(WidgetDigestSnapshot.self, from: data)
    }
}
