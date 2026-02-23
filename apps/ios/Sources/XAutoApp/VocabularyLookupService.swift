import Foundation

struct VocabularyLookupFetchResult {
    let response: VocabularyLookupResponse
    let fromCache: Bool
}

actor VocabularyCacheStore {
    static let shared = VocabularyCacheStore()

    private struct CacheEntry: Codable {
        let key: String
        let schemaVersion: Int
        let promptVersion: String
        var lastAccessedAt: Date
        var hitCount: Int
        let expiresAt: Date
        let value: VocabularyLookupResponse

        var isExpired: Bool {
            expiresAt <= Date()
        }
    }

    private static let schemaVersion = 1
    private static let promptVersion = "v1"
    private static let maxEntries = 1000
    private static let longTTL: TimeInterval = 30 * 24 * 60 * 60
    private static let shortTTL: TimeInterval = 24 * 60 * 60

    private var loaded = false
    private var entries: [String: CacheEntry] = [:]

    nonisolated static func normalizedTerm(_ term: String) -> String {
        let normalized = term
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: "\\s+", with: "-", options: .regularExpression)
            .replacingOccurrences(of: "[^a-z0-9\\u4e00-\\u9fff+._/\\-]", with: "-", options: .regularExpression)
            .replacingOccurrences(of: "-+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        return normalized
    }

    nonisolated static func cacheKey(normalizedTerm: String, targetLang: String) -> String {
        "vocab:v1:\(normalizedTerm):\(targetLang.lowercased())"
    }

    func lookup(term: String, targetLang: String) async -> VocabularyLookupResponse? {
        await loadIfNeeded()
        let normalized = Self.normalizedTerm(term)
        guard !normalized.isEmpty else {
            return nil
        }

        let key = Self.cacheKey(normalizedTerm: normalized, targetLang: targetLang)
        guard var entry = entries[key] else {
            return nil
        }
        if entry.isExpired {
            entries.removeValue(forKey: key)
            await persist()
            return nil
        }

        entry.hitCount += 1
        entry.lastAccessedAt = Date()
        entries[key] = entry
        await persist()
        return entry.value
    }

    func save(_ response: VocabularyLookupResponse) async {
        await loadIfNeeded()

        let normalized = Self.normalizedTerm(response.normalizedTerm.isEmpty ? response.term : response.normalizedTerm)
        guard !normalized.isEmpty else {
            return
        }

        let targetLang = response.targetLanguage.isEmpty ? "zh-CN" : response.targetLanguage
        let key = Self.cacheKey(normalizedTerm: normalized, targetLang: targetLang)
        let now = Date()
        let ttl = response.confidence >= 0.55 ? Self.longTTL : Self.shortTTL

        entries[key] = CacheEntry(
            key: key,
            schemaVersion: Self.schemaVersion,
            promptVersion: Self.promptVersion,
            lastAccessedAt: now,
            hitCount: (entries[key]?.hitCount ?? 0) + 1,
            expiresAt: now.addingTimeInterval(ttl),
            value: response
        )

        pruneExpired()
        pruneLRU()
        await persist()
    }

    private func pruneExpired() {
        entries = entries.filter { !$0.value.isExpired }
    }

    private func pruneLRU() {
        guard entries.count > Self.maxEntries else {
            return
        }

        let sorted = entries.values.sorted { lhs, rhs in
            if lhs.lastAccessedAt != rhs.lastAccessedAt {
                return lhs.lastAccessedAt > rhs.lastAccessedAt
            }
            return lhs.hitCount > rhs.hitCount
        }

        let kept = sorted.prefix(Self.maxEntries)
        entries = Dictionary(uniqueKeysWithValues: kept.map { ($0.key, $0) })
    }

    private func loadIfNeeded() async {
        guard !loaded else {
            return
        }
        loaded = true

        let url = cacheFileURL()
        guard FileManager.default.fileExists(atPath: url.path) else {
            return
        }

        do {
            let data = try Data(contentsOf: url)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let decoded = try decoder.decode([String: CacheEntry].self, from: data)
            entries = decoded
            pruneExpired()
        } catch {
            entries = [:]
        }
    }

    private func persist() async {
        let url = cacheFileURL()
        do {
            let directory = url.deletingLastPathComponent()
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.sortedKeys]
            encoder.dateEncodingStrategy = .iso8601
            let data = try encoder.encode(entries)
            try data.write(to: url, options: .atomic)
        } catch {
            // Best-effort cache persistence.
        }
    }

    private func cacheFileURL() -> URL {
        if let group = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: XAutoSharedKeys.appGroupID) {
            return group.appendingPathComponent("vocabulary_cache_v1.json")
        }

        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory())
        return base.appendingPathComponent("vocabulary_cache_v1.json")
    }
}

enum VocabularyLookupServiceError: LocalizedError {
    case emptyTerm

    var errorDescription: String? {
        switch self {
        case .emptyTerm:
            return "单词为空，无法查词。"
        }
    }
}

actor VocabularyLookupService {
    static let shared = VocabularyLookupService()

    private var inFlight: [String: Task<VocabularyLookupFetchResult, Error>] = [:]

    func lookup(
        term: String,
        context: String?,
        sourceLangHint: String?,
        targetLang: String = "zh-CN",
        forceRefresh: Bool = false
    ) async throws -> VocabularyLookupFetchResult {
        let trimmed = term.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw VocabularyLookupServiceError.emptyTerm
        }

        let normalized = VocabularyCacheStore.normalizedTerm(trimmed)
        let key = VocabularyCacheStore.cacheKey(normalizedTerm: normalized, targetLang: targetLang)

        if !forceRefresh, let cached = await VocabularyCacheStore.shared.lookup(term: trimmed, targetLang: targetLang) {
            return VocabularyLookupFetchResult(response: cached, fromCache: true)
        }

        if !forceRefresh, let existing = inFlight[key] {
            return try await existing.value
        }

        let task = Task<VocabularyLookupFetchResult, Error> {
            let payload = VocabularyLookupRequest(
                term: trimmed,
                context: context?.trimmingCharacters(in: .whitespacesAndNewlines),
                sourceLangHint: sourceLangHint?.trimmingCharacters(in: .whitespacesAndNewlines),
                targetLang: targetLang
            )
            let response = try await APIClient.shared.lookupVocabulary(request: payload)
            await VocabularyCacheStore.shared.save(response)
            return VocabularyLookupFetchResult(response: response, fromCache: false)
        }

        if !forceRefresh {
            inFlight[key] = task
        }

        defer {
            if !forceRefresh {
                inFlight.removeValue(forKey: key)
            }
        }

        return try await task.value
    }
}
