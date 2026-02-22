import Foundation
import WidgetKit

@MainActor
final class TodayViewModel: ObservableObject {
    @Published var digest: DigestResponse?
    @Published var items: [BookmarkItemResponse] = []
    @Published var summaryStats: SummaryStatsResponse?
    @Published var digestHistory: [DigestResponse] = []
    @Published var isLoading = false
    @Published var isLoadingMore = false
    @Published var isLoadingHistoryMore = false
    @Published var errorMessage: String?

    @Published var statsRange: StatsRange = .sevenDays
    @Published var historyPeriod: DigestPeriod = .daily
    @Published var itemLimit: Int = 20
    @Published var filterTag: String = ""
    @Published var filterClaimLabel: ClaimLabel?
    @Published var filterQualityMin: Double?

    private var nextCursor: String?
    private var historyNextCursor: String?

    var featuredItems: [DigestItem] {
        digest?.topItems ?? []
    }

    var availableTags: [String] {
        summaryStats?.topTags.map(\.tag).prefix(12).map { $0 } ?? []
    }

    var qualityFilterOptions: [Double] {
        [0.60, 0.75, 0.90]
    }

    var canLoadMoreItems: Bool {
        nextCursor != nil
    }

    var canLoadMoreHistory: Bool {
        historyNextCursor != nil
    }

    var hasDigestContent: Bool {
        guard let digest else { return false }
        return !digest.topThemes.isEmpty || !digest.topItems.isEmpty || !digest.risks.isEmpty || !digest.tomorrowActions.isEmpty
    }

    func item(for tweetId: String) -> BookmarkItemResponse? {
        items.first(where: { $0.tweetId == tweetId })
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            async let digestTask = APIClient.shared.fetchTodayDigest()
            async let itemsTask = APIClient.shared.fetchItems(
                limit: itemLimit,
                cursor: nil,
                tag: filterTag.isEmpty ? nil : filterTag,
                claimLabel: filterClaimLabel,
                qualityMin: filterQualityMin
            )
            async let historyTask = APIClient.shared.fetchDigestHistory(period: historyPeriod, limit: 10, cursor: nil)
            async let statsTask = APIClient.shared.fetchSummaryStats(range: statsRange)

            let (todayDigest, list, history, stats) = try await (digestTask, itemsTask, historyTask, statsTask)
            digest = todayDigest
            items = list.items
            nextCursor = list.nextCursor
            digestHistory = history.items
            historyNextCursor = history.nextCursor
            summaryStats = stats

            if let todayDigest {
                WidgetDigestStore.save(snapshot: todayDigest.widgetSnapshot)
                WidgetCenter.shared.reloadTimelines(ofKind: XAutoSharedKeys.widgetKind)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadMoreIfNeeded(currentItem: BookmarkItemResponse) async {
        guard currentItem.tweetId == items.last?.tweetId else {
            return
        }
        await loadMoreItems()
    }

    func loadMoreItems() async {
        guard let nextCursor, !isLoadingMore else {
            return
        }

        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let list = try await APIClient.shared.fetchItems(
                limit: itemLimit,
                cursor: nextCursor,
                tag: filterTag.isEmpty ? nil : filterTag,
                claimLabel: filterClaimLabel,
                qualityMin: filterQualityMin
            )
            items.append(contentsOf: list.items)
            self.nextCursor = list.nextCursor
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadMoreHistory() async {
        guard let historyNextCursor, !isLoadingHistoryMore else {
            return
        }

        isLoadingHistoryMore = true
        defer { isLoadingHistoryMore = false }
        do {
            let payload = try await APIClient.shared.fetchDigestHistory(period: historyPeriod, limit: 10, cursor: historyNextCursor)
            digestHistory.append(contentsOf: payload.items)
            self.historyNextCursor = payload.nextCursor
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func setItemLimit(_ limit: Int) async {
        itemLimit = limit
        await loadFilteredFirstPage()
    }

    func setFilterTag(_ tag: String) async {
        filterTag = tag
        await loadFilteredFirstPage()
    }

    func setFilterClaimLabel(_ label: ClaimLabel?) async {
        filterClaimLabel = label
        await loadFilteredFirstPage()
    }

    func setFilterQualityMin(_ value: Double?) async {
        filterQualityMin = value
        await loadFilteredFirstPage()
    }

    func clearFilters() async {
        itemLimit = 20
        filterTag = ""
        filterClaimLabel = nil
        filterQualityMin = nil
        await loadFilteredFirstPage()
    }

    func setStatsRange(_ range: StatsRange) async {
        guard statsRange != range else {
            return
        }
        statsRange = range
        await refreshStats()
    }

    func setHistoryPeriod(_ period: DigestPeriod) async {
        guard historyPeriod != period else {
            return
        }
        historyPeriod = period
        await refreshHistory()
    }

    private func loadFilteredFirstPage() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let list = try await APIClient.shared.fetchItems(
                limit: itemLimit,
                cursor: nil,
                tag: filterTag.isEmpty ? nil : filterTag,
                claimLabel: filterClaimLabel,
                qualityMin: filterQualityMin
            )
            items = list.items
            nextCursor = list.nextCursor
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func refreshHistory() async {
        do {
            let payload = try await APIClient.shared.fetchDigestHistory(period: historyPeriod, limit: 10, cursor: nil)
            digestHistory = payload.items
            historyNextCursor = payload.nextCursor
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func refreshStats() async {
        do {
            summaryStats = try await APIClient.shared.fetchSummaryStats(range: statsRange)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

@MainActor
final class WeekViewModel: ObservableObject {
    @Published var digest: DigestResponse?
    @Published var isLoading = false
    @Published var errorMessage: String?

    var hasDigestContent: Bool {
        guard let digest else { return false }
        return !digest.topThemes.isEmpty || !digest.topItems.isEmpty || !digest.risks.isEmpty || !digest.tomorrowActions.isEmpty
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            digest = try await APIClient.shared.fetchWeekDigest()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

@MainActor
final class ItemDetailViewModel: ObservableObject {
    @Published var item: BookmarkItemResponse
    @Published var isRefreshing = false
    @Published var errorMessage: String?

    init(seed: BookmarkItemResponse) {
        self.item = seed
    }

    func refresh() async {
        isRefreshing = true
        errorMessage = nil
        defer { isRefreshing = false }

        do {
            item = try await APIClient.shared.fetchItem(tweetId: item.tweetId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

@MainActor
final class SettingsViewModel: ObservableObject {
    @Published var isTesting = false
    @Published var testResult: String?

    func testConnection() async {
        isTesting = true
        testResult = nil
        defer { isTesting = false }

        do {
            _ = try await APIClient.shared.fetchTodayDigest()
            testResult = "Connection OK"
        } catch {
            testResult = error.localizedDescription
        }
    }
}
