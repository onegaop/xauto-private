import SwiftUI

enum AppTab: Hashable {
    case today
    case week
    case settings
}

final class AppNavigationState: ObservableObject {
    @Published var selectedTab: AppTab = .today
}

struct ContentView: View {
    @Binding var selectedTab: AppTab

    var body: some View {
        TabView(selection: $selectedTab) {
            TodayView()
                .tabItem {
                    Label("Today", systemImage: "sun.max.fill")
                }
                .tag(AppTab.today)

            WeekView()
                .tabItem {
                    Label("Week", systemImage: "calendar")
                }
                .tag(AppTab.week)

            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gearshape.fill")
                }
                .tag(AppTab.settings)
        }
        .tint(Color(red: 0.95, green: 0.42, blue: 0.13))
    }
}

struct TodayView: View {
    @StateObject private var viewModel = TodayViewModel()

    var body: some View {
        NavigationStack {
            ZStack {
                AppBackground()
                ScrollView {
                    VStack(spacing: 16) {
                        if let message = viewModel.errorMessage {
                            ErrorCard(message: message)
                        }

                        weatherSection
                        digestSection
                        insightsSection
                        historySection
                        itemsSection
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    .padding(.bottom, 24)
                }
                .refreshable {
                    await viewModel.load()
                }

                if viewModel.isLoading && viewModel.items.isEmpty {
                    ProgressView("Loading...")
                }
            }
            .navigationTitle("XAuto")
            .task {
                await viewModel.load()
            }
        }
    }

    private var weatherSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                SectionTitle(title: "天气活动", subtitle: "WeatherKit + Foundation Models")
                Spacer()
                Button {
                    Task { await viewModel.refreshWeather() }
                } label: {
                    if viewModel.isLoadingWeather {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Image(systemName: "arrow.clockwise")
                    }
                }
                .buttonStyle(.plain)
            }

                if let activity = viewModel.weatherActivity {
                    WeatherActivityCard(activity: activity)
                    if let weatherErrorMessage = viewModel.weatherErrorMessage, !weatherErrorMessage.isEmpty {
                        Text("最近一次刷新失败：\(weatherErrorMessage)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                } else if viewModel.isLoadingWeather {
                    GlassCard {
                        HStack(spacing: 10) {
                            ProgressView()
                        Text("正在获取天气数据...")
                            .font(.subheadline)
                    }
                }
            } else if let weatherErrorMessage = viewModel.weatherErrorMessage {
                EmptyStateCard(title: "天气暂不可用", detail: weatherErrorMessage)
            } else {
                EmptyStateCard(title: "暂无天气卡片", detail: "下拉刷新或点击右上角刷新天气。")
            }
        }
    }

    private var digestSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle(title: "摘要", subtitle: "今日")

            if let digest = viewModel.digest {
                DigestHeroCard(digest: digest, title: "Today Digest")

                if viewModel.hasDigestContent {
                    if !viewModel.featuredItems.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            SectionTitle(title: "重点条目", subtitle: nil)
                            ForEach(viewModel.featuredItems) { topItem in
                                NavigationLink {
                                    ItemLoaderView(tweetId: topItem.tweetId)
                                } label: {
                                    TopItemRow(item: topItem)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                } else {
                    EmptyStateCard(title: "今日摘要暂无内容", detail: "先同步书签并触发 daily digest。")
                }
            } else if !viewModel.isLoading {
                EmptyStateCard(title: "暂无今日摘要", detail: "在 Admin 触发 daily digest 后会展示。")
            }
        }
    }

    private var insightsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                SectionTitle(title: "摘要洞察", subtitle: nil)
                Spacer()
                Picker("Stats Range", selection: $viewModel.statsRange) {
                    ForEach(StatsRange.allCases) { range in
                        Text(range.title).tag(range)
                    }
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 220)
                .onChange(of: viewModel.statsRange) { _, value in
                    Task { await viewModel.setStatsRange(value) }
                }
            }

            if let stats = viewModel.summaryStats {
                GlassCard {
                    VStack(spacing: 12) {
                        HStack(spacing: 10) {
                            MetricCell(title: "总结条数", value: "\(stats.totalSummaries)")
                            MetricCell(title: "平均质量", value: String(format: "%.2f", stats.avgQualityScore))
                            MetricCell(title: "行动建议", value: "\(stats.actionItemCount)")
                        }

                        if !stats.topTags.isEmpty {
                            TagFlow(tags: stats.topTags.prefix(10).map { "\($0.tag) · \($0.count)" })
                        }

                        if !stats.topResearchKeywords.isEmpty {
                            TagFlow(tags: stats.topResearchKeywords.prefix(8).map { $0.keyword })
                        }

                        if !stats.claimLabelDistribution.isEmpty {
                            VStack(spacing: 6) {
                                ForEach(stats.claimLabelDistribution) { row in
                                    HStack(spacing: 8) {
                                        Text(claimLabelTitle(row.label))
                                            .font(.caption)
                                            .frame(width: 50, alignment: .leading)
                                        GeometryReader { proxy in
                                            ZStack(alignment: .leading) {
                                                Capsule().fill(Color.gray.opacity(0.18))
                                                Capsule()
                                                    .fill(Color.orange.opacity(0.7))
                                                    .frame(width: max(8, proxy.size.width * barRatio(for: row.count, total: max(1, stats.totalSummaries))))
                                            }
                                        }
                                        .frame(height: 8)
                                        Text("\(row.count)")
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                            .frame(width: 26, alignment: .trailing)
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                EmptyStateCard(title: "暂无统计数据", detail: "等产生更多摘要后会出现趋势与标签。")
            }
        }
    }

    private var historySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                SectionTitle(title: "历史摘要", subtitle: nil)
                Spacer()
                Picker("History Period", selection: $viewModel.historyPeriod) {
                    ForEach(DigestPeriod.allCases) { period in
                        Text(period.title).tag(period)
                    }
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 220)
                .onChange(of: viewModel.historyPeriod) { _, value in
                    Task { await viewModel.setHistoryPeriod(value) }
                }
            }

            if viewModel.digestHistory.isEmpty {
                EmptyStateCard(title: "暂无历史摘要", detail: "点击下拉刷新后会加载最近摘要。")
            } else {
                ForEach(Array(viewModel.digestHistory.enumerated()), id: \.offset) { _, digest in
                    GlassCard {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text(digest.periodKey.isEmpty ? "未知周期" : digest.periodKey)
                                    .font(.subheadline.weight(.semibold))
                                Spacer()
                                let digestTime = digest.generatedAt.isEmpty ? (digest.updatedAt ?? digest.createdAt ?? "") : digest.generatedAt
                                if !digestTime.isEmpty {
                                    Text(relativeDate(digestTime))
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }

                            if !digest.topThemes.isEmpty {
                                TagFlow(tags: digest.topThemes.prefix(4).map { $0 })
                            }

                            if !digest.topItems.isEmpty {
                                ForEach(digest.topItems.prefix(2)) { topItem in
                                    NavigationLink {
                                        ItemLoaderView(tweetId: topItem.tweetId)
                                    } label: {
                                        TopItemRow(item: topItem)
                                    }
                                    .buttonStyle(.plain)
                                }
                            } else if digest.topThemes.isEmpty {
                                Text("该摘要暂无内容")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                if viewModel.canLoadMoreHistory {
                    Button {
                        Task { await viewModel.loadMoreHistory() }
                    } label: {
                        HStack {
                            if viewModel.isLoadingHistoryMore {
                                ProgressView()
                                    .controlSize(.small)
                            }
                            Text(viewModel.isLoadingHistoryMore ? "加载中..." : "加载更多历史")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
    }

    private var itemsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionTitle(title: "最新条目", subtitle: "\(viewModel.items.count) 条")

            GlassCard {
                VStack(alignment: .leading, spacing: 10) {
                    filterRow(title: "每页") {
                        HStack(spacing: 8) {
                            ForEach([10, 20], id: \.self) { limit in
                                FilterChip(title: "\(limit)", active: viewModel.itemLimit == limit) {
                                    Task { await viewModel.setItemLimit(limit) }
                                }
                            }
                        }
                    }

                    filterRow(title: "类型") {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                FilterChip(title: "全部", active: viewModel.filterClaimLabel == nil) {
                                    Task { await viewModel.setFilterClaimLabel(nil) }
                                }
                                ForEach(ClaimLabel.allCases) { label in
                                    FilterChip(title: label.title, active: viewModel.filterClaimLabel == label) {
                                        Task { await viewModel.setFilterClaimLabel(label) }
                                    }
                                }
                            }
                        }
                    }

                    filterRow(title: "质量") {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                FilterChip(title: "全部", active: viewModel.filterQualityMin == nil) {
                                    Task { await viewModel.setFilterQualityMin(nil) }
                                }
                                ForEach(viewModel.qualityFilterOptions, id: \.self) { value in
                                    FilterChip(title: "≥\(String(format: "%.2f", value))", active: viewModel.filterQualityMin == value) {
                                        Task { await viewModel.setFilterQualityMin(value) }
                                    }
                                }
                            }
                        }
                    }

                    if !viewModel.availableTags.isEmpty {
                        filterRow(title: "标签") {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 8) {
                                    FilterChip(title: "全部", active: viewModel.filterTag.isEmpty) {
                                        Task { await viewModel.setFilterTag("") }
                                    }
                                    ForEach(viewModel.availableTags, id: \.self) { tag in
                                        FilterChip(title: tag, active: viewModel.filterTag == tag) {
                                            Task { await viewModel.setFilterTag(tag) }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if !viewModel.filterTag.isEmpty || viewModel.filterClaimLabel != nil || viewModel.filterQualityMin != nil || viewModel.itemLimit != 20 {
                        Button("清除筛选") {
                            Task { await viewModel.clearFilters() }
                        }
                        .font(.footnote.weight(.semibold))
                    }
                }
            }

            if viewModel.items.isEmpty && !viewModel.isLoading {
                EmptyStateCard(title: "暂无条目", detail: "试试放宽筛选条件或先同步书签。")
            } else {
                ForEach(viewModel.items) { item in
                    NavigationLink {
                        ItemDetailView(seed: item)
                    } label: {
                        BookmarkRow(item: item)
                    }
                    .buttonStyle(.plain)
                    .task {
                        await viewModel.loadMoreIfNeeded(currentItem: item)
                    }
                }

                if viewModel.canLoadMoreItems {
                    Button {
                        Task { await viewModel.loadMoreItems() }
                    } label: {
                        HStack {
                            if viewModel.isLoadingMore {
                                ProgressView()
                                    .controlSize(.small)
                            }
                            Text(viewModel.isLoadingMore ? "加载中..." : "加载更多")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
    }

    private func filterRow<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            content()
        }
    }
}

struct WeekView: View {
    @StateObject private var viewModel = WeekViewModel()

    var body: some View {
        NavigationStack {
            ZStack {
                AppBackground()
                ScrollView {
                    VStack(spacing: 16) {
                        if let message = viewModel.errorMessage {
                            ErrorCard(message: message)
                        }

                        if let digest = viewModel.digest {
                            DigestHeroCard(digest: digest, title: "Week Digest")

                            if viewModel.hasDigestContent {
                                if !digest.topItems.isEmpty {
                                    GlassCard {
                                        VStack(alignment: .leading, spacing: 8) {
                                            SectionTitle(title: "重点条目", subtitle: nil)
                                            ForEach(digest.topItems) { topItem in
                                                NavigationLink {
                                                    ItemLoaderView(tweetId: topItem.tweetId)
                                                } label: {
                                                    TopItemRow(item: topItem)
                                                }
                                                .buttonStyle(.plain)
                                            }
                                        }
                                    }
                                }

                                if !digest.risks.isEmpty {
                                    GlassCard {
                                        VStack(alignment: .leading, spacing: 8) {
                                            SectionTitle(title: "风险雷达", subtitle: nil)
                                            ForEach(digest.risks, id: \.self) { risk in
                                                Label(risk, systemImage: "exclamationmark.triangle.fill")
                                                    .font(.subheadline)
                                                    .foregroundStyle(Color.orange)
                                            }
                                        }
                                    }
                                }

                                if !digest.tomorrowActions.isEmpty {
                                    GlassCard {
                                        VStack(alignment: .leading, spacing: 8) {
                                            SectionTitle(title: "行动建议", subtitle: nil)
                                            ForEach(digest.tomorrowActions, id: \.self) { action in
                                                Label(action, systemImage: "checkmark.circle.fill")
                                                    .font(.subheadline)
                                            }
                                        }
                                    }
                                }
                            } else {
                                EmptyStateCard(title: "本周摘要暂无内容", detail: "当前已有周摘要记录，但内容为空。")
                            }
                        } else if !viewModel.isLoading {
                            EmptyStateCard(
                                title: "本周摘要还未生成",
                                detail: "在 Admin 触发 weekly digest 后，这里会自动展示。"
                            )
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
                .refreshable {
                    await viewModel.load()
                }

                if viewModel.isLoading && viewModel.digest == nil {
                    ProgressView("Loading...")
                }
            }
            .navigationTitle("Week")
            .task {
                await viewModel.load()
            }
        }
    }
}

struct ItemDetailView: View {
    @StateObject private var viewModel: ItemDetailViewModel
    @State private var activeWebURL: URL?
    @Environment(\.openURL) private var openURL

    init(seed: BookmarkItemResponse) {
        _viewModel = StateObject(wrappedValue: ItemDetailViewModel(seed: seed))
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                GlassCard {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 8) {
                            Label(viewModel.item.authorName, systemImage: "person.fill")
                                .font(.headline)
                            Spacer()
                            Text(relativeDate(viewModel.item.syncedAt ?? viewModel.item.createdAtX))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        RichPostTextView(text: viewModel.item.text) { tappedURL in
                            openURLForDetail(tappedURL)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)

                        if let url = URL(string: viewModel.item.url), !viewModel.item.url.isEmpty {
                            Button {
                                openURLForDetail(url)
                            } label: {
                                Label("Open on X", systemImage: "arrow.up.right.square")
                                    .font(.subheadline.weight(.semibold))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                if let summary = viewModel.item.summary {
                    GlassCard {
                        VStack(alignment: .leading, spacing: 10) {
                            SectionTitle(title: "摘要", subtitle: nil)
                            if !summary.oneLinerZh.isEmpty {
                                Text(summary.oneLinerZh)
                                    .font(.headline)
                            }
                            if !summary.oneLinerEn.isEmpty {
                                Text(summary.oneLinerEn)
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                            ForEach(summary.bulletsZh, id: \.self) { bullet in
                                HStack(alignment: .top, spacing: 8) {
                                    Circle()
                                        .fill(Color.orange)
                                        .frame(width: 6, height: 6)
                                        .padding(.top, 7)
                                    Text(bullet)
                                        .font(.subheadline)
                                }
                            }
                            if summary.qualityScore > 0 {
                                Text("质量分 \(String(format: "%.2f", summary.qualityScore))")
                                    .font(.caption.weight(.medium))
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }

                    if let coreViewpoint = summary.coreViewpoint, !coreViewpoint.isEmpty {
                        GlassCard {
                            VStack(alignment: .leading, spacing: 6) {
                                SectionTitle(title: "核心观点", subtitle: nil)
                                Text(coreViewpoint)
                                    .font(.subheadline)
                            }
                        }
                    }

                    if let underlyingProblem = summary.underlyingProblem, !underlyingProblem.isEmpty {
                        GlassCard {
                            VStack(alignment: .leading, spacing: 6) {
                                SectionTitle(title: "底层问题", subtitle: nil)
                                Text(underlyingProblem)
                                    .font(.subheadline)
                            }
                        }
                    }

                    if !summary.keyTechnologies.isEmpty {
                        GlassCard {
                            VStack(alignment: .leading, spacing: 8) {
                                SectionTitle(title: "关键技术/概念", subtitle: nil)
                                ForEach(summary.keyTechnologies) { item in
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(item.concept)
                                            .font(.subheadline.weight(.semibold))
                                        Text(item.solves)
                                            .font(.footnote)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }

                    if !summary.claimTypes.isEmpty {
                        GlassCard {
                            VStack(alignment: .leading, spacing: 8) {
                                SectionTitle(title: "判断类型", subtitle: nil)
                                ForEach(summary.claimTypes.prefix(5)) { claim in
                                    Text("\(claimLabelTitle(claim.label)) · \(claim.statement)")
                                        .font(.footnote)
                                }
                            }
                        }
                    }

                    if !summary.actions.isEmpty {
                        GlassCard {
                            VStack(alignment: .leading, spacing: 8) {
                                SectionTitle(title: "行动项", subtitle: nil)
                                ForEach(summary.actions, id: \.self) { action in
                                    Label(action, systemImage: "sparkles")
                                        .font(.subheadline)
                                }
                            }
                        }
                    }

                    if !summary.researchKeywordsEn.isEmpty {
                        GlassCard {
                            VStack(alignment: .leading, spacing: 8) {
                                SectionTitle(title: "研究关键词", subtitle: nil)
                                TagFlow(tags: summary.researchKeywordsEn)
                            }
                        }
                    }
                }

                GlassCard {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            SectionTitle(title: "端侧AI娱乐增强", subtitle: "不影响主摘要流程")
                            Spacer()
                            if viewModel.isGeneratingLocalInsight {
                                ProgressView()
                                    .controlSize(.small)
                            }
                        }

                        Button("生成趣味洞察") {
                            Task { await viewModel.generateLocalInsightIfEnabled() }
                        }
                        .buttonStyle(.borderedProminent)

                        if let localInsight = viewModel.localInsight {
                            Text(localInsight.title)
                                .font(.subheadline.weight(.semibold))
                            ForEach(localInsight.highlights, id: \.self) { line in
                                Text("• \(line)")
                                    .font(.footnote)
                            }
                            if !localInsight.suggestions.isEmpty {
                                Divider()
                                ForEach(localInsight.suggestions, id: \.self) { line in
                                    Label(line, systemImage: "sparkles")
                                        .font(.footnote)
                                }
                            }
                        }
                    }
                }

                if let errorMessage = viewModel.errorMessage {
                    ErrorCard(message: errorMessage)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .background(AppBackground())
        .navigationTitle("Detail")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await viewModel.refresh() }
                } label: {
                    if viewModel.isRefreshing {
                        ProgressView()
                    } else {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
        }
        .sheet(isPresented: Binding(get: { activeWebURL != nil }, set: { isShown in
            if !isShown {
                activeWebURL = nil
            }
        })) {
            if let url = activeWebURL {
                InAppSafariView(url: url)
                    .ignoresSafeArea()
            }
        }
    }

    private func openURLForDetail(_ url: URL) {
        if isXLink(url) {
            let candidates = preferredXOpenCandidates(for: url)
            openCandidates(candidates, webFallback: url)
            return
        }
        activeWebURL = url
    }

    private func openCandidates(_ candidates: [URL], webFallback: URL) {
        guard let current = candidates.first else {
            activeWebURL = webFallback
            return
        }
        openURL(current) { accepted in
            if accepted {
                return
            }
            openCandidates(Array(candidates.dropFirst()), webFallback: webFallback)
        }
    }

    private func preferredXOpenCandidates(for url: URL) -> [URL] {
        var urls: [URL] = []
        if let tweetID = extractTweetID(from: url) {
            if let deepTwitter = URL(string: "twitter://status?id=\(tweetID)") {
                urls.append(deepTwitter)
            }
            if let deepX = URL(string: "x://status/\(tweetID)") {
                urls.append(deepX)
            }
        }
        urls.append(url)
        return urls
    }

    private func isXLink(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else {
            return false
        }
        return host == "x.com" || host == "www.x.com" || host == "twitter.com" || host == "www.twitter.com"
    }

    private func extractTweetID(from url: URL) -> String? {
        let parts = url.pathComponents.filter { $0 != "/" }
        guard let statusIndex = parts.firstIndex(of: "status"), statusIndex + 1 < parts.count else {
            return nil
        }
        let candidate = parts[statusIndex + 1]
        guard candidate.allSatisfy(\.isNumber) else {
            return nil
        }
        return candidate
    }
}

struct ItemLoaderView: View {
    let tweetId: String

    @State private var item: BookmarkItemResponse?
    @State private var isLoading = false
    @State private var error: String?

    var body: some View {
        Group {
            if let item {
                ItemDetailView(seed: item)
            } else if isLoading {
                ProgressView("Loading item...")
            } else {
                ContentUnavailableView("未找到条目", systemImage: "doc.questionmark", description: Text(error ?? "请稍后重试"))
            }
        }
        .task {
            await load()
        }
    }

    private func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            item = try await APIClient.shared.fetchItem(tweetId: tweetId)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct SettingsView: View {
    @AppStorage(XAutoSharedKeys.apiBase, store: UserDefaults(suiteName: XAutoSharedKeys.appGroupID))
    private var apiBase = XAutoSharedKeys.defaultAPIBase

    @AppStorage(XAutoSharedKeys.pat, store: UserDefaults(suiteName: XAutoSharedKeys.appGroupID))
    private var pat = ""
    @AppStorage(XAutoSharedKeys.localFunAIEnabled, store: UserDefaults(suiteName: XAutoSharedKeys.appGroupID))
    private var localFunAIEnabled = true

    @StateObject private var viewModel = SettingsViewModel()
    @State private var revealToken = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Connection") {
                    TextField("API Base URL", text: $apiBase)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled(true)
                        .keyboardType(.URL)

                    if revealToken {
                        TextField("PAT", text: $pat)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled(true)
                    } else {
                        SecureField("PAT", text: $pat)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled(true)
                    }

                    Toggle("Show PAT", isOn: $revealToken)
                }

                Section("AI") {
                    Toggle("端侧AI娱乐增强", isOn: $localFunAIEnabled)
                    Text("仅用于本地趣味补充，不影响现有摘要与后端逻辑。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("Actions") {
                    Button {
                        Task { await viewModel.testConnection() }
                    } label: {
                        if viewModel.isTesting {
                            ProgressView()
                        } else {
                            Label("Save & Test", systemImage: "network")
                        }
                    }

                    if let result = viewModel.testResult {
                        Text(result)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }

                    if let url = URL(string: "https://xauto-admin-516721184000.asia-east1.run.app/dashboard") {
                        Link(destination: url) {
                            Label("Open Admin Dashboard", systemImage: "arrow.up.right.square")
                        }
                    }
                }
            }
            .navigationTitle("Settings")
        }
    }
}

private struct AppBackground: View {
    var body: some View {
        LinearGradient(
            colors: [
                Color(red: 0.98, green: 0.97, blue: 0.95),
                Color(red: 0.95, green: 0.94, blue: 0.90)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }
}

private struct SectionTitle: View {
    let title: String
    let subtitle: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.headline)
            if let subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct DigestHeroCard: View {
    let digest: DigestResponse
    let title: String

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(title)
                        .font(.title3.weight(.bold))
                    Spacer()
                    Text(digest.periodKey)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if !digest.topThemes.isEmpty {
                    TagFlow(tags: digest.topThemes)
                }
            }
        }
    }
}

private struct TopItemRow: View {
    let item: DigestItem

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 8) {
                Text(item.reason.isEmpty ? "#\(item.tweetId)" : item.reason)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                if !item.nextStep.isEmpty {
                    Text(item.nextStep)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}

private struct WeatherActivityCard: View {
    let activity: WeatherActivityCardData

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) {
                    Image(systemName: activity.raw.symbolName)
                        .font(.title3)
                        .foregroundStyle(Color.orange)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(activity.raw.locationName) · \(activity.raw.temperatureC)°C")
                            .font(.headline)
                        Text("\(activity.raw.conditionText) · \(timeString(activity.raw.observationDate)) 更新")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(activity.narration.source)
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.orange.opacity(0.12), in: Capsule())
                }

                Text(activity.narration.summary)
                    .font(.subheadline)
                    .foregroundStyle(.primary)

                if !activity.narration.suggestions.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(activity.narration.suggestions, id: \.self) { suggestion in
                            Label(suggestion, systemImage: "figure.walk")
                                .font(.footnote)
                        }
                    }
                }
            }
        }
    }
}

private struct BookmarkRow: View {
    let item: BookmarkItemResponse

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(item.authorName)
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                    Text(relativeDate(item.syncedAt ?? item.createdAtX))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Text(item.summary?.oneLinerZh.isEmpty == false ? item.summary?.oneLinerZh ?? item.text : item.text)
                    .font(.subheadline)
                    .lineLimit(3)
                    .foregroundStyle(.primary)
                HStack {
                    if let quality = item.summary?.qualityScore, quality > 0 {
                        Text("质量 \(String(format: "%.2f", quality))")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    if let tags = item.summary?.tagsZh, !tags.isEmpty {
                        Text(tags.prefix(2).joined(separator: " · "))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
            }
        }
    }
}

private struct FilterChip: View {
    let title: String
    let active: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
        }
        .buttonStyle(.plain)
        .background(active ? Color.orange.opacity(0.22) : Color.gray.opacity(0.12), in: Capsule())
    }
}

private struct MetricCell: View {
    let title: String
    let value: String

    var body: some View {
        VStack(spacing: 4) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.title3.weight(.bold))
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(Color.white.opacity(0.36), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

private struct TagFlow: View {
    let tags: [String]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(tags, id: \.self) { tag in
                    Text(tag)
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color.orange.opacity(0.12), in: Capsule())
                }
            }
        }
    }
}

private struct ErrorCard: View {
    let message: String

    var body: some View {
        GlassCard {
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(Color.red)
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(Color.red)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct EmptyStateCard: View {
    let title: String
    let detail: String

    var body: some View {
        GlassCard {
            VStack(spacing: 10) {
                Image(systemName: "tray")
                    .font(.title2)
                    .foregroundStyle(.secondary)
                Text(title)
                    .font(.headline)
                Text(detail)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity)
        }
    }
}

private struct GlassCard<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(.thinMaterial)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.white.opacity(0.35), lineWidth: 1)
            )
    }
}

private func claimLabelTitle(_ raw: String) -> String {
    ClaimLabel(rawValue: raw)?.title ?? raw
}

private func barRatio(for count: Int, total: Int) -> CGFloat {
    CGFloat(count) / CGFloat(max(1, total))
}

private func relativeDate(_ isoString: String) -> String {
    guard !isoString.isEmpty else {
        return ""
    }

    let parser = ISO8601DateFormatter()
    guard let date = parser.date(from: isoString) else {
        return isoString
    }

    let formatter = RelativeDateTimeFormatter()
    formatter.unitsStyle = .short
    return formatter.localizedString(for: date, relativeTo: Date())
}

private func timeString(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "zh_CN")
    formatter.dateFormat = "HH:mm"
    return formatter.string(from: date)
}
