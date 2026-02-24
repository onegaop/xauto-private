import SwiftUI
import MarkdownUI
import UIKit
#if canImport(FoundationModels)
import FoundationModels
#endif

// MARK: - Refresh Control

private struct ModernRefreshControl: View {
    let coordinateSpace: String
    let onRefresh: () async -> Void
    
    @State private var refreshState: RefreshState = .idle
    @State private var progress: CGFloat = 0
    
    enum RefreshState {
        case idle
        case pulling
        case refreshing
    }
    
    var body: some View {
        GeometryReader { proxy in
            let frame = proxy.frame(in: .named(coordinateSpace))
            let y = frame.minY
            
            Color.clear
                .preference(key: RefreshPreference.self, value: y)
                .onAppear {
                    // Initial state
                }
        }
        .frame(height: 0)
        .onPreferenceChange(RefreshPreference.self) { y in
            DispatchQueue.main.async {
                if refreshState == .refreshing { return }
                
                let threshold: CGFloat = 80
                progress = min(1, max(0, y / threshold))
                
                if y > threshold && refreshState == .pulling {
                    refreshState = .refreshing
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    Task {
                        await onRefresh()
                        withAnimation(.spring()) {
                            refreshState = .idle
                            progress = 0
                        }
                    }
                } else if y > 0 && y <= threshold {
                    refreshState = .pulling
                } else if y <= 0 {
                    refreshState = .idle
                }
            }
        }
        .overlay(
            ZStack {
                if refreshState != .idle || progress > 0 {
                    VStack(spacing: 8) {
                        ZStack {
                            Circle()
                                .stroke(Color.orange.opacity(0.2), lineWidth: 3)
                                .frame(width: 30, height: 30)
                            
                            Circle()
                                .trim(from: 0, to: refreshState == .refreshing ? 0.7 : progress)
                                .stroke(Color.orange, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                                .frame(width: 30, height: 30)
                                .rotationEffect(Angle(degrees: refreshState == .refreshing ? 360 : 0))
                                .animation(refreshState == .refreshing ? .linear(duration: 1).repeatForever(autoreverses: false) : .default, value: refreshState)
                            
                            if refreshState == .pulling {
                                Image(systemName: "arrow.down")
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundStyle(.orange)
                                    .rotationEffect(Angle(degrees: progress * 180))
                            }
                        }
                        
                        Text(refreshState == .refreshing ? "正在同步..." : "下拉刷新")
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(.secondary)
                            .opacity(Double(progress))
                    }
                    .offset(y: -50)
                }
            }
            .frame(maxWidth: .infinity)
            , alignment: .top
        )
    }
}

private struct RefreshPreference: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

// MARK: - Design System

private enum DS {
    static let xs: CGFloat = 4
    static let sm: CGFloat = 8
    static let md: CGFloat = 12
    static let lg: CGFloat = 16
    static let xl: CGFloat = 20
    static let xxl: CGFloat = 24
    static let sectionGap: CGFloat = 32
    static let cardRadius: CGFloat = 16
    static let pageH: CGFloat = 20
}

// MARK: - Navigation

enum AppTab: Hashable {
    case today
    case week
    case settings
}

final class AppNavigationState: ObservableObject {
    @Published var selectedTab: AppTab = .today
    @Published var scrollToDigest = false
}

private struct TweetRoute: Hashable, Identifiable {
    let tweetId: String
    var id: String { tweetId }
}

// MARK: - Root

struct ContentView: View {
    @EnvironmentObject private var navigation: AppNavigationState

    var body: some View {
        TabView(selection: $navigation.selectedTab) {
            TodayView()
                .tabItem { Label("Today", systemImage: "sun.max.fill").accessibilityIdentifier("tab.today") }
                .tag(AppTab.today)
                .accessibilityIdentifier("tab.today")

            WeekView()
                .tabItem { Label("Week", systemImage: "calendar").accessibilityIdentifier("tab.week") }
                .tag(AppTab.week)
                .accessibilityIdentifier("tab.week")

            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape.fill").accessibilityIdentifier("tab.settings") }
                .tag(AppTab.settings)
                .accessibilityIdentifier("tab.settings")
        }
        .tint(.orange)
    }
}

// MARK: - Today

struct TodayView: View {
    @EnvironmentObject private var navigation: AppNavigationState
    @StateObject private var viewModel = TodayViewModel()
    @State private var selectedTweetRoute: TweetRoute?
    @State private var digestHighlighted = false
    @State private var pendingDigestScroll = false

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView(.vertical, showsIndicators: true) {
                    ZStack(alignment: .top) {
                        ModernRefreshControl(coordinateSpace: "scroll") {
                            await viewModel.load()
                        }
                        
                        LazyVStack(spacing: DS.sectionGap, pinnedViews: []) {
                            if let message = viewModel.errorMessage {
                                ErrorBanner(message: message)
                            }
                            
                            if viewModel.isLoading && viewModel.weatherActivity == nil {
                                weatherSectionHeader
                                WeatherSkeleton()
                            } else {
                                weatherSection
                            }
                            
                            if viewModel.isLoading && viewModel.digest == nil {
                                digestSectionHeader
                                DigestSkeleton()
                            } else {
                                digestSection
                                    .id("digest")
                                    .background(
                                        RoundedRectangle(cornerRadius: DS.cardRadius, style: .continuous)
                                            .fill(Color.orange.opacity(digestHighlighted ? 0.08 : 0))
                                            .padding(-DS.sm)
                                    )
                            }
                            
                            if !viewModel.isLoading || viewModel.summaryStats != nil {
                                insightsSection
                            }
                            
                            Section {
                                historyHeaderView
                                historyContentView
                            }
                            
                            Section {
                                itemsHeaderView
                                if viewModel.isLoading && viewModel.items.isEmpty {
                                    ForEach(0..<3) { _ in
                                        BookmarkSkeleton()
                                    }
                                } else {
                                    itemsContentView
                                }
                            }
                            
                            weatherDiagnosticsSection
                        }
                        .padding(.horizontal, DS.pageH)
                        .padding(.top, 20) // Give some space for refresh control
                        .padding(.bottom, DS.xxl)
                    }
                }
                .coordinateSpace(name: "scroll")
                .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
                .onChange(of: navigation.scrollToDigest) { _, shouldScroll in
                    guard shouldScroll else { return }
                    navigation.scrollToDigest = false
                    if viewModel.digest != nil {
                        animateScrollToDigest(proxy: proxy)
                    } else {
                        pendingDigestScroll = true
                    }
                }
                .onChange(of: viewModel.isLoading) { _, isLoading in
                    guard !isLoading, pendingDigestScroll, viewModel.digest != nil else { return }
                    pendingDigestScroll = false
                    animateScrollToDigest(proxy: proxy)
                }
            }
            .background(AppBackground())
            .navigationTitle("XAuto")
            .task {
                await viewModel.load()
            }
            .navigationDestination(item: $selectedTweetRoute) { route in
                ItemLoaderView(tweetId: route.tweetId)
            }
        }
    }

    private func animateScrollToDigest(proxy: ScrollViewProxy) {
        Task {
            try? await Task.sleep(for: .milliseconds(300))
            withAnimation(.easeInOut(duration: 0.4)) {
                proxy.scrollTo("digest", anchor: .top)
            }
            try? await Task.sleep(for: .milliseconds(200))
            withAnimation(.easeInOut(duration: 0.3)) {
                digestHighlighted = true
            }
            try? await Task.sleep(for: .seconds(1.2))
            withAnimation(.easeOut(duration: 0.5)) {
                digestHighlighted = false
            }
        }
    }

    // MARK: Weather

    private var weatherSectionHeader: some View {
        HStack(alignment: .firstTextBaseline) {
            SectionHeader(title: "天气活动", subtitle: "WeatherKit + Foundation Models")
            Spacer()
            Button {
                Task { await viewModel.refreshWeather() }
            } label: {
                if viewModel.isLoadingWeather {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Image(systemName: "arrow.clockwise")
                        .font(.body)
                        .foregroundStyle(.secondary)
                }
            }
            .buttonStyle(.plain)
        }
    }

    private var weatherSection: some View {
        VStack(alignment: .leading, spacing: DS.md) {
            weatherSectionHeader

            if let activity = viewModel.weatherActivity {
                WeatherActivityCard(activity: activity)
            } else if viewModel.isLoadingWeather {
                Card {
                    HStack(spacing: DS.md) {
                        ProgressView()
                        Text("正在获取天气数据...")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
            } else if viewModel.weatherErrorMessage != nil {
                EmptyStateCard(icon: "cloud.slash", title: "天气暂不可用", detail: "详细原因请看页面下方「天气诊断」。")
            } else {
                EmptyStateCard(icon: "cloud.sun", title: "暂无天气卡片", detail: "下拉刷新或点击右上角刷新天气。")
            }
        }
    }

    private var weatherDiagnosticsSection: some View {
        Group {
            if let weatherErrorMessage = viewModel.weatherErrorMessage, !weatherErrorMessage.isEmpty {
                Card {
                    VStack(alignment: .leading, spacing: DS.sm) {
                        Label("天气诊断", systemImage: "stethoscope")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.orange)
                        Text(weatherErrorMessage)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
    }

    // MARK: Digest

    private var digestSectionHeader: some View {
        VStack(alignment: .leading, spacing: DS.md) {
            SectionHeader(title: "摘要", subtitle: "今日")
            RuleNotesCard(
                title: "展示规则",
                notes: [
                    "重点条目由 AI 从今日候选中筛选，最多 5 条。",
                    "重点条目不等于最新条目；未入选仍会出现在「最新条目」。",
                    "同一天重复生成 Daily Digest 会覆盖当天结果。"
                ]
            )
        }
    }

    private var digestSection: some View {
        VStack(alignment: .leading, spacing: DS.md) {
            digestSectionHeader

            if let digest = viewModel.digest {
                DigestHeroCard(digest: digest, title: "Today Digest")

                if viewModel.hasDigestContent {
                    if !viewModel.featuredItems.isEmpty {
                        VStack(alignment: .leading, spacing: DS.md) {
                            Text("重点条目")
                                .font(.headline)
                            ForEach(viewModel.featuredItems) { topItem in
                                Button {
                                    selectedTweetRoute = TweetRoute(tweetId: topItem.tweetId)
                                } label: {
                                    TopItemRow(item: topItem)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                } else {
                    EmptyStateCard(icon: "doc.text", title: "今日摘要暂无内容", detail: "先同步书签并触发 daily digest。")
                }
            } else if !viewModel.isLoading {
                EmptyStateCard(icon: "doc.text", title: "暂无今日摘要", detail: "在 Admin 触发 daily digest 后会展示。")
            }
        }
    }

    // MARK: Insights

    private var insightsSection: some View {
        VStack(alignment: .leading, spacing: DS.md) {
            HStack(alignment: .firstTextBaseline) {
                SectionHeader(title: "摘要洞察")
                Spacer()
                Picker("Stats Range", selection: $viewModel.statsRange) {
                    ForEach(StatsRange.allCases) { range in
                        Text(range.title).tag(range)
                    }
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 180)
                .onChange(of: viewModel.statsRange) { _, value in
                    Task { await viewModel.setStatsRange(value) }
                }
            }

            if let stats = viewModel.summaryStats {
                Card {
                    VStack(spacing: DS.lg) {
                        HStack(spacing: DS.sm) {
                            MetricCell(title: "总结条数", value: "\(stats.totalSummaries)", icon: "doc.plaintext")
                            MetricCell(title: "平均质量", value: String(format: "%.1f", stats.avgQualityScore), icon: "star")
                            MetricCell(title: "行动建议", value: "\(stats.actionItemCount)", icon: "bolt")
                        }

                        if !stats.topTags.isEmpty {
                            VStack(alignment: .leading, spacing: DS.sm) {
                                Text("热门标签")
                                    .font(.caption.weight(.medium))
                                    .foregroundStyle(.secondary)
                                TagFlow(tags: stats.topTags.prefix(10).map { "\($0.tag) · \($0.count)" })
                            }
                        }

                        if !stats.topResearchKeywords.isEmpty {
                            VStack(alignment: .leading, spacing: DS.sm) {
                                Text("研究关键词")
                                    .font(.caption.weight(.medium))
                                    .foregroundStyle(.secondary)
                                TagFlow(tags: stats.topResearchKeywords.prefix(8).map { $0.keyword })
                            }
                        }

                        if !stats.claimLabelDistribution.isEmpty {
                            VStack(alignment: .leading, spacing: DS.sm) {
                                Text("判断分布")
                                    .font(.caption.weight(.medium))
                                    .foregroundStyle(.secondary)
                                VStack(spacing: DS.sm) {
                                    ForEach(stats.claimLabelDistribution) { row in
                                        HStack(spacing: DS.sm) {
                                            Text(claimLabelTitle(row.label))
                                                .font(.caption)
                                                .frame(width: 40, alignment: .leading)
                                            GeometryReader { proxy in
                                                ZStack(alignment: .leading) {
                                                    Capsule().fill(Color.primary.opacity(0.06))
                                                    Capsule()
                                                        .fill(Color.orange.gradient)
                                                        .frame(width: max(8, proxy.size.width * barRatio(for: row.count, total: max(1, stats.totalSummaries))))
                                                }
                                            }
                                            .frame(height: 6)
                                            Text("\(row.count)")
                                                .font(.caption2)
                                                .foregroundStyle(.tertiary)
                                                .frame(width: 24, alignment: .trailing)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                EmptyStateCard(icon: "chart.bar", title: "暂无统计数据", detail: "等产生更多摘要后会出现趋势与标签。")
            }
        }
    }

    // MARK: History

    private var historyHeaderView: some View {
        VStack(alignment: .leading, spacing: DS.md) {
            HStack(alignment: .firstTextBaseline) {
                SectionHeader(title: "历史摘要")
                Spacer()
                Picker("History Period", selection: $viewModel.historyPeriod) {
                    ForEach(DigestPeriod.allCases) { period in
                        Text(period.title).tag(period)
                    }
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 160)
                .onChange(of: viewModel.historyPeriod) { _, value in
                    Task { await viewModel.setHistoryPeriod(value) }
                }
            }

            RuleNotesCard(
                title: "历史卡片规则",
                notes: [
                    "每张历史摘要卡片只展示 topItems 前 2 条。",
                    "完整重点条目以当前期 Digest 的 topItems 为准。"
                ]
            )
        }
    }

    @ViewBuilder
    private var historyContentView: some View {
        if viewModel.digestHistory.isEmpty {
            EmptyStateCard(icon: "clock", title: "暂无历史摘要", detail: "点击下拉刷新后会加载最近摘要。")
        } else {
            ForEach(Array(viewModel.digestHistory.enumerated()), id: \.offset) { _, digest in
                Card {
                    VStack(alignment: .leading, spacing: DS.sm) {
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
                                Button {
                                    selectedTweetRoute = TweetRoute(tweetId: topItem.tweetId)
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
                    HStack(spacing: DS.sm) {
                        if viewModel.isLoadingHistoryMore {
                            ProgressView()
                                .controlSize(.small)
                        }
                        Text(viewModel.isLoadingHistoryMore ? "加载中..." : "加载更多历史")
                            .font(.subheadline.weight(.medium))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, DS.md)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.orange)
            }
        }
    }

    // MARK: Items

    private var itemsHeaderView: some View {
        VStack(alignment: .leading, spacing: DS.md) {
            SectionHeader(title: "最新条目", subtitle: "\(viewModel.items.count) 条")

            Card {
                DisclosureGroup {
                    VStack(alignment: .leading, spacing: DS.md) {
                        filterRow(title: "每页") {
                            HStack(spacing: DS.sm) {
                                ForEach([10, 20], id: \.self) { limit in
                                    FilterChip(title: "\(limit)", active: viewModel.itemLimit == limit) {
                                        Task { await viewModel.setItemLimit(limit) }
                                    }
                                }
                            }
                        }

                        filterRow(title: "类型") {
                            FlowWrapLayout(spacing: DS.sm, rowSpacing: DS.sm) {
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

                        filterRow(title: "质量") {
                            FlowWrapLayout(spacing: DS.sm, rowSpacing: DS.sm) {
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

                        if !viewModel.availableTags.isEmpty {
                            filterRow(title: "标签") {
                                FlowWrapLayout(spacing: DS.sm, rowSpacing: DS.sm) {
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

                        if !viewModel.filterTag.isEmpty || viewModel.filterClaimLabel != nil || viewModel.filterQualityMin != nil || viewModel.itemLimit != 20 {
                            Button("清除筛选") {
                                Task { await viewModel.clearFilters() }
                            }
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.orange)
                        }
                    }
                    .padding(.top, DS.md)
                } label: {
                    Label("筛选条件", systemImage: "line.3.horizontal.decrease")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.primary)
                }
                .tint(.secondary)
            }
        }
    }

    @ViewBuilder
    private var itemsContentView: some View {
        if viewModel.items.isEmpty && !viewModel.isLoading {
            EmptyStateCard(icon: "tray", title: "暂无条目", detail: "试试放宽筛选条件或先同步书签。")
        } else {
            ForEach(viewModel.items) { item in
                Button {
                    selectedTweetRoute = TweetRoute(tweetId: item.tweetId)
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
                    HStack(spacing: DS.sm) {
                        if viewModel.isLoadingMore {
                            ProgressView()
                                .controlSize(.small)
                        }
                        Text(viewModel.isLoadingMore ? "加载中..." : "加载更多")
                            .font(.subheadline.weight(.medium))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, DS.md)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.orange)
            }
        }
    }

    private func filterRow<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: DS.xs) {
            Text(title)
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
            content()
        }
    }
}

// MARK: - Week

struct WeekView: View {
    @StateObject private var viewModel = WeekViewModel()
    @State private var selectedTweetRoute: TweetRoute?

    var body: some View {
        NavigationStack {
            ScrollView(.vertical) {
                VStack(spacing: DS.sectionGap) {
                    if let message = viewModel.errorMessage {
                        ErrorBanner(message: message)
                    }

                    if let digest = viewModel.digest {
                        DigestHeroCard(digest: digest, title: "Week Digest")

                        if viewModel.hasDigestContent {
                            if !digest.topItems.isEmpty {
                                VStack(alignment: .leading, spacing: DS.md) {
                                    Text("重点条目")
                                        .font(.headline)
                                    ForEach(digest.topItems) { topItem in
                                        Button {
                                            selectedTweetRoute = TweetRoute(tweetId: topItem.tweetId)
                                        } label: {
                                            TopItemRow(item: topItem)
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }

                            if !digest.risks.isEmpty {
                                Card {
                                    VStack(alignment: .leading, spacing: DS.sm) {
                                        Label("风险雷达", systemImage: "exclamationmark.triangle.fill")
                                            .font(.headline)
                                            .foregroundStyle(.orange)
                                        ForEach(digest.risks, id: \.self) { risk in
                                            Text(risk)
                                                .font(.subheadline)
                                        }
                                    }
                                }
                            }

                            if !digest.tomorrowActions.isEmpty {
                                Card {
                                    VStack(alignment: .leading, spacing: DS.sm) {
                                        Text("行动建议")
                                            .font(.headline)
                                        ForEach(digest.tomorrowActions, id: \.self) { action in
                                            Label(action, systemImage: "checkmark.circle.fill")
                                                .font(.subheadline)
                                        }
                                    }
                                }
                            }
                        } else {
                            EmptyStateCard(icon: "doc.text", title: "本周摘要暂无内容", detail: "当前已有周摘要记录，但内容为空。")
                        }
                    } else if !viewModel.isLoading {
                        EmptyStateCard(
                            icon: "calendar.badge.clock",
                            title: "本周摘要还未生成",
                            detail: "在 Admin 触发 weekly digest 后，这里会自动展示。"
                        )
                    }
                }
                .padding(.horizontal, DS.pageH)
                .padding(.bottom, DS.xxl)
                .frame(maxWidth: .infinity)
                .clipped()
            }
            .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
            .background(AppBackground())
            .refreshable {
                await viewModel.load()
            }
            .overlay {
                if viewModel.isLoading && viewModel.digest == nil {
                    ProgressView()
                }
            }
            .navigationTitle("Week")
            .task {
                await viewModel.load()
            }
            .navigationDestination(item: $selectedTweetRoute) { route in
                ItemLoaderView(tweetId: route.tweetId)
            }
        }
    }
}

// MARK: - Detail

struct ItemDetailView: View {
    @StateObject private var viewModel: ItemDetailViewModel
    @State private var activeWebURL: URL?
    @State private var activeDictionaryTerm: String?
    @State private var isVocabularySheetPresented = false
    @State private var vocabularyState = VocabularySheetState()
    @State private var vocabularyRequestID: UUID?
    @State private var copiedKeyword: String?
    @State private var copiedKeywordsHint: String?
    @Environment(\.openURL) private var openURL

    init(seed: BookmarkItemResponse) {
        _viewModel = StateObject(wrappedValue: ItemDetailViewModel(seed: seed))
    }

    var body: some View {
        let vocabularyPlan = viewModel.vocabularyPlan.isEmpty
            ? DetailVocabularyPlanner.build(item: viewModel.item, localInsight: viewModel.localInsight)
            : viewModel.vocabularyPlan
        let highlightedWordCount = vocabularyPlan.values.reduce(0) { partial, terms in
            partial + terms.count
        }

        ScrollView(.vertical) {
            VStack(spacing: DS.lg) {
                Card {
                    VStack(alignment: .leading, spacing: DS.md) {
                        HStack(spacing: DS.sm) {
                            Text(String(viewModel.item.authorName.prefix(1)))
                                .font(.caption.weight(.bold))
                                .foregroundStyle(.white)
                                .frame(width: 28, height: 28)
                                .background(Color.orange.gradient, in: Circle())
                            Text(viewModel.item.authorName)
                                .font(.headline)
                            Spacer()
                            Text(relativeDate(viewModel.item.syncedAt ?? viewModel.item.createdAtX))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        RichPostTextView(
                            text: viewModel.item.text,
                            highlightedTerms: vocabularyPlan["post.text"] ?? [],
                            textStyle: .body,
                            fontWeight: .regular,
                            textColor: .label
                        ) { tappedURL in
                            openURLForDetail(tappedURL)
                        } onVocabularyTap: { term in
                            openDictionaryLookup(for: term)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)

                        if highlightedWordCount > 0 {
                            Text(viewModel.isGeneratingVocabularyPlan
                                 ? "端侧模型正在优化高亮词，结果将自动刷新。"
                                 : "高亮词可点击查词；链接仍保持原跳转。同词在本页只高亮一次。")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }

                        if let url = URL(string: viewModel.item.url), !viewModel.item.url.isEmpty {
                            Button {
                                openURLForDetail(url)
                            } label: {
                                Label("Open on X", systemImage: "arrow.up.right.square")
                                    .font(.subheadline.weight(.medium))
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(.orange)
                        }
                    }
                }

                if let summary = viewModel.item.summary {
                    if let renderMarkdown = summary.renderMarkdown?.trimmingCharacters(in: .whitespacesAndNewlines),
                       !renderMarkdown.isEmpty {
                        Card {
                            VStack(alignment: .leading, spacing: DS.sm) {
                                Text("Markdown 摘要")
                                    .font(.headline)
                                MarkdownTextBlock(
                                    markdown: renderMarkdown,
                                    highlightedTerms: vocabularyPlan["summary.renderMarkdown"] ?? []
                                ) { tappedURL in
                                    openURLForDetail(tappedURL)
                                } onVocabularyTap: { term in
                                    openDictionaryLookup(for: term)
                                }
                            }
                        }
                    }

                    Card {
                        VStack(alignment: .leading, spacing: DS.md) {
                            Text("摘要")
                                .font(.headline)
                            if !summary.oneLinerZh.isEmpty {
                                RichPostTextView(
                                    text: summary.oneLinerZh,
                                    highlightedTerms: vocabularyPlan["summary.oneLinerZh"] ?? [],
                                    textStyle: .subheadline,
                                    fontWeight: .semibold,
                                    textColor: .label
                                ) { tappedURL in
                                    openURLForDetail(tappedURL)
                                } onVocabularyTap: { term in
                                    openDictionaryLookup(for: term)
                                }
                            }
                            if !summary.oneLinerEn.isEmpty {
                                RichPostTextView(
                                    text: summary.oneLinerEn,
                                    highlightedTerms: vocabularyPlan["summary.oneLinerEn"] ?? [],
                                    textStyle: .footnote,
                                    fontWeight: .regular,
                                    textColor: .secondaryLabel
                                ) { tappedURL in
                                    openURLForDetail(tappedURL)
                                } onVocabularyTap: { term in
                                    openDictionaryLookup(for: term)
                                }
                            }
                            ForEach(Array(summary.bulletsZh.enumerated()), id: \.offset) { index, bullet in
                                HStack(alignment: .top, spacing: DS.sm) {
                                    Circle()
                                        .fill(Color.orange)
                                        .frame(width: 5, height: 5)
                                        .padding(.top, 7)
                                    RichPostTextView(
                                        text: bullet,
                                        highlightedTerms: vocabularyPlan["summary.bulletZh.\(index)"] ?? [],
                                        textStyle: .subheadline,
                                        fontWeight: .regular,
                                        textColor: .label
                                    ) { tappedURL in
                                        openURLForDetail(tappedURL)
                                    } onVocabularyTap: { term in
                                        openDictionaryLookup(for: term)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                }
                            }
                            if summary.qualityScore > 0 {
                                Text("质量分 \(String(format: "%.1f", summary.qualityScore))")
                                    .font(.caption.weight(.medium))
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }

                    if let coreViewpoint = summary.coreViewpoint, !coreViewpoint.isEmpty {
                        Card {
                            VStack(alignment: .leading, spacing: DS.sm) {
                                Text("核心观点")
                                    .font(.headline)
                                RichPostTextView(
                                    text: coreViewpoint,
                                    highlightedTerms: vocabularyPlan["summary.coreViewpoint"] ?? [],
                                    textStyle: .subheadline,
                                    fontWeight: .regular,
                                    textColor: .label
                                ) { tappedURL in
                                    openURLForDetail(tappedURL)
                                } onVocabularyTap: { term in
                                    openDictionaryLookup(for: term)
                                }
                            }
                        }
                    }

                    if let underlyingProblem = summary.underlyingProblem, !underlyingProblem.isEmpty {
                        Card {
                            VStack(alignment: .leading, spacing: DS.sm) {
                                Text("底层问题")
                                    .font(.headline)
                                RichPostTextView(
                                    text: underlyingProblem,
                                    highlightedTerms: vocabularyPlan["summary.underlyingProblem"] ?? [],
                                    textStyle: .subheadline,
                                    fontWeight: .regular,
                                    textColor: .label
                                ) { tappedURL in
                                    openURLForDetail(tappedURL)
                                } onVocabularyTap: { term in
                                    openDictionaryLookup(for: term)
                                }
                            }
                        }
                    }

                    if !summary.keyTechnologies.isEmpty {
                        Card {
                            VStack(alignment: .leading, spacing: DS.md) {
                                Text("关键技术/概念")
                                    .font(.headline)
                                ForEach(Array(summary.keyTechnologies.enumerated()), id: \.element.id) { index, item in
                                    VStack(alignment: .leading, spacing: 2) {
                                        Button {
                                            openGoogleAISearch(for: item.concept)
                                        } label: {
                                            HStack(spacing: DS.xs) {
                                                Text(item.concept)
                                                    .font(.subheadline.weight(.semibold))
                                                    .underline()
                                                Image(systemName: "arrow.up.right.square")
                                                    .font(.caption2)
                                            }
                                            .foregroundStyle(.blue)
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                        }
                                        .buttonStyle(.plain)
                                        RichPostTextView(
                                            text: item.solves,
                                            highlightedTerms: vocabularyPlan["summary.keyTechSolves.\(index)"] ?? [],
                                            textStyle: .footnote,
                                            fontWeight: .regular,
                                            textColor: .secondaryLabel
                                        ) { tappedURL in
                                            openURLForDetail(tappedURL)
                                        } onVocabularyTap: { term in
                                            openDictionaryLookup(for: term)
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if !summary.claimTypes.isEmpty {
                        Card {
                            VStack(alignment: .leading, spacing: DS.sm) {
                                Text("判断类型")
                                    .font(.headline)
                                ForEach(Array(summary.claimTypes.prefix(5).enumerated()), id: \.element.id) { index, claim in
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(claimLabelTitle(claim.label))
                                            .font(.caption.weight(.semibold))
                                            .foregroundStyle(.secondary)
                                        RichPostTextView(
                                            text: claim.statement,
                                            highlightedTerms: vocabularyPlan["summary.claim.\(index)"] ?? [],
                                            textStyle: .footnote,
                                            fontWeight: .regular,
                                            textColor: .label
                                        ) { tappedURL in
                                            openURLForDetail(tappedURL)
                                        } onVocabularyTap: { term in
                                            openDictionaryLookup(for: term)
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if !summary.actions.isEmpty {
                        Card {
                            VStack(alignment: .leading, spacing: DS.sm) {
                                Text("行动项")
                                    .font(.headline)
                                ForEach(Array(summary.actions.enumerated()), id: \.offset) { index, action in
                                    HStack(alignment: .top, spacing: DS.sm) {
                                        Image(systemName: "sparkles")
                                            .font(.caption.weight(.semibold))
                                            .foregroundStyle(.orange)
                                            .padding(.top, 3)
                                        RichPostTextView(
                                            text: action,
                                            highlightedTerms: vocabularyPlan["summary.action.\(index)"] ?? [],
                                            textStyle: .subheadline,
                                            fontWeight: .regular,
                                            textColor: .label
                                        ) { tappedURL in
                                            openURLForDetail(tappedURL)
                                        } onVocabularyTap: { term in
                                            openDictionaryLookup(for: term)
                                        }
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                    }
                                }
                            }
                        }
                    }

                    let displayResearchKeywords = sanitizedResearchKeywords(summary.researchKeywordsEn)
                    if !displayResearchKeywords.isEmpty {
                        Card {
                            VStack(alignment: .leading, spacing: DS.sm) {
                                Text("研究关键词")
                                    .font(.headline)
                                KeywordLinkFlow(
                                    keywords: displayResearchKeywords,
                                    copiedKeyword: copiedKeyword
                                ) { keyword in
                                    openGoogleAISearch(for: keyword)
                                } onCopy: { keyword in
                                    copyResearchKeyword(keyword)
                                }
                                if let copiedKeywordsHint, !copiedKeywordsHint.isEmpty {
                                    Text(copiedKeywordsHint)
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                                Text("点击关键词会尝试打开 Google AI 搜索（不可用时回退普通搜索）。")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                Card {
                    VStack(alignment: .leading, spacing: DS.md) {
                        HStack {
                            Label("端侧AI本地增强", systemImage: "sparkles")
                                .font(.headline)
                            Spacer()
                            if viewModel.isGeneratingLocalInsight {
                                ProgressView()
                                    .controlSize(.small)
                            }
                        }

                        Text("不影响后端摘要，仅用于 Detail 内快速决策")
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        Picker("增强模式", selection: $viewModel.localInsightMode) {
                            ForEach(LocalFunInsightMode.allCases) { mode in
                                Text(mode.title).tag(mode)
                            }
                        }
                        .pickerStyle(.segmented)

                        Text(viewModel.localInsightMode.subtitle)
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        Button(viewModel.localInsightMode.buttonTitle) {
                            Task { await viewModel.generateLocalInsightIfEnabled() }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.orange)

                        if let localInsight = viewModel.localInsight {
                            HStack(alignment: .firstTextBaseline) {
                                RichPostTextView(
                                    text: localInsight.title,
                                    highlightedTerms: vocabularyPlan["localInsight.title"] ?? [],
                                    textStyle: .subheadline,
                                    fontWeight: .semibold,
                                    textColor: .label
                                ) { tappedURL in
                                    openURLForDetail(tappedURL)
                                } onVocabularyTap: { term in
                                    openDictionaryLookup(for: term)
                                }
                                Spacer()
                                Text(localInsight.source)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                            ForEach(Array(localInsight.highlights.enumerated()), id: \.offset) { index, line in
                                HStack(alignment: .top, spacing: DS.sm) {
                                    Text("•")
                                        .font(.footnote.weight(.semibold))
                                        .padding(.top, 2)
                                    RichPostTextView(
                                        text: line,
                                        highlightedTerms: vocabularyPlan["localInsight.highlight.\(index)"] ?? [],
                                        textStyle: .footnote,
                                        fontWeight: .regular,
                                        textColor: .label
                                    ) { tappedURL in
                                        openURLForDetail(tappedURL)
                                    } onVocabularyTap: { term in
                                        openDictionaryLookup(for: term)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                }
                            }
                            if !localInsight.suggestions.isEmpty {
                                Divider()
                                ForEach(Array(localInsight.suggestions.enumerated()), id: \.offset) { index, line in
                                    HStack(alignment: .top, spacing: DS.sm) {
                                        Image(systemName: "sparkles")
                                            .font(.caption.weight(.semibold))
                                            .foregroundStyle(.orange)
                                            .padding(.top, 2)
                                        RichPostTextView(
                                            text: line,
                                            highlightedTerms: vocabularyPlan["localInsight.suggestion.\(index)"] ?? [],
                                            textStyle: .footnote,
                                            fontWeight: .regular,
                                            textColor: .label
                                        ) { tappedURL in
                                            openURLForDetail(tappedURL)
                                        } onVocabularyTap: { term in
                                            openDictionaryLookup(for: term)
                                        }
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                    }
                                }
                            }
                        }
                    }
                }

                if let errorMessage = viewModel.errorMessage {
                    ErrorBanner(message: errorMessage)
                }
            }
            .padding(.horizontal, DS.pageH)
            .padding(.vertical, DS.lg)
            .frame(maxWidth: .infinity)
            .clipped()
        }
        .scrollBounceBehavior(.basedOnSize, axes: .vertical)
        .background(AppBackground())
        .navigationTitle("Detail")
        .task {
            await viewModel.refreshVocabularyPlan()
        }
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
            if !isShown { activeWebURL = nil }
        })) {
            if let url = activeWebURL {
                InAppSafariView(url: url)
                    .ignoresSafeArea()
            }
        }
        .sheet(isPresented: Binding(get: { activeDictionaryTerm != nil }, set: { isShown in
            if !isShown { activeDictionaryTerm = nil }
        })) {
            if let term = activeDictionaryTerm {
                DictionaryLookupView(term: term)
                    .ignoresSafeArea()
            }
        }
        .sheet(isPresented: $isVocabularySheetPresented) {
            VocabularyInsightSheet(
                state: vocabularyState,
                onCopy: copyVocabularyTranslation,
                onOpenSystemDictionary: {
                    let term = vocabularyState.term
                    isVocabularySheetPresented = false
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
                        openSystemDictionary(for: term)
                    }
                },
                onRetry: {
                    Task {
                        await triggerVocabularyLookup(
                            term: vocabularyState.term,
                            context: vocabularyState.context,
                            forceRefresh: true
                        )
                    }
                }
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
            .presentationCornerRadius(24)
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
            if accepted { return }
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
        guard let host = url.host?.lowercased() else { return false }
        return host == "x.com" || host == "www.x.com" || host == "twitter.com" || host == "www.twitter.com"
    }

    private func extractTweetID(from url: URL) -> String? {
        let parts = url.pathComponents.filter { $0 != "/" }
        guard let statusIndex = parts.firstIndex(of: "status"), statusIndex + 1 < parts.count else {
            return nil
        }
        let candidate = parts[statusIndex + 1]
        guard candidate.allSatisfy(\.isNumber) else { return nil }
        return candidate
    }

    private func openDictionaryLookup(for term: String) {
        let trimmed = term.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return
        }

        Task {
            await triggerVocabularyLookup(
                term: trimmed,
                context: viewModel.item.text,
                forceRefresh: false
            )
        }
    }

    private func triggerVocabularyLookup(term: String, context: String, forceRefresh: Bool) async {
        let trimmed = term.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return
        }

        let requestID = UUID()
        vocabularyRequestID = requestID
        vocabularyState = VocabularySheetState(
            term: trimmed,
            context: compactLookupContext(context),
            sourceLangHint: detectSourceLangHint(from: trimmed),
            targetLang: "zh-CN",
            isLoading: true,
            card: nil,
            fromCache: false,
            errorMessage: nil
        )
        isVocabularySheetPresented = true

        do {
            let result = try await VocabularyLookupService.shared.lookup(
                term: trimmed,
                context: vocabularyState.context,
                sourceLangHint: vocabularyState.sourceLangHint,
                targetLang: vocabularyState.targetLang,
                forceRefresh: forceRefresh
            )

            guard vocabularyRequestID == requestID else {
                return
            }

            vocabularyState.isLoading = false
            vocabularyState.card = result.response
            vocabularyState.fromCache = result.fromCache
            vocabularyState.errorMessage = nil
        } catch {
            guard vocabularyRequestID == requestID else {
                return
            }

            vocabularyState.isLoading = false
            vocabularyState.errorMessage = error.localizedDescription
        }
    }

    private func compactLookupContext(_ raw: String) -> String {
        let compact = raw.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
        if compact.count <= 160 {
            return compact
        }
        return String(compact.prefix(160))
    }

    private func detectSourceLangHint(from term: String) -> String {
        let hasChinese = term.range(of: "\\p{Han}", options: .regularExpression) != nil
        let hasEnglish = term.range(of: "[A-Za-z]", options: .regularExpression) != nil
        if hasChinese && hasEnglish {
            return "mixed"
        }
        if hasChinese {
            return "zh"
        }
        if hasEnglish {
            return "en"
        }
        return "unknown"
    }

    private func copyVocabularyTranslation() {
        guard let card = vocabularyState.card else {
            return
        }
        let lines = [card.translation, card.shortDefinitionZh]
            .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        guard !lines.isEmpty else {
            return
        }
        UIPasteboard.general.string = lines.joined(separator: "\n")
    }

    private func openSystemDictionary(for term: String) {
        if UIReferenceLibraryViewController.dictionaryHasDefinition(forTerm: term) {
            activeDictionaryTerm = term
            return
        }

        guard let url = dictionaryLookupURL(for: term) else {
            return
        }
        activeWebURL = url
    }

    private func dictionaryLookupURL(for term: String) -> URL? {
        let trimmed = term.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return nil
        }

        let query = containsChinese(trimmed)
            ? "\(trimmed) 英文 中文 释义"
            : "define \(trimmed)"

        var components = URLComponents(string: "https://www.google.com/search")
        components?.queryItems = [
            URLQueryItem(name: "q", value: query),
            URLQueryItem(name: "hl", value: "zh-CN")
        ]
        return components?.url
    }

    private func containsChinese(_ value: String) -> Bool {
        value.range(of: "\\p{Han}", options: .regularExpression) != nil
    }

    private func openGoogleAISearch(for keyword: String) {
        guard let url = googleAISearchURL(for: keyword) else {
            return
        }
        openURL(url) { accepted in
            if !accepted {
                activeWebURL = url
            }
        }
    }

    private func googleAISearchURL(for keyword: String) -> URL? {
        let trimmed = keyword.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return nil
        }

        var components = URLComponents(string: "https://www.google.com/search")
        components?.queryItems = [
            URLQueryItem(name: "q", value: trimmed),
            URLQueryItem(name: "udm", value: "50")
        ]
        return components?.url
    }

    private func copyResearchKeyword(_ keyword: String) {
        let trimmed = keyword.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        UIPasteboard.general.string = trimmed
        copiedKeyword = trimmed
        copiedKeywordsHint = "已复制：\(trimmed)"

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) {
            if copiedKeyword == trimmed {
                copiedKeyword = nil
            }
            if copiedKeywordsHint == "已复制：\(trimmed)" {
                copiedKeywordsHint = nil
            }
        }
    }

    private func sanitizedResearchKeywords(_ keywords: [String]) -> [String] {
        let blocked = Set([
            "x-post-analysis",
            "analysis",
            "research",
            "keyword",
            "keywords",
            "summary",
            "summaries",
            "insight",
            "insights",
            "topic",
            "topics",
            "model-retry",
            "summary-fallback",
            "system-fallback",
            "uncategorized",
            "unknown",
            "none",
            "na",
            "n-a"
        ])

        var output: [String] = []
        var seen = Set<String>()
        for keyword in keywords {
            let normalized = keyword
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
                .replacingOccurrences(of: " ", with: "-")

            if normalized.isEmpty || blocked.contains(normalized) {
                continue
            }
            if seen.contains(normalized) {
                continue
            }

            seen.insert(normalized)
            output.append(normalized)
            if output.count >= 6 {
                break
            }
        }

        return output
    }

}

enum DetailVocabularyPlanner {
    private static let maxTermsPerBlock = 3
    private static let maxTermsTotal = 36

    private static let englishStopwords: Set<String> = [
        "about", "after", "again", "also", "because", "before", "being", "between", "could",
        "first", "from", "have", "into", "just", "more", "most", "other", "over", "same",
        "some", "such", "than", "that", "their", "there", "these", "they", "this", "those",
        "very", "what", "when", "where", "which", "while", "with", "would", "your", "you",
        "post", "tweet", "thread", "summary", "insight"
    ]

    private static let curatedPhrases: [String] = [
        "large language model",
        "large language models",
        "language model",
        "language models",
        "retrieval augmented generation",
        "mixture of experts",
        "chain of thought",
        "prompt engineering",
        "in context learning",
        "vector database",
        "foundation model",
        "fine tuning",
        "reinforcement learning",
        "supervised fine tuning",
        "agent workflow",
        "model distillation",
        "knowledge graph",
        "attention mechanism"
    ]

    private static let boostedTerms: Set<String> = [
        "ai", "ml", "llm", "vlm", "rag", "sft", "rlhf", "moe", "cot", "mcp",
        "agent", "agents", "token", "tokens", "embedding", "embeddings",
        "inference", "throughput", "latency", "quantization", "distillation",
        "retrieval", "vector", "prompt", "prompts", "finetune", "finetuning",
        "benchmark", "benchmarks", "eval", "evaluation", "transformer",
        "transformers", "attention"
    ]

    private struct Candidate {
        let term: String
        let normalized: String
        let location: Int
        let score: Int
        let isPhrase: Bool
    }

    private struct Block {
        let key: String
        let text: String
    }

    static func buildPreferred(item: BookmarkItemResponse, localInsight: LocalFunInsight?) async -> [String: [String]] {
        let fallback = build(item: item, localInsight: localInsight)

        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            let blocks = buildBlocks(item: item, localInsight: localInsight)
            if let modelPlan = await buildWithFoundationModels(blocks: blocks), !modelPlan.isEmpty {
                return mergeModelPlan(modelPlan, fallbackPlan: fallback, blocks: blocks)
            }
        }
        #endif

        return fallback
    }

    static func build(item: BookmarkItemResponse, localInsight: LocalFunInsight?) -> [String: [String]] {
        let blocks = buildBlocks(item: item, localInsight: localInsight)

        var result: [String: [String]] = [:]
        var globalSeen = Set<String>()
        var totalCount = 0

        for block in blocks {
            var blockTerms: [String] = []
            let candidates = rankedCandidates(from: block.text)
            var phrasePicked = false
            var wordCount = 0

            for candidate in candidates {
                if candidate.normalized.isEmpty || globalSeen.contains(candidate.normalized) {
                    continue
                }

                if candidate.isPhrase {
                    if phrasePicked {
                        continue
                    }
                } else if phrasePicked && wordCount >= 2 {
                    continue
                }

                globalSeen.insert(candidate.normalized)
                blockTerms.append(candidate.term)
                totalCount += 1

                if candidate.isPhrase {
                    phrasePicked = true
                } else {
                    wordCount += 1
                }

                if blockTerms.count >= maxTermsPerBlock || totalCount >= maxTermsTotal {
                    break
                }
            }

            if !blockTerms.isEmpty {
                result[block.key] = blockTerms
            }

            if totalCount >= maxTermsTotal {
                break
            }
        }

        return result
    }

    private static func mergeModelPlan(
        _ modelPlan: [String: [String]],
        fallbackPlan: [String: [String]],
        blocks: [Block]
    ) -> [String: [String]] {
        var result: [String: [String]] = [:]
        var globalSeen = Set<String>()
        var totalCount = 0

        for block in blocks {
            var terms: [String] = []
            let modelTerms = modelPlan[block.key] ?? []
            let fallbackTerms = fallbackPlan[block.key] ?? []
            let candidates = modelTerms + fallbackTerms

            for term in candidates {
                if terms.count >= maxTermsPerBlock || totalCount >= maxTermsTotal {
                    break
                }

                let normalized = normalizedKey(term)
                if normalized.isEmpty || globalSeen.contains(normalized) {
                    continue
                }
                guard !ranges(of: term, in: block.text).isEmpty else {
                    continue
                }

                globalSeen.insert(normalized)
                terms.append(term)
                totalCount += 1
            }

            if !terms.isEmpty {
                result[block.key] = terms
            }

            if totalCount >= maxTermsTotal {
                break
            }
        }

        return result
    }

    #if canImport(FoundationModels)
    @available(iOS 26.0, *)
    private static func buildWithFoundationModels(blocks: [Block]) async -> [String: [String]]? {
        guard !blocks.isEmpty else {
            return nil
        }

        do {
            let session = LanguageModelSession(
                instructions: """
                You select glossary-worthy technical terms for text highlighting in a mobile reader.
                Return STRICT JSON only, no markdown, no explanation.
                JSON shape:
                {
                  "<block_key>": ["term1", "term2", "term3"]
                }
                Rules:
                - keys must come from provided block keys only.
                - each value is an array of 0-3 English terms/phrases (1-3 words).
                - prioritize domain terms and named technical concepts.
                - avoid generic words, pronouns, and filler terms.
                - keep terms exactly as they appear in the text when possible.
                """
            )

            let payload = serializedBlockPayload(blocks)
            let response = try await session.respond(
                to: """
                Select highlight terms for these blocks:
                \(payload)
                """
            )

            let raw = response.content.trimmingCharacters(in: .whitespacesAndNewlines)
            return parseFoundationModelsPlan(raw, blocks: blocks)
        } catch {
            return nil
        }
    }

    private static func serializedBlockPayload(_ blocks: [Block]) -> String {
        let items: [[String: String]] = blocks.map { block in
            let compact = block.text
                .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let clipped = String(compact.prefix(600))
            return ["key": block.key, "text": clipped]
        }

        guard JSONSerialization.isValidJSONObject(items),
              let data = try? JSONSerialization.data(withJSONObject: items, options: [.sortedKeys]),
              let output = String(data: data, encoding: .utf8) else {
            return "[]"
        }
        return output
    }

    private static func parseFoundationModelsPlan(_ raw: String, blocks: [Block]) -> [String: [String]] {
        let jsonCandidate = extractJSONObjectText(from: raw)
        guard let data = jsonCandidate.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data),
              let object = json as? [String: Any] else {
            return [:]
        }

        let blockByKey = Dictionary(uniqueKeysWithValues: blocks.map { ($0.key, $0) })
        var result: [String: [String]] = [:]
        var globalSeen = Set<String>()
        var totalCount = 0

        for block in blocks {
            guard let values = object[block.key] as? [Any] else {
                continue
            }

            var terms: [String] = []
            for value in values {
                if terms.count >= maxTermsPerBlock || totalCount >= maxTermsTotal {
                    break
                }

                guard let rawTerm = value as? String else {
                    continue
                }
                let term = rawTerm.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !term.isEmpty,
                      term.count <= 60,
                      isEnglishLike(term) else {
                    continue
                }

                guard let sourceBlock = blockByKey[block.key],
                      !ranges(of: term, in: sourceBlock.text).isEmpty else {
                    continue
                }

                let normalized = normalizedKey(term)
                guard !normalized.isEmpty, !globalSeen.contains(normalized) else {
                    continue
                }

                globalSeen.insert(normalized)
                terms.append(term)
                totalCount += 1
            }

            if !terms.isEmpty {
                result[block.key] = terms
            }
        }

        return result
    }

    private static func extractJSONObjectText(from raw: String) -> String {
        if let start = raw.firstIndex(of: "{"), let end = raw.lastIndex(of: "}") {
            return String(raw[start...end])
        }
        return raw
    }
    #endif

    private static func buildBlocks(item: BookmarkItemResponse, localInsight: LocalFunInsight?) -> [Block] {
        var blocks: [Block] = []
        blocks.append(Block(key: "post.text", text: item.text))

        if let summary = item.summary {
            if let renderMarkdown = summary.renderMarkdown?.trimmingCharacters(in: .whitespacesAndNewlines),
               !renderMarkdown.isEmpty {
                blocks.append(
                    Block(
                        key: "summary.renderMarkdown",
                        text: plainTextForVocabulary(fromMarkdown: renderMarkdown)
                    )
                )
            }

            blocks.append(Block(key: "summary.oneLinerZh", text: summary.oneLinerZh))
            blocks.append(Block(key: "summary.oneLinerEn", text: summary.oneLinerEn))

            for (index, bullet) in summary.bulletsZh.enumerated() {
                blocks.append(Block(key: "summary.bulletZh.\(index)", text: bullet))
            }

            if let coreViewpoint = summary.coreViewpoint {
                blocks.append(Block(key: "summary.coreViewpoint", text: coreViewpoint))
            }

            if let underlyingProblem = summary.underlyingProblem {
                blocks.append(Block(key: "summary.underlyingProblem", text: underlyingProblem))
            }

            for (index, item) in summary.keyTechnologies.enumerated() {
                blocks.append(Block(key: "summary.keyTechSolves.\(index)", text: item.solves))
            }

            for (index, claim) in summary.claimTypes.prefix(5).enumerated() {
                blocks.append(Block(key: "summary.claim.\(index)", text: claim.statement))
            }

            for (index, action) in summary.actions.enumerated() {
                blocks.append(Block(key: "summary.action.\(index)", text: action))
            }
        }

        if let localInsight {
            blocks.append(Block(key: "localInsight.title", text: localInsight.title))
            for (index, line) in localInsight.highlights.enumerated() {
                blocks.append(Block(key: "localInsight.highlight.\(index)", text: line))
            }
            for (index, line) in localInsight.suggestions.enumerated() {
                blocks.append(Block(key: "localInsight.suggestion.\(index)", text: line))
            }
        }

        return blocks.filter { !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    private static func plainTextForVocabulary(fromMarkdown markdown: String) -> String {
        var text = markdown

        let cleanupRules: [(String, String)] = [
            ("(?s)```.*?```", " "),
            ("`[^`\\n]+`", " "),
            ("!\\[[^\\]]*\\]\\(([^\\)]*)\\)", " "),
            ("\\[([^\\]]+)\\]\\(([^\\)]*)\\)", "$1"),
            ("<https?://[^>\\s]+>", " ")
        ]

        for (pattern, template) in cleanupRules {
            guard let regex = try? NSRegularExpression(pattern: pattern) else {
                continue
            }
            let nsText = text as NSString
            let range = NSRange(location: 0, length: nsText.length)
            text = regex.stringByReplacingMatches(in: text, options: [], range: range, withTemplate: template)
        }

        return text
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func rankedCandidates(from text: String) -> [Candidate] {
        let nsText = text as NSString
        let fullRange = NSRange(location: 0, length: nsText.length)
        guard fullRange.length > 0 else {
            return []
        }

        var candidatesByNormalized: [String: Candidate] = [:]

        // Curated phrases are highest-priority anchors for technical concepts.
        for phrase in curatedPhrases {
            let ranges = ranges(of: phrase, in: text)
            guard let first = ranges.first else {
                continue
            }

            let normalized = normalizedKey(phrase)
            guard !normalized.isEmpty else {
                continue
            }

            let score = 320 + (min(ranges.count, 3) * 16) + earlyPositionBonus(for: first.location)
            mergeCandidate(
                Candidate(
                    term: nsText.substring(with: first),
                    normalized: normalized,
                    location: first.location,
                    score: score,
                    isPhrase: true
                ),
                into: &candidatesByNormalized
            )
        }

        if let phraseRegex = try? NSRegularExpression(
            pattern: "(?<![A-Za-z0-9_])[A-Za-z][A-Za-z+'-]{2,}(?:\\s+[A-Za-z][A-Za-z+'-]{2,}){1,2}(?![A-Za-z0-9_])"
        ) {
            for match in phraseRegex.matches(in: text, options: [], range: fullRange) {
                let phrase = nsText.substring(with: match.range)
                guard isValidPhrase(phrase) else {
                    continue
                }
                let normalized = normalizedKey(phrase)
                guard !normalized.isEmpty else {
                    continue
                }

                let score = 220
                    + boostedTermBonus(for: normalized)
                    + (min(ranges(of: phrase, in: text).count, 3) * 10)
                    + earlyPositionBonus(for: match.range.location)

                mergeCandidate(
                    Candidate(
                        term: phrase,
                        normalized: normalized,
                        location: match.range.location,
                        score: score,
                        isPhrase: true
                    ),
                    into: &candidatesByNormalized
                )
            }
        }

        if let englishRegex = try? NSRegularExpression(pattern: "(?<![A-Za-z0-9_])[A-Za-z][A-Za-z+'-]{2,}(?![A-Za-z0-9_])") {
            for match in englishRegex.matches(in: text, options: [], range: fullRange) {
                let word = nsText.substring(with: match.range)
                if !isValidEnglish(word) && !isBoostedShortTerm(word) {
                    continue
                }

                let normalized = normalizedKey(word)
                guard !normalized.isEmpty else {
                    continue
                }

                let score = 140
                    + boostedTermBonus(for: normalized)
                    + (min(ranges(of: word, in: text).count, 4) * 8)
                    + earlyPositionBonus(for: match.range.location)

                mergeCandidate(
                    Candidate(
                        term: word,
                        normalized: normalized,
                        location: match.range.location,
                        score: score,
                        isPhrase: false
                    ),
                    into: &candidatesByNormalized
                )
            }
        }

        return candidatesByNormalized.values.sorted { lhs, rhs in
            if lhs.score != rhs.score {
                return lhs.score > rhs.score
            }
            return lhs.location < rhs.location
        }
    }

    private static func isValidEnglish(_ raw: String) -> Bool {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 4, trimmed.count <= 28 else {
            return false
        }
        let normalized = normalizedKey(trimmed)
        guard !normalized.isEmpty else {
            return false
        }
        if englishStopwords.contains(normalized) {
            return false
        }
        if normalized.hasPrefix("http") || normalized.hasPrefix("www") {
            return false
        }
        return true
    }

    private static func isEnglishLike(_ value: String) -> Bool {
        value.range(of: "[A-Za-z]", options: .regularExpression) != nil
    }

    private static func isValidPhrase(_ raw: String) -> Bool {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 8, trimmed.count <= 60 else {
            return false
        }

        let tokens = trimmed
            .split(whereSeparator: \.isWhitespace)
            .map(String.init)
        guard tokens.count >= 2, tokens.count <= 3 else {
            return false
        }

        if !tokens.contains(where: { boostedTerms.contains(normalizedKey($0)) }) {
            return false
        }

        if let first = tokens.first, englishStopwords.contains(normalizedKey(first)) {
            return false
        }
        if let last = tokens.last, englishStopwords.contains(normalizedKey(last)) {
            return false
        }

        return true
    }

    private static func isBoostedShortTerm(_ raw: String) -> Bool {
        let normalized = normalizedKey(raw)
        guard normalized.count >= 2 else {
            return false
        }
        return boostedTerms.contains(normalized)
    }

    private static func boostedTermBonus(for normalizedTerm: String) -> Int {
        let term = normalizedTerm.lowercased()
        let tokens = term
            .split(whereSeparator: { $0 == " " || $0 == "-" })
            .map(String.init)

        var bonus = 0
        for token in tokens where boostedTerms.contains(token) {
            bonus += 22
        }
        return bonus
    }

    private static func earlyPositionBonus(for location: Int) -> Int {
        max(0, 18 - (location / 120))
    }

    private static func mergeCandidate(_ candidate: Candidate, into map: inout [String: Candidate]) {
        guard let existing = map[candidate.normalized] else {
            map[candidate.normalized] = candidate
            return
        }

        if candidate.score > existing.score {
            map[candidate.normalized] = candidate
            return
        }

        if candidate.score == existing.score && candidate.location < existing.location {
            map[candidate.normalized] = candidate
        }
    }

    private static func ranges(of term: String, in text: String) -> [NSRange] {
        let nsText = text as NSString
        let fullRange = NSRange(location: 0, length: nsText.length)
        guard fullRange.length > 0 else {
            return []
        }

        let escaped = NSRegularExpression.escapedPattern(for: term)
        let pattern = "(?<![A-Za-z0-9_])\(escaped)(?![A-Za-z0-9_])"
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else {
            return []
        }
        return regex.matches(in: text, options: [], range: fullRange).map(\.range)
    }

    private static func normalizedKey(_ raw: String) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return ""
        }

        if trimmed.range(of: "\\p{Han}", options: .regularExpression) != nil {
            return trimmed
        }

        let lowercased = trimmed.lowercased()
        let cleaned = lowercased.replacingOccurrences(
            of: "^[^a-z0-9]+|[^a-z0-9]+$",
            with: "",
            options: .regularExpression
        )
        return cleaned
    }
}

// MARK: - Item Loader

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

// MARK: - Settings

struct SettingsView: View {
    @Environment(\.openURL) private var openURL

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
                        .accessibilityIdentifier("settings.api_base")

                    if revealToken {
                        TextField("PAT", text: $pat)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled(true)
                            .accessibilityIdentifier("settings.pat")
                    } else {
                        SecureField("PAT", text: $pat)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled(true)
                            .accessibilityIdentifier("settings.pat")
                    }

                    Toggle("Show PAT", isOn: $revealToken)
                }

                Section("AI") {
                    Toggle("端侧AI本地增强", isOn: $localFunAIEnabled)
                    Text("仅用于 Detail 页本地复述/挑战/行动计划，不影响现有摘要与后端逻辑。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("Google") {
                    Button {
                        openGoogleLoginInSafari()
                    } label: {
                        Label("Google 预登录（Safari）", systemImage: "person.crop.circle.badge.checkmark")
                    }

                    Text("先建立 Google 登录态。关键词搜索会优先外跳 Safari，命中 AI 模式更稳定。")
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
                    .accessibilityIdentifier("settings.save_test")

                    if let result = viewModel.testResult {
                        Text(result)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }

                    if let url = URL(string: "https://xauto-admin-516721184000.asia-east1.run.app/dashboard") {
                        Link(destination: url) {
                            Label("Open Admin Dashboard", systemImage: "arrow.up.right.square")
                        }
                        .accessibilityIdentifier("settings.open_admin")
                    }
                }
            }
            .navigationTitle("Settings")
        }
    }

    private func openGoogleLoginInSafari() {
        guard let url = googleLoginURL() else { return }
        openURL(url)
    }
}

// MARK: - Foundation Components

private struct SkeletonView: View {
    @State private var isAnimating = false

    var body: some View {
        RoundedRectangle(cornerRadius: 4)
            .fill(Color.primary.opacity(0.08))
            .overlay(
                GeometryReader { proxy in
                    LinearGradient(
                        stops: [
                            .init(color: .clear, location: 0),
                            .init(color: .white.opacity(0.4), location: 0.5),
                            .init(color: .clear, location: 1)
                        ],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                    .frame(width: proxy.size.width * 0.3)
                    .offset(x: isAnimating ? proxy.size.width : -proxy.size.width * 0.3)
                }
            )
            .clipped()
            .onAppear {
                withAnimation(.linear(duration: 1.5).repeatForever(autoreverses: false)) {
                    isAnimating = true
                }
            }
    }
}

private struct WeatherSkeleton: View {
    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: DS.md) {
                HStack(spacing: DS.md) {
                    SkeletonView()
                        .frame(width: 36, height: 36)
                    VStack(alignment: .leading, spacing: 6) {
                        SkeletonView().frame(width: 120, height: 18)
                        SkeletonView().frame(width: 80, height: 12)
                    }
                    Spacer()
                    SkeletonView().frame(width: 60, height: 20)
                }
                SkeletonView().frame(height: 16)
                SkeletonView().frame(width: 200, height: 16)
            }
        }
    }
}

private struct DigestSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: DS.md) {
            Card {
                VStack(alignment: .leading, spacing: DS.md) {
                    HStack {
                        SkeletonView().frame(width: 100, height: 22)
                        Spacer()
                        SkeletonView().frame(width: 60, height: 14)
                    }
                    HStack(spacing: DS.sm) {
                        ForEach(0..<3) { _ in
                            SkeletonView().frame(width: 50, height: 24)
                        }
                    }
                }
            }
            VStack(alignment: .leading, spacing: DS.md) {
                SkeletonView().frame(width: 80, height: 20)
                ForEach(0..<3) { _ in
                    HStack(spacing: DS.md) {
                        SkeletonView().frame(width: 3, height: 40)
                        VStack(alignment: .leading, spacing: 6) {
                            SkeletonView().frame(height: 16)
                            SkeletonView().frame(width: 150, height: 12)
                        }
                    }
                }
            }
        }
    }
}

private struct BookmarkSkeleton: View {
    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: DS.sm) {
                HStack(spacing: DS.sm) {
                    SkeletonView().frame(width: 24, height: 24)
                        .clipShape(Circle())
                    SkeletonView().frame(width: 100, height: 16)
                    Spacer()
                    SkeletonView().frame(width: 60, height: 12)
                }
                SkeletonView().frame(height: 16)
                SkeletonView().frame(height: 16)
                SkeletonView().frame(width: 200, height: 16)
                HStack {
                    SkeletonView().frame(width: 40, height: 12)
                    Spacer()
                    SkeletonView().frame(width: 80, height: 12)
                }
            }
        }
    }
}

private struct AppBackground: View {
    var body: some View {
        Color(.systemGroupedBackground)
            .ignoresSafeArea()
    }
}

private struct SectionHeader: View {
    let title: String
    var subtitle: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.title3.weight(.semibold))
            if let subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

private struct Card<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(DS.lg)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                Color(.secondarySystemGroupedBackground),
                in: RoundedRectangle(cornerRadius: DS.cardRadius, style: .continuous)
            )
    }
}

// MARK: - Section Cards

private struct DigestHeroCard: View {
    let digest: DigestResponse
    let title: String

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: DS.md) {
                HStack(alignment: .firstTextBaseline) {
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

private struct WeatherActivityCard: View {
    let activity: WeatherActivityCardData

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: DS.md) {
                HStack(spacing: DS.md) {
                    Image(systemName: activity.raw.symbolName)
                        .font(.title2)
                        .foregroundStyle(.orange)
                        .frame(width: 36)

                    VStack(alignment: .leading, spacing: 2) {
                        HStack(alignment: .firstTextBaseline, spacing: DS.xs) {
                            Text(activity.raw.locationName)
                                .font(.headline)
                            Text("·")
                                .foregroundStyle(.tertiary)
                            Text("\(activity.raw.temperatureC)°C")
                                .font(.title2.weight(.semibold))
                        }
                        Text("\(activity.raw.conditionText) · \(timeString(activity.raw.observationDate)) 更新")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Text(activity.narration.source)
                        .font(.caption2.weight(.medium))
                        .padding(.horizontal, DS.sm)
                        .padding(.vertical, DS.xs)
                        .background(Color.orange.opacity(0.1), in: Capsule())
                }

                Text(activity.narration.summary)
                    .font(.subheadline)

                if !activity.narration.suggestions.isEmpty {
                    VStack(alignment: .leading, spacing: DS.sm) {
                        ForEach(activity.narration.suggestions, id: \.self) { suggestion in
                            Label(suggestion, systemImage: "figure.walk")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }
}

private struct TopItemRow: View {
    let item: DigestItem

    var body: some View {
        HStack(spacing: DS.md) {
            RoundedRectangle(cornerRadius: 2)
                .fill(Color.orange.gradient)
                .frame(width: 3)

            VStack(alignment: .leading, spacing: DS.xs) {
                Text(item.reason.isEmpty ? "#\(item.tweetId)" : item.reason)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.primary)
                    .multilineTextAlignment(.leading)
                if !item.nextStep.isEmpty {
                    Text(item.nextStep)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.leading)
                }
            }

            Spacer(minLength: 0)

            Image(systemName: "chevron.right")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, DS.sm)
    }
}

private struct BookmarkRow: View {
    let item: BookmarkItemResponse

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: DS.sm) {
                HStack(spacing: DS.sm) {
                    Text(String(item.authorName.prefix(1)))
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.white)
                        .frame(width: 24, height: 24)
                        .background(Color.orange.gradient, in: Circle())

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

                HStack {
                    if let quality = item.summary?.qualityScore, quality > 0 {
                        Label(String(format: "%.1f", quality), systemImage: "star")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    if let tags = item.summary?.tagsZh, !tags.isEmpty {
                        Text(tags.prefix(2).joined(separator: " · "))
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                            .lineLimit(1)
                    }
                }
            }
        }
    }
}

// MARK: - Small Components

private struct FilterChip: View {
    let title: String
    let active: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.caption.weight(.medium))
                .padding(.horizontal, DS.md)
                .padding(.vertical, 6)
                .foregroundStyle(active ? .white : .primary)
        }
        .buttonStyle(.plain)
        .background(active ? Color.orange : Color.primary.opacity(0.06), in: Capsule())
    }
}

private struct MetricCell: View {
    let title: String
    let value: String
    var icon: String = ""

    var body: some View {
        VStack(spacing: DS.xs) {
            if !icon.isEmpty {
                Image(systemName: icon)
                    .font(.caption)
                    .foregroundStyle(.orange)
            }
            Text(value)
                .font(.title3.weight(.bold))
                .minimumScaleFactor(0.7)
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, DS.md)
        .background(
            Color.primary.opacity(0.03),
            in: RoundedRectangle(cornerRadius: DS.md, style: .continuous)
        )
    }
}

private struct TagFlow: View {
    let tags: [String]

    var body: some View {
        FlowWrapLayout(spacing: DS.sm, rowSpacing: DS.sm) {
            ForEach(tags, id: \.self) { tag in
                Text(tag)
                    .font(.caption.weight(.medium))
                    .padding(.horizontal, DS.md)
                    .padding(.vertical, 5)
                    .background(Color.orange.opacity(0.1), in: Capsule())
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct KeywordLinkFlow: View {
    let keywords: [String]
    let copiedKeyword: String?
    let onTap: (String) -> Void
    let onCopy: (String) -> Void

    var body: some View {
        FlowWrapLayout(spacing: DS.sm, rowSpacing: DS.sm) {
            ForEach(keywords, id: \.self) { keyword in
                HStack(spacing: DS.xs) {
                    Button {
                        onTap(keyword)
                    } label: {
                        HStack(spacing: DS.xs) {
                            Image(systemName: "magnifyingglass")
                                .font(.caption2.weight(.semibold))
                            Text(keyword)
                                .font(.caption.weight(.medium))
                                .underline()
                        }
                        .padding(.horizontal, DS.md)
                        .padding(.vertical, 6)
                        .foregroundStyle(.blue)
                        .background(Color.blue.opacity(0.08), in: Capsule())
                        .overlay(
                            Capsule()
                                .stroke(Color.blue.opacity(0.25), lineWidth: 1)
                        )
                    }
                    .buttonStyle(.plain)

                    Button {
                        onCopy(keyword)
                    } label: {
                        Image(systemName: copiedKeyword == keyword ? "checkmark" : "doc.on.doc")
                            .font(.caption2.weight(.semibold))
                            .padding(7)
                            .foregroundStyle(copiedKeyword == keyword ? .green : .orange)
                            .background(Color.orange.opacity(0.08), in: Circle())
                            .overlay(
                                Circle()
                                    .stroke(Color.orange.opacity(0.25), lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct VocabularySheetState {
    var term: String = ""
    var context: String = ""
    var sourceLangHint: String = "unknown"
    var targetLang: String = "zh-CN"
    var isLoading: Bool = false
    var card: VocabularyLookupResponse?
    var fromCache: Bool = false
    var errorMessage: String?
}

private struct VocabularyInsightSheet: View {
    let state: VocabularySheetState
    let onCopy: () -> Void
    let onOpenSystemDictionary: () -> Void
    let onRetry: () -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    if state.isLoading {
                        VStack(spacing: 16) {
                            ProgressView()
                                .controlSize(.large)
                            Text("正在通过 AI 深度解析语境...")
                                .font(.system(.subheadline, design: .rounded))
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 60)
                    } else if let card = state.card {
                        VStack(alignment: .leading, spacing: 28) {
                            // Header Section: Term & Phonetic
                            VStack(alignment: .leading, spacing: 12) {
                                HStack(alignment: .firstTextBaseline) {
                                    Text(card.term.isEmpty ? state.term : card.term)
                                        .font(.system(size: 34, weight: .bold, design: .rounded))
                                        .tracking(-0.5)
                                    
                                    Spacer()
                                    
                                    if card.confidence > 0 {
                                        Text("\(Int((card.confidence * 100).rounded()))%")
                                            .font(.system(.caption, design: .monospaced).weight(.bold))
                                            .foregroundStyle(.orange)
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 4)
                                            .background(Color.orange.opacity(0.1), in: Capsule())
                                    }
                                }
                                
                                HStack(spacing: 16) {
                                    if !card.phonetic.ipa.isEmpty {
                                        Text("/\(card.phonetic.ipa)/")
                                            .font(.system(.body, design: .monospaced))
                                            .foregroundStyle(.secondary)
                                    }
                                    
                                    if !card.phonetic.us.isEmpty {
                                        HStack(spacing: 4) {
                                            Image(systemName: "speaker.wave.2.fill")
                                                .font(.caption2)
                                            Text(card.phonetic.us)
                                                .font(.system(.caption, design: .rounded).weight(.medium))
                                        }
                                        .foregroundStyle(.secondary)
                                    }
                                }
                                
                                if !card.partOfSpeech.isEmpty {
                                    HStack(spacing: 6) {
                                        ForEach(card.partOfSpeech, id: \.self) { pos in
                                            Text(pos)
                                                .font(.system(size: 11, weight: .heavy, design: .rounded))
                                                .padding(.horizontal, 8)
                                                .padding(.vertical, 4)
                                                .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 6))
                                                .foregroundStyle(.secondary)
                                        }
                                    }
                                }
                            }

                            // Definition Section: High contrast
                            VStack(alignment: .leading, spacing: 12) {
                                Text(card.translation)
                                    .font(.system(.title3, design: .rounded).weight(.bold))
                                    .foregroundStyle(.primary)
                                
                                if !card.shortDefinitionZh.isEmpty {
                                    Text(card.shortDefinitionZh)
                                        .font(.system(.body, design: .rounded))
                                        .lineSpacing(6)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .padding(20)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.primary.opacity(0.03), in: RoundedRectangle(cornerRadius: 20, style: .continuous))

                            // Context Example: Apple News Style
                            VStack(alignment: .leading, spacing: 14) {
                                Label("语境例句", systemImage: "sparkles")
                                    .font(.system(.subheadline, design: .rounded).weight(.bold))
                                    .foregroundStyle(.orange)
                                
                                VStack(alignment: .leading, spacing: 10) {
                                    Text(card.example.source)
                                        .font(.system(.subheadline, design: .rounded).weight(.medium))
                                        .lineSpacing(4)
                                        .fixedSize(horizontal: false, vertical: true)
                                    
                                    Text(card.example.target)
                                        .font(.system(.footnote, design: .rounded))
                                        .foregroundStyle(.secondary)
                                }
                                .padding(.leading, 16)
                                .overlay(
                                    Rectangle()
                                        .fill(Color.orange.opacity(0.3))
                                        .frame(width: 3)
                                        .padding(.vertical, 2),
                                    alignment: .leading
                                )
                            }

                            // Collocations: Grid-like density
                            if !card.collocations.isEmpty {
                                VStack(alignment: .leading, spacing: 14) {
                                    Label("常见搭配", systemImage: "link")
                                        .font(.system(.subheadline, design: .rounded).weight(.bold))
                                    
                                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                                        ForEach(card.collocations) { item in
                                            VStack(alignment: .leading, spacing: 4) {
                                                Text(item.text)
                                                    .font(.system(.footnote, design: .rounded).weight(.bold))
                                                Text(item.translation)
                                                    .font(.system(size: 10, design: .rounded))
                                                    .foregroundStyle(.secondary)
                                            }
                                            .padding(12)
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                            .background(Color.primary.opacity(0.03), in: RoundedRectangle(cornerRadius: 12))
                                        }
                                    }
                                }
                            }

                            // Confusable: Alert Style
                            if !card.confusable.isEmpty {
                                VStack(alignment: .leading, spacing: 14) {
                                    Label("易混辨析", systemImage: "questionmark.circle.fill")
                                        .font(.system(.subheadline, design: .rounded).weight(.bold))
                                    
                                    ForEach(card.confusable) { item in
                                        HStack(alignment: .top, spacing: 12) {
                                            Image(systemName: "exclamationmark.circle.fill")
                                                .font(.footnote)
                                                .foregroundStyle(.orange)
                                                .padding(.top, 2)
                                            
                                            VStack(alignment: .leading, spacing: 4) {
                                                Text(item.word)
                                                    .font(.system(.footnote, design: .rounded).weight(.bold))
                                                Text(item.diff)
                                                    .font(.system(.caption, design: .rounded))
                                                    .foregroundStyle(.secondary)
                                                    .lineSpacing(2)
                                            }
                                        }
                                        .padding(16)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .background(Color.orange.opacity(0.05), in: RoundedRectangle(cornerRadius: 16))
                                    }
                                }
                            }
                            
                            // Footer: Minimalist
                            HStack {
                                Label(state.fromCache ? "已缓存" : "AI 实时生成", systemImage: state.fromCache ? "clock.fill" : "sparkles")
                                Spacer()
                                Text("\(card.provider) · \(card.model)")
                            }
                            .font(.system(size: 10, weight: .medium, design: .monospaced))
                            .foregroundStyle(.tertiary)
                            .padding(.top, 12)
                        }
                    }

                    if let errorMessage = state.errorMessage, !errorMessage.isEmpty {
                        VStack(spacing: 24) {
                            Spacer()
                            Image(systemName: "wifi.exclamationmark")
                                .font(.system(size: 48, weight: .light))
                                .foregroundStyle(.orange)
                            
                            VStack(spacing: 8) {
                                Text("解析失败")
                                    .font(.system(.headline, design: .rounded))
                                
                                Text(errorMessage)
                                    .font(.system(.caption, design: .monospaced))
                                    .multilineTextAlignment(.center)
                                    .foregroundStyle(.secondary)
                                    .padding(.horizontal, 32)
                            }
                            
                            Button(action: onRetry) {
                                Text("重试")
                                    .font(.system(.subheadline, design: .rounded).weight(.bold))
                                    .padding(.horizontal, 32)
                                    .padding(.vertical, 10)
                            }
                            .buttonStyle(.bordered)
                            .tint(.orange)
                            
                            Spacer()
                        }
                        .frame(maxWidth: .infinity, minHeight: 300)
                        .padding(.bottom, 40)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 20)
                .padding(.bottom, 120)
            }
            .background(Color(.systemBackground))
            .navigationTitle("词境解析")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: onCopy) {
                        Image(systemName: "doc.on.doc")
                            .font(.system(size: 14, weight: .medium))
                    }
                    .disabled(state.card == nil)
                }
            }
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 0) {
                    Divider()
                    HStack(spacing: 16) {
                        Button(action: onOpenSystemDictionary) {
                            Label("系统词典", systemImage: "book.fill")
                                .font(.system(.subheadline, design: .rounded).weight(.bold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 16)
                        }
                        .buttonStyle(.bordered)
                        .tint(.primary)
                        .clipShape(RoundedRectangle(cornerRadius: 16))

                        Button(action: onRetry) {
                            Label("重新解析", systemImage: "arrow.clockwise.heart.fill")
                                .font(.system(.subheadline, design: .rounded).weight(.bold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 16)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.orange)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 16)
                    .padding(.bottom, 32)
                    .background(.ultraThinMaterial)
                }
            }
        }
    }
}

// Helper for Flow Layout (Simple version for Collocations)
struct FlowLayout: View {
    let spacing: CGFloat
    let children: [AnyView]
    
    init<Data: Collection, Content: View>(
        _ data: Data,
        spacing: CGFloat = 8,
        @ViewBuilder content: @escaping (Data.Element) -> Content
    ) where Data.Element: Identifiable {
        self.spacing = spacing
        self.children = data.map { AnyView(content($0)) }
    }
    
    init(spacing: CGFloat = 8, @ViewBuilder content: () -> some View) {
        self.spacing = spacing
        // This is a simplified version, in real app would use a proper FlowLayout
        self.children = [] 
    }

    var body: some View {
        // Fallback to VStack if proper FlowLayout is not available
        VStack(alignment: .leading, spacing: spacing) {
            ForEach(0..<children.count, id: \.self) { index in
                children[index]
            }
        }
    }
}

extension View {
    func border(width: CGFloat, edges: [Edge], color: Color) -> some View {
        overlay(
            EdgeBorder(width: width, edges: edges)
                .foregroundColor(color)
        )
    }
}

struct EdgeBorder: Shape {
    var width: CGFloat
    var edges: [Edge]

    func path(in rect: CGRect) -> Path {
        var path = Path()
        for edge in edges {
            var x: CGFloat {
                switch edge {
                case .top, .bottom, .leading: return rect.minX
                case .trailing: return rect.maxX - width
                }
            }

            var y: CGFloat {
                switch edge {
                case .top, .leading, .trailing: return rect.minY
                case .bottom: return rect.maxY - width
                }
            }

            var w: CGFloat {
                switch edge {
                case .top, .bottom: return rect.width
                case .leading, .trailing: return width
                }
            }

            var h: CGFloat {
                switch edge {
                case .top, .bottom: return width
                case .leading, .trailing: return rect.height
                }
            }
            path.addRect(CGRect(x: x, y: y, width: w, height: h))
        }
        return path
    }
}

private struct MarkdownTextBlock: View {
    let markdown: String
    let highlightedTerms: [String]
    let onLinkTap: (URL) -> Void
    let onVocabularyTap: (String) -> Void

    init(
        markdown: String,
        highlightedTerms: [String] = [],
        onLinkTap: @escaping (URL) -> Void = { _ in },
        onVocabularyTap: @escaping (String) -> Void = { _ in }
    ) {
        self.markdown = markdown
        self.highlightedTerms = highlightedTerms
        self.onLinkTap = onLinkTap
        self.onVocabularyTap = onVocabularyTap
    }

    private var renderedMarkdown: String {
        MarkdownVocabularyLinker.injectVocabularyLinks(in: markdown, terms: highlightedTerms)
    }

    var body: some View {
        Markdown(renderedMarkdown)
            .markdownTheme(.gitHub)
            .markdownTextStyle {
                FontSize(.em(0.95))
            }
            .markdownBlockStyle(\.heading1) { configuration in
                configuration.label
                    .relativeLineSpacing(.em(0.12))
                    .markdownMargin(top: 14, bottom: 10)
                    .markdownTextStyle {
                        FontWeight(.semibold)
                        FontSize(.em(1.45))
                    }
            }
            .markdownBlockStyle(\.heading2) { configuration in
                configuration.label
                    .relativeLineSpacing(.em(0.12))
                    .markdownMargin(top: 12, bottom: 8)
                    .markdownTextStyle {
                        FontWeight(.semibold)
                        FontSize(.em(1.3))
                    }
            }
            .markdownBlockStyle(\.heading3) { configuration in
                configuration.label
                    .relativeLineSpacing(.em(0.12))
                    .markdownMargin(top: 10, bottom: 8)
                    .markdownTextStyle {
                        FontWeight(.semibold)
                        FontSize(.em(1.16))
                    }
            }
            .markdownBlockStyle(\.heading4) { configuration in
                configuration.label
                    .relativeLineSpacing(.em(0.1))
                    .markdownMargin(top: 8, bottom: 6)
                    .markdownTextStyle {
                        FontWeight(.semibold)
                    }
            }
            .markdownBlockStyle(\.heading5) { configuration in
                configuration.label
                    .relativeLineSpacing(.em(0.1))
                    .markdownMargin(top: 8, bottom: 6)
                    .markdownTextStyle {
                        FontWeight(.semibold)
                        FontSize(.em(0.9))
                    }
            }
            .markdownBlockStyle(\.heading6) { configuration in
                configuration.label
                    .relativeLineSpacing(.em(0.1))
                    .markdownMargin(top: 8, bottom: 6)
                    .markdownTextStyle {
                        FontWeight(.semibold)
                        FontSize(.em(0.85))
                        ForegroundColor(.secondary)
                    }
            }
            .markdownBlockStyle(\.blockquote) { configuration in
                HStack(spacing: 0) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color.orange.opacity(0.75))
                        .frame(width: 3)
                    configuration.label
                        .markdownTextStyle {
                            ForegroundColor(.secondary)
                        }
                        .padding(.leading, 12)
                        .padding(.vertical, 10)
                }
                .padding(.trailing, 12)
                .background(
                    Color.orange.opacity(0.08),
                    in: RoundedRectangle(cornerRadius: 12, style: .continuous)
                )
                .markdownMargin(top: 2, bottom: 12)
            }
            .markdownBlockStyle(\.codeBlock) { configuration in
                VStack(spacing: 0) {
                    HStack {
                        Text(codeLanguageLabel(configuration.language))
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.primary.opacity(0.04))

                    ScrollView(.horizontal, showsIndicators: false) {
                        configuration.label
                            .fixedSize(horizontal: false, vertical: true)
                            .relativeLineSpacing(.em(0.2))
                            .markdownTextStyle {
                                FontFamilyVariant(.monospaced)
                                FontSize(.em(0.84))
                            }
                            .padding(12)
                    }
                }
                .background(Color(.tertiarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(Color.primary.opacity(0.08), lineWidth: 1)
                )
                .markdownMargin(top: 0, bottom: 12)
            }
            .textSelection(.enabled)
            .environment(\.openURL, OpenURLAction { url in
                if let term = dictionaryTerm(from: url) {
                    onVocabularyTap(term)
                    return .handled
                }
                onLinkTap(url)
                return .handled
            })
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func codeLanguageLabel(_ rawLanguage: String?) -> String {
        guard let rawLanguage,
              !rawLanguage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else {
            return "CODE"
        }
        return rawLanguage.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    }

    private func dictionaryTerm(from url: URL) -> String? {
        guard url.scheme == "xauto-dict" else {
            return nil
        }
        let term = URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?
            .first(where: { $0.name == "term" })?
            .value?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if let term, !term.isEmpty {
            return term
        }
        return nil
    }
}

private enum MarkdownVocabularyLinker {
    private static let maskTokenPrefix = "@@XAUTO_MASK_"

    private static let protectedPatterns: [String] = [
        "(?s)```.*?```",
        "`[^`\\n]+`",
        "!\\[[^\\]]*\\]\\(([^\\)]*)\\)",
        "\\[[^\\]]+\\]\\([^\\)]*\\)",
        "<https?://[^>\\s]+>"
    ]

    static func injectVocabularyLinks(in markdown: String, terms: [String]) -> String {
        let normalizedTerms = normalizedUniqueTerms(terms)
        guard !normalizedTerms.isEmpty else {
            return markdown
        }

        let masked = maskProtectedSegments(in: markdown)
        var working = masked.text

        for term in normalizedTerms {
            working = replaceFirstOccurrence(of: term, in: working)
        }

        return restoreMasks(in: working, masks: masked.masks)
    }

    private static func normalizedUniqueTerms(_ terms: [String]) -> [String] {
        var output: [String] = []
        var seen = Set<String>()

        for term in terms {
            let trimmed = term.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else {
                continue
            }
            guard isEnglishLike(trimmed) else {
                continue
            }

            let normalized = trimmed.lowercased()
            guard !seen.contains(normalized) else {
                continue
            }
            seen.insert(normalized)
            output.append(trimmed)
        }

        return output
    }

    private static func maskProtectedSegments(in markdown: String) -> (text: String, masks: [String: String]) {
        var text = markdown
        var masks: [String: String] = [:]
        var nextIndex = 0

        for pattern in protectedPatterns {
            guard let regex = try? NSRegularExpression(pattern: pattern) else {
                continue
            }

            let nsText = text as NSString
            let fullRange = NSRange(location: 0, length: nsText.length)
            let matches = regex.matches(in: text, options: [], range: fullRange).reversed()

            for match in matches {
                let token = "\(maskTokenPrefix)\(nextIndex)@@"
                let protectedText = nsText.substring(with: match.range)
                let mutable = NSMutableString(string: text)
                mutable.replaceCharacters(in: match.range, with: token)
                text = mutable as String
                masks[token] = protectedText
                nextIndex += 1
            }
        }

        return (text, masks)
    }

    private static func restoreMasks(in text: String, masks: [String: String]) -> String {
        var output = text
        for (token, value) in masks {
            output = output.replacingOccurrences(of: token, with: value)
        }
        return output
    }

    private static func replaceFirstOccurrence(of term: String, in text: String) -> String {
        if isEnglishLike(term) {
            return replaceFirstEnglishOccurrence(of: term, in: text)
        }
        return replaceFirstPlainOccurrence(of: term, in: text)
    }

    private static func replaceFirstEnglishOccurrence(of term: String, in text: String) -> String {
        let escaped = NSRegularExpression.escapedPattern(for: term)
        let pattern = "(?i)(?<![A-Za-z0-9_])\(escaped)(?![A-Za-z0-9_])"
        guard let regex = try? NSRegularExpression(pattern: pattern) else {
            return text
        }

        let nsText = text as NSString
        let fullRange = NSRange(location: 0, length: nsText.length)
        guard let match = regex.firstMatch(in: text, options: [], range: fullRange) else {
            return text
        }

        let matchedWord = nsText.substring(with: match.range)
        let replacement = markdownLink(word: matchedWord, term: matchedWord)
        let mutable = NSMutableString(string: text)
        mutable.replaceCharacters(in: match.range, with: replacement)
        return mutable as String
    }

    private static func replaceFirstPlainOccurrence(of term: String, in text: String) -> String {
        let nsText = text as NSString
        let fullRange = NSRange(location: 0, length: nsText.length)
        let foundRange = nsText.range(of: term, options: [], range: fullRange)
        guard foundRange.location != NSNotFound, foundRange.length > 0 else {
            return text
        }

        let matchedWord = nsText.substring(with: foundRange)
        let replacement = markdownLink(word: matchedWord, term: matchedWord)
        let mutable = NSMutableString(string: text)
        mutable.replaceCharacters(in: foundRange, with: replacement)
        return mutable as String
    }

    private static func markdownLink(word: String, term: String) -> String {
        let trimmed = term.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return word
        }
        var components = URLComponents()
        components.scheme = "xauto-dict"
        components.host = "lookup"
        components.queryItems = [URLQueryItem(name: "term", value: trimmed)]
        guard let urlString = components.url?.absoluteString else {
            return word
        }
        return "[\(word)](\(urlString))"
    }

    private static func isEnglishLike(_ term: String) -> Bool {
        term.range(of: "[A-Za-z]", options: .regularExpression) != nil
    }
}

private struct FlowWrapLayout: Layout {
    var spacing: CGFloat = 8
    var rowSpacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let fallbackWidth = max(240, UIScreen.main.bounds.width - 32)
        let maxWidth = max(1, proposal.width ?? fallbackWidth)
        var currentX: CGFloat = 0
        var currentRowHeight: CGFloat = 0
        var totalHeight: CGFloat = 0
        var widestRow: CGFloat = 0

        for subview in subviews {
            var size = subview.sizeThatFits(.unspecified)
            size.width = min(size.width, maxWidth)

            if currentX > 0, currentX + size.width > maxWidth {
                widestRow = max(widestRow, max(0, currentX - spacing))
                totalHeight += currentRowHeight + rowSpacing
                currentX = 0
                currentRowHeight = 0
            }

            currentX += size.width + spacing
            currentRowHeight = max(currentRowHeight, size.height)
        }

        if currentRowHeight > 0 {
            totalHeight += currentRowHeight
            widestRow = max(widestRow, max(0, currentX - spacing))
        }

        let finalWidth = proposal.width ?? widestRow
        return CGSize(width: finalWidth, height: totalHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let maxWidth = max(1, bounds.width)
        var cursorX = bounds.minX
        var cursorY = bounds.minY
        var currentRowHeight: CGFloat = 0

        for subview in subviews {
            var size = subview.sizeThatFits(.unspecified)
            size.width = min(size.width, maxWidth)

            if cursorX > bounds.minX, cursorX + size.width > bounds.minX + maxWidth {
                cursorX = bounds.minX
                cursorY += currentRowHeight + rowSpacing
                currentRowHeight = 0
            }

            subview.place(
                at: CGPoint(x: cursorX, y: cursorY),
                proposal: ProposedViewSize(width: size.width, height: size.height)
            )

            cursorX += size.width + spacing
            currentRowHeight = max(currentRowHeight, size.height)
        }
    }
}

private struct ErrorBanner: View {
    let message: String

    var body: some View {
        HStack(alignment: .top, spacing: DS.sm) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.red)
            Text(message)
                .font(.footnote)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(DS.lg)
        .background(
            Color.red.opacity(0.08),
            in: RoundedRectangle(cornerRadius: DS.cardRadius, style: .continuous)
        )
    }
}

private struct EmptyStateCard: View {
    var icon: String = "tray"
    let title: String
    let detail: String

    var body: some View {
        VStack(spacing: DS.md) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(.tertiary)
            Text(title)
                .font(.subheadline.weight(.semibold))
            Text(detail)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, DS.xxl)
        .padding(.horizontal, DS.lg)
        .background(
            Color(.secondarySystemGroupedBackground),
            in: RoundedRectangle(cornerRadius: DS.cardRadius, style: .continuous)
        )
    }
}

private struct RuleNotesCard: View {
    let title: String
    let notes: [String]

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: DS.sm) {
                Label(title, systemImage: "info.circle.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.orange)
                ForEach(notes, id: \.self) { note in
                    HStack(alignment: .top, spacing: DS.sm) {
                        Circle()
                            .fill(Color.orange.opacity(0.9))
                            .frame(width: 4, height: 4)
                            .padding(.top, 7)
                        Text(note)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
    }
}

// MARK: - Utilities

private func claimLabelTitle(_ raw: String) -> String {
    ClaimLabel(rawValue: raw)?.title ?? raw
}

private func barRatio(for count: Int, total: Int) -> CGFloat {
    CGFloat(count) / CGFloat(max(1, total))
}

private func relativeDate(_ isoString: String) -> String {
    guard !isoString.isEmpty else { return "" }
    let parser = ISO8601DateFormatter()
    guard let date = parser.date(from: isoString) else { return isoString }
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

private func googleLoginURL() -> URL? {
    var components = URLComponents(string: "https://accounts.google.com/ServiceLogin")
    components?.queryItems = [
        URLQueryItem(name: "continue", value: "https://www.google.com/?hl=zh-CN"),
        URLQueryItem(name: "hl", value: "zh-CN")
    ]
    return components?.url
}
