import Foundation

final class APIClient {
    static let shared = APIClient()

    private var baseURL: URL {
        URL(string: UserDefaults.standard.string(forKey: "xauto_api_base") ?? "http://localhost:8080")!
    }

    private var pat: String {
        UserDefaults.standard.string(forKey: "xauto_pat") ?? ""
    }

    private init() {}

    func fetchTodayDigest() async throws -> DigestResponse? {
        try await request(path: "/v1/mobile/digest/today", method: "GET", responseType: DigestResponse?.self)
    }

    func fetchWeekDigest() async throws -> DigestResponse? {
        try await request(path: "/v1/mobile/digest/week", method: "GET", responseType: DigestResponse?.self)
    }

    func fetchItems(cursor: String?) async throws -> ItemListResponse {
        var path = "/v1/mobile/items?limit=20"
        if let cursor {
            path += "&cursor=\(cursor)"
        }
        return try await request(path: path, method: "GET", responseType: ItemListResponse.self)
    }

    func fetchItem(tweetId: String) async throws -> BookmarkItemResponse {
        try await request(path: "/v1/mobile/items/\(tweetId)", method: "GET", responseType: BookmarkItemResponse.self)
    }

    private func request<T: Decodable>(path: String, method: String, responseType: T.Type) async throws -> T {
        guard !pat.isEmpty else {
            throw NSError(domain: "XAuto", code: 401, userInfo: [NSLocalizedDescriptionKey: "PAT is missing"])
        }

        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw NSError(domain: "XAuto", code: 400, userInfo: [NSLocalizedDescriptionKey: "Invalid URL"])
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer \(pat)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw NSError(domain: "XAuto", code: 500, userInfo: [NSLocalizedDescriptionKey: "HTTP request failed"])
        }

        let decoder = JSONDecoder()
        return try decoder.decode(T.self, from: data)
    }
}
