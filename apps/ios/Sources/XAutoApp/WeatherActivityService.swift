import CoreLocation
import Foundation
import MapKit
import WeatherKit

struct WeatherRawSnapshot {
    let locationName: String
    let symbolName: String
    let conditionText: String
    let temperatureC: Int
    let observationDate: Date
}

struct WeatherActivityNarration {
    let summary: String
    let suggestions: [String]
    let source: String
}

struct WeatherActivityCardData {
    let raw: WeatherRawSnapshot
    let narration: WeatherActivityNarration
}

private struct WeatherSnapshotCacheRecord: Codable {
    let locationName: String
    let symbolName: String
    let conditionText: String
    let temperatureC: Int
    let observationDate: Date
}

enum WeatherActivityService {
    private static let cacheKey = "xauto.weather.latestSnapshot"

    static func fetchCurrentWeather() async throws -> WeatherRawSnapshot {
        if XAutoTestMode.isUIOfflineSmokeEnabled {
            let snapshot = WeatherRawSnapshot(
                locationName: "旧金山",
                symbolName: "cloud.sun.rain.fill",
                conditionText: "小雨",
                temperatureC: 13,
                observationDate: Date(timeIntervalSince1970: 1_772_003_600)
            )
            cache(snapshot)
            return snapshot
        }

        let location = try await DeviceLocationProvider.shared.requestCurrentLocation()
        let weather = try await WeatherService.shared.weather(for: location)
        let current = weather.currentWeather
        let locationName = await resolveLocationName(for: location)

        let snapshot = WeatherRawSnapshot(
            locationName: locationName,
            symbolName: current.symbolName,
            conditionText: localizedConditionName(from: current.condition),
            temperatureC: Int(current.temperature.converted(to: .celsius).value.rounded()),
            observationDate: current.date
        )
        cache(snapshot)
        return snapshot
    }

    static func cachedSnapshot() -> WeatherRawSnapshot? {
        guard let data = UserDefaults.standard.data(forKey: cacheKey) else {
            return nil
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard let record = try? decoder.decode(WeatherSnapshotCacheRecord.self, from: data) else {
            return nil
        }
        return WeatherRawSnapshot(
            locationName: record.locationName,
            symbolName: record.symbolName,
            conditionText: record.conditionText,
            temperatureC: record.temperatureC,
            observationDate: record.observationDate
        )
    }

    static func friendlyErrorMessage(for error: Error) -> String {
        if let locationError = error as? DeviceLocationError {
            return """
            定位失败：\(locationError.localizedDescription)
            建议：确认系统已开启定位、允许 XAuto 使用定位，并在网络稳定后重试。
            """
        }

        let nsError = error as NSError
        let lowercased = "\(error.localizedDescription) \(nsError.domain) \(nsError.userInfo)".lowercased()
        let technical = "技术信息：\(nsError.domain) (code \(nsError.code))"

        if lowercased.contains("weatherdaemon") || lowercased.contains("wdsjwt") || lowercased.contains("authenticator") {
            return """
            WeatherKit 鉴权失败，系统没有签发可用天气令牌。
            常见原因：模拟器环境限制、签名/Capability 未生效、网络或系统时间异常。
            建议：优先用真机重试；确认 App ID 与 Profile 含 WeatherKit；必要时重装 App。
            \(technical)
            """
        }
        if lowercased.contains("network") || lowercased.contains("offline") || lowercased.contains("timed out") || lowercased.contains("cannot find host") {
            return """
            天气请求失败，当前网络不可达或超时。
            建议：切换网络后重试，避免代理/防火墙拦截 Apple 天气服务。
            \(technical)
            """
        }

        return """
        天气服务暂不可用，请稍后重试。
        原因：\(error.localizedDescription)
        \(technical)
        """
    }

    private static func cache(_ snapshot: WeatherRawSnapshot) {
        let record = WeatherSnapshotCacheRecord(
            locationName: snapshot.locationName,
            symbolName: snapshot.symbolName,
            conditionText: snapshot.conditionText,
            temperatureC: snapshot.temperatureC,
            observationDate: snapshot.observationDate
        )
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        if let encoded = try? encoder.encode(record) {
            UserDefaults.standard.set(encoded, forKey: cacheKey)
        }
    }

    private static func resolveLocationName(for location: CLLocation) async -> String {
        do {
            guard let request = MKReverseGeocodingRequest(location: location) else {
                return "当前位置"
            }
            let mapItems = try await request.mapItems
            guard let mapItem = mapItems.first else {
                return "当前位置"
            }

            if let city = mapItem.addressRepresentations?.cityName, !city.isEmpty {
                return city
            }
            if let cityWithContext = mapItem.addressRepresentations?.cityWithContext(.short), !cityWithContext.isEmpty {
                return cityWithContext
            }
            if let shortAddress = mapItem.address?.shortAddress, !shortAddress.isEmpty {
                return shortAddress
            }
            if let fullAddress = mapItem.address?.fullAddress, !fullAddress.isEmpty {
                return fullAddress
            }
        } catch {}

        return "当前位置"
    }

    private static func localizedConditionName(from condition: WeatherCondition) -> String {
        let raw = String(describing: condition).lowercased()

        if raw.contains("clear") {
            return "晴朗"
        }
        if raw.contains("cloud") || raw.contains("overcast") {
            return "多云"
        }
        if raw.contains("rain") || raw.contains("drizzle") {
            return "降雨"
        }
        if raw.contains("snow") || raw.contains("sleet") {
            return "降雪"
        }
        if raw.contains("thunder") {
            return "雷暴"
        }
        if raw.contains("fog") || raw.contains("haze") {
            return "低能见度"
        }
        if raw.contains("wind") {
            return "有风"
        }

        return "天气变化"
    }
}

@MainActor
private final class DeviceLocationProvider: NSObject, CLLocationManagerDelegate {
    static let shared = DeviceLocationProvider()

    private let manager = CLLocationManager()
    private var continuation: CheckedContinuation<CLLocation, Error>?
    private var timeoutTask: Task<Void, Never>?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    func requestCurrentLocation() async throws -> CLLocation {
        guard continuation == nil else {
            throw DeviceLocationError.busy
        }

        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            let status = manager.authorizationStatus

            switch status {
            case .notDetermined:
                manager.requestWhenInUseAuthorization()
            case .authorizedAlways, .authorizedWhenInUse:
                manager.requestLocation()
            case .denied:
                finish(with: .failure(DeviceLocationError.permissionDenied))
            case .restricted:
                finish(with: .failure(DeviceLocationError.permissionRestricted))
            @unknown default:
                finish(with: .failure(DeviceLocationError.unknown))
            }

            timeoutTask?.cancel()
            timeoutTask = Task { [weak self] in
                try? await Task.sleep(for: .seconds(10))
                self?.timeoutIfNeeded()
            }
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor [weak self] in
            guard let self else {
                return
            }
            guard continuation != nil else {
                return
            }

            switch manager.authorizationStatus {
            case .authorizedAlways, .authorizedWhenInUse:
                manager.requestLocation()
            case .denied:
                finish(with: .failure(DeviceLocationError.permissionDenied))
            case .restricted:
                finish(with: .failure(DeviceLocationError.permissionRestricted))
            case .notDetermined:
                break
            @unknown default:
                finish(with: .failure(DeviceLocationError.unknown))
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        Task { @MainActor [weak self] in
            guard let self else {
                return
            }

            guard let location = locations.first(where: { $0.horizontalAccuracy > 0 }) ?? locations.last else {
                finish(with: .failure(DeviceLocationError.unavailable))
                return
            }
            finish(with: .success(location))
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor [weak self] in
            guard let self else {
                return
            }

            if let cached = manager.location {
                finish(with: .success(cached))
            } else {
                finish(with: .failure(error))
            }
        }
    }

    private func timeoutIfNeeded() {
        guard continuation != nil else {
            return
        }
        finish(with: .failure(DeviceLocationError.timeout))
    }

    private func finish(with result: Result<CLLocation, Error>) {
        guard let continuation else {
            return
        }
        self.continuation = nil
        timeoutTask?.cancel()
        timeoutTask = nil

        switch result {
        case .success(let location):
            continuation.resume(returning: location)
        case .failure(let error):
            continuation.resume(throwing: error)
        }
    }
}

private enum DeviceLocationError: LocalizedError {
    case servicesDisabled
    case permissionDenied
    case permissionRestricted
    case unavailable
    case timeout
    case busy
    case unknown

    var errorDescription: String? {
        switch self {
        case .servicesDisabled:
            return "定位服务未开启，请在系统设置中打开定位。"
        case .permissionDenied:
            return "未授权定位，请允许 XAuto 使用定位后重试。"
        case .permissionRestricted:
            return "当前设备限制了定位权限。"
        case .unavailable:
            return "暂时无法获取定位，请稍后重试。"
        case .timeout:
            return "定位超时，请检查网络与定位状态后重试。"
        case .busy:
            return "定位请求进行中，请稍候。"
        case .unknown:
            return "定位状态未知。"
        }
    }
}

enum WeatherActivityNarrationService {
    static func narrate(from snapshot: WeatherRawSnapshot) async -> WeatherActivityNarration {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            if let onDeviceNarration = await FoundationModelsWeatherNarrator.generate(from: snapshot) {
                return onDeviceNarration
            }
        }
        #endif

        return ruleBasedNarration(from: snapshot)
    }

    private static func ruleBasedNarration(from snapshot: WeatherRawSnapshot) -> WeatherActivityNarration {
        let temp = snapshot.temperatureC
        let summary: String
        let suggestions: [String]

        switch temp {
        case ..<8:
            summary = "当前\(snapshot.conditionText)，体感偏冷，适合低强度室内安排。"
            suggestions = ["优先做阅读与整理任务", "若外出建议增加保暖层"]
        case 8..<18:
            summary = "当前\(snapshot.conditionText)，温度舒适，适合专注型活动。"
            suggestions = ["可安排 30-45 分钟步行思考", "把高价值任务放在上午处理"]
        case 18..<29:
            summary = "当前\(snapshot.conditionText)，体感较好，适合推进执行类任务。"
            suggestions = ["午后安排一次短时户外", "将重要沟通放在精力峰值时段"]
        default:
            summary = "当前\(snapshot.conditionText)且偏热，建议控制户外暴露与节奏。"
            suggestions = ["把高强度活动前置到早晚", "白天优先室内深度工作"]
        }

        return WeatherActivityNarration(summary: summary, suggestions: suggestions, source: "Rule-based fallback")
    }
}

#if canImport(FoundationModels)
import FoundationModels

@available(iOS 26.0, *)
private enum FoundationModelsWeatherNarrator {
    static func generate(from snapshot: WeatherRawSnapshot) async -> WeatherActivityNarration? {
        do {
            let session = LanguageModelSession(
                instructions: "You are a concise weather operations assistant. Return exactly 3 lines: line1 summary in Chinese, line2 suggestion #1, line3 suggestion #2."
            )

            let prompt = """
            Location: \(snapshot.locationName)
            Condition: \(snapshot.conditionText)
            Temperature(C): \(snapshot.temperatureC)
            ObservationTime: \(snapshot.observationDate.ISO8601Format())
            """

            let response = try await session.respond(to: prompt)
            let text = response.content.trimmingCharacters(in: .whitespacesAndNewlines)
            let lines = text
                .split(separator: "\n")
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }

            guard let summary = lines.first else {
                return nil
            }

            let suggestions = Array(lines.dropFirst().prefix(2))
            return WeatherActivityNarration(summary: summary, suggestions: suggestions, source: "Foundation Models")
        } catch {
            return nil
        }
    }
}
#else
private enum FoundationModelsWeatherNarrator {
    static func generate(from _: WeatherRawSnapshot) async -> WeatherActivityNarration? {
        nil
    }
}
#endif
