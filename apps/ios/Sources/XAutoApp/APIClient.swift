import Foundation

enum APIClientError: LocalizedError {
    case missingPAT
    case invalidBaseURL
    case invalidResponse
    case httpError(code: Int, message: String)

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

    private func request<T: Decodable>(path: String, queryItems: [URLQueryItem], responseType: T.Type) async throws -> T {
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
        request.httpMethod = "GET"
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(config.pat)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIClientError.invalidResponse
        }

        guard (200..<300).contains(http.statusCode) else {
            let serverMessage = String(data: data, encoding: .utf8) ?? "Request failed"
            throw APIClientError.httpError(code: http.statusCode, message: serverMessage)
        }

        let decoder = JSONDecoder()
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
}
