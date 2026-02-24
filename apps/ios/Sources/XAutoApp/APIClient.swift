import Foundation

enum APIClientError: LocalizedError {
    case missingPAT
    case invalidBaseURL
    case invalidResponse
    case httpError(code: Int, message: String)
    case blockedExternalRequestInTestMode(request: String)

    var errorDescription: String? {
        switch self {
        case .missingPAT:
            return "PAT is missing. Please set it in Settings."
        case .invalidBaseURL:
            return "API Base URL is invalid."
        case .invalidResponse:
            return "Invalid server response."
        case .httpError(let code, let message):
            return "HTTP \(code): \(message)"
        case .blockedExternalRequestInTestMode(let request):
            return "Blocked external request in test mode: \(request)"
        }
    }
}

final class APIClient {
    static let shared = APIClient()

    private init() {}

    func fetchTodayDigest() async throws -> DigestResponse? {
        try await request(path: "/v1/mobile/digest/today", queryItems: [], responseType: DigestResponse?.self)
    }

    func fetchWeekDigest() async throws -> DigestResponse? {
        try await request(path: "/v1/mobile/digest/week", queryItems: [], responseType: DigestResponse?.self)
    }

    func fetchItems(limit: Int = 20, cursor: String?) async throws -> ItemListResponse {
        var queryItems = [URLQueryItem(name: "limit", value: String(limit))]
        if let cursor, !cursor.isEmpty {
            queryItems.append(URLQueryItem(name: "cursor", value: cursor))
        }
        return try await request(path: "/v1/mobile/items", queryItems: queryItems, responseType: ItemListResponse.self)
    }

    func fetchItems(
        limit: Int = 20,
        cursor: String?,
        tag: String?,
        claimLabel: ClaimLabel?,
        qualityMin: Double?
    ) async throws -> ItemListResponse {
        var queryItems = [URLQueryItem(name: "limit", value: String(limit))]
        if let cursor, !cursor.isEmpty {
            queryItems.append(URLQueryItem(name: "cursor", value: cursor))
        }
        if let tag, !tag.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            queryItems.append(URLQueryItem(name: "tag", value: tag))
        }
        if let claimLabel {
            queryItems.append(URLQueryItem(name: "claimLabel", value: claimLabel.rawValue))
        }
        if let qualityMin {
            queryItems.append(URLQueryItem(name: "qualityMin", value: String(format: "%.2f", qualityMin)))
        }
        return try await request(path: "/v1/mobile/items", queryItems: queryItems, responseType: ItemListResponse.self)
    }

    func fetchItem(tweetId: String) async throws -> BookmarkItemResponse {
        try await request(path: "/v1/mobile/items/\(tweetId)", queryItems: [], responseType: BookmarkItemResponse.self)
    }

    func fetchDigestHistory(period: DigestPeriod, limit: Int = 10, cursor: String?) async throws -> DigestHistoryResponse {
        var queryItems = [
            URLQueryItem(name: "period", value: period.rawValue),
            URLQueryItem(name: "limit", value: String(limit))
        ]
        if let cursor, !cursor.isEmpty {
            queryItems.append(URLQueryItem(name: "cursor", value: cursor))
        }
        return try await request(path: "/v1/mobile/digest/history", queryItems: queryItems, responseType: DigestHistoryResponse.self)
    }

    func fetchSummaryStats(range: StatsRange) async throws -> SummaryStatsResponse {
        let queryItems = [URLQueryItem(name: "range", value: range.rawValue)]
        return try await request(path: "/v1/mobile/summary/stats", queryItems: queryItems, responseType: SummaryStatsResponse.self)
    }

    func lookupVocabulary(request payload: VocabularyLookupRequest) async throws -> VocabularyLookupResponse {
        let bodyData = try JSONEncoder().encode(payload)
        return try await request(
            path: "/v1/mobile/vocabulary/lookup",
            queryItems: [],
            method: "POST",
            bodyData: bodyData,
            responseType: VocabularyLookupResponse.self
        )
    }

    private func request<T: Decodable>(
        path: String,
        queryItems: [URLQueryItem],
        method: String = "GET",
        bodyData: Data? = nil,
        responseType: T.Type
    ) async throws -> T {
        let decoder = JSONDecoder()
        let normalizedMethod = method.uppercased()

        if XAutoTestMode.isUIOfflineSmokeEnabled {
            if let fixtureData = try fixtureData(
                path: path,
                queryItems: queryItems,
                method: normalizedMethod,
                bodyData: bodyData
            ) {
                return try decoder.decode(T.self, from: fixtureData)
            }
            throw APIClientError.blockedExternalRequestInTestMode(request: "\(normalizedMethod) \(path)")
        }

        let config = RuntimeConfigStore.load()
        guard !config.pat.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw APIClientError.missingPAT
        }

        guard var components = URLComponents(string: config.apiBaseURL) else {
            throw APIClientError.invalidBaseURL
        }

        components.path = normalizedPath(basePath: components.path, endpointPath: path)
        components.queryItems = queryItems.isEmpty ? nil : queryItems

        guard let url = components.url else {
            throw APIClientError.invalidBaseURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = normalizedMethod
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(config.pat)", forHTTPHeaderField: "Authorization")
        if let bodyData {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = bodyData
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIClientError.invalidResponse
        }

        guard (200..<300).contains(http.statusCode) else {
            let serverMessage = String(data: data, encoding: .utf8) ?? "Request failed"
            throw APIClientError.httpError(code: http.statusCode, message: serverMessage)
        }

        return try decoder.decode(T.self, from: data)
    }

    private func normalizedPath(basePath: String, endpointPath: String) -> String {
        let cleanedBase = basePath.hasSuffix("/") ? String(basePath.dropLast()) : basePath
        let cleanedEndpoint = endpointPath.hasPrefix("/") ? endpointPath : "/\(endpointPath)"
        if cleanedBase.isEmpty || cleanedBase == "/" {
            return cleanedEndpoint
        }
        return cleanedBase + cleanedEndpoint
    }

    private func fixtureData(
        path: String,
        queryItems: [URLQueryItem],
        method: String,
        bodyData: Data?
    ) throws -> Data? {
        switch (method, path) {
        case ("GET", "/v1/mobile/digest/today"):
            return try encodeFixture(fixtureDigest(period: "daily", periodKey: "2026-02-24"))
        case ("GET", "/v1/mobile/digest/week"):
            return try encodeFixture(fixtureDigest(period: "weekly", periodKey: "2026-W09"))
        case ("GET", "/v1/mobile/items"):
            return try encodeFixture([
                "items": [
                    fixtureItem(tweetId: "190000000000001", authorName: "Ouro", text: "Agentic coding workflow and review loop"),
                    fixtureItem(tweetId: "190000000000002", authorName: "XAuto", text: "PR smoke checks and release gating strategy")
                ],
                "nextCursor": NSNull()
            ])
        case ("GET", "/v1/mobile/digest/history"):
            let period = queryValue(named: "period", from: queryItems) == "weekly" ? "weekly" : "daily"
            let periodKey = period == "weekly" ? "2026-W09" : "2026-02-24"
            return try encodeFixture([
                "items": [fixtureDigest(period: period, periodKey: periodKey)],
                "nextCursor": NSNull()
            ])
        case ("GET", "/v1/mobile/summary/stats"):
            let range = queryValue(named: "range", from: queryItems) ?? "7d"
            return try encodeFixture([
                "range": range,
                "from": "2026-02-17T00:00:00Z",
                "to": "2026-02-24T00:00:00Z",
                "totalSummaries": 8,
                "avgQualityScore": 0.84,
                "actionItemCount": 14,
                "topTags": [
                    ["tag": "AI 工程", "count": 5],
                    ["tag": "开发效率", "count": 3]
                ],
                "claimLabelDistribution": [
                    ["label": "fact", "count": 6],
                    ["label": "opinion", "count": 2]
                ],
                "topResearchKeywords": [
                    ["keyword": "codex", "count": 3],
                    ["keyword": "xcode-cloud", "count": 2]
                ]
            ])
        case ("POST", "/v1/mobile/vocabulary/lookup"):
            let lookupTerm = fixtureLookupTerm(from: bodyData)
            return try JSONEncoder().encode(
                VocabularyLookupResponse(
                    term: lookupTerm,
                    normalizedTerm: normalizeFixtureTerm(lookupTerm),
                    sourceLanguage: "en",
                    targetLanguage: "zh-CN",
                    translation: "示例翻译",
                    shortDefinitionZh: "用于离线 UI 测试的词条示例。",
                    shortDefinitionEn: "Fixture entry used for offline UI smoke testing.",
                    phonetic: VocabularyPhoneticResponse(ipa: "/ˈfɪkstʃər/", us: "/ˈfɪkstʃɚ/", uk: "/ˈfɪkstʃə/"),
                    partOfSpeech: ["noun"],
                    domainTags: ["testing"],
                    collocations: [
                        VocabularyCollocationResponse(text: "offline fixture", translation: "离线样例"),
                        VocabularyCollocationResponse(text: "smoke test", translation: "冒烟测试")
                    ],
                    example: VocabularyExampleResponse(
                        source: "This lookup card is served from offline fixtures.",
                        target: "这个词卡来自离线测试样例。"
                    ),
                    confusable: [VocabularyConfusableResponse(word: "feature", diff: "feature 表示功能，fixture 表示测试样例")],
                    confidence: 0.99,
                    provider: "offline-fixture",
                    model: "xauto-smoke",
                    source: "fixture",
                    cachedAt: "2026-02-24T00:00:00Z"
                )
            )
        default:
            break
        }

        if method == "GET", path.hasPrefix("/v1/mobile/items/") {
            let tweetId = String(path.split(separator: "/").last ?? "")
            return try encodeFixture(
                fixtureItem(
                    tweetId: tweetId.isEmpty ? "190000000000001" : tweetId,
                    authorName: "Fixture Detail",
                    text: "Offline detail page data for UI smoke verification."
                )
            )
        }

        return nil
    }

    private func queryValue(named name: String, from queryItems: [URLQueryItem]) -> String? {
        queryItems.first(where: { $0.name == name })?.value
    }

    private func fixtureDigest(period: String, periodKey: String) -> [String: Any] {
        [
            "_id": "fixture-\(period)-\(periodKey)",
            "period": period,
            "periodKey": periodKey,
            "topThemes": ["AI 编程代理", "测试稳定性"],
            "topItems": [
                [
                    "tweetId": "190000000000001",
                    "reason": "结构化测试流程能降低回归风险。",
                    "nextStep": "为关键路径补齐自动化冒烟。"
                ],
                [
                    "tweetId": "190000000000002",
                    "reason": "离线 fixture 让 UI 测试更可重复。",
                    "nextStep": "将 test plan 接入 PR 门禁。"
                ]
            ],
            "risks": ["线上依赖不可用会导致 UI 假红"],
            "tomorrowActions": ["保持测试期零付费外部调用"],
            "generatedAt": "2026-02-24T00:00:00Z",
            "updatedAt": "2026-02-24T00:00:00Z",
            "createdAt": "2026-02-24T00:00:00Z"
        ]
    }

    private func fixtureItem(tweetId: String, authorName: String, text: String) -> [String: Any] {
        [
            "_id": "fixture-item-\(tweetId)",
            "tweetId": tweetId,
            "authorName": authorName,
            "authorAvatarUrl": NSNull(),
            "text": text,
            "url": "https://x.com/example/status/\(tweetId)",
            "createdAtX": "2026-02-24T00:00:00Z",
            "syncedAt": "2026-02-24T00:00:00Z",
            "summary": NSNull()
        ]
    }

    private func fixtureLookupTerm(from bodyData: Data?) -> String {
        guard let bodyData,
              let payload = try? JSONSerialization.jsonObject(with: bodyData) as? [String: Any],
              let rawTerm = payload["term"] as? String else {
            return "fixture"
        }

        let term = rawTerm.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines)
        return term.isEmpty ? "fixture" : term
    }

    private func normalizeFixtureTerm(_ term: String) -> String {
        let lowered = term.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if lowered.isEmpty {
            return "fixture"
        }
        let collapsed = lowered.replacingOccurrences(of: "\\s+", with: "-", options: .regularExpression)
        return collapsed
    }

    private func encodeFixture(_ payload: [String: Any]) throws -> Data {
        try JSONSerialization.data(withJSONObject: payload, options: [])
    }
}
