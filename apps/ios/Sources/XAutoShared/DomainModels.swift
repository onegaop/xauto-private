import Foundation

struct DigestItem: Codable, Identifiable, Hashable {
    let tweetId: String
    let reason: String
    let nextStep: String

    var id: String { tweetId }
}

struct DigestResponse: Codable {
    let id: String?
    let period: String
    let periodKey: String
    let topThemes: [String]
    let topItems: [DigestItem]
    let risks: [String]
    let tomorrowActions: [String]
    let generatedAt: String
    let updatedAt: String?
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case period
        case periodKey
        case topThemes
        case topItems
        case risks
        case tomorrowActions
        case generatedAt
        case updatedAt
        case createdAt
    }

    init(
        id: String?,
        period: String,
        periodKey: String,
        topThemes: [String],
        topItems: [DigestItem],
        risks: [String],
        tomorrowActions: [String],
        generatedAt: String,
        updatedAt: String?,
        createdAt: String?
    ) {
        self.id = id
        self.period = period
        self.periodKey = periodKey
        self.topThemes = topThemes
        self.topItems = topItems
        self.risks = risks
        self.tomorrowActions = tomorrowActions
        self.generatedAt = generatedAt
        self.updatedAt = updatedAt
        self.createdAt = createdAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try container.decodeIfPresent(String.self, forKey: .id)
        self.period = try container.decodeIfPresent(String.self, forKey: .period) ?? ""
        self.periodKey = try container.decodeIfPresent(String.self, forKey: .periodKey) ?? ""
        self.topThemes = try container.decodeIfPresent([String].self, forKey: .topThemes) ?? []
        self.topItems = try container.decodeIfPresent([DigestItem].self, forKey: .topItems) ?? []
        self.risks = try container.decodeIfPresent([String].self, forKey: .risks) ?? []
        self.tomorrowActions = try container.decodeIfPresent([String].self, forKey: .tomorrowActions) ?? []
        self.generatedAt = try container.decodeIfPresent(String.self, forKey: .generatedAt) ?? ""
        self.updatedAt = try container.decodeIfPresent(String.self, forKey: .updatedAt)
        self.createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt)
    }
}

struct ClaimType: Codable, Hashable, Identifiable {
    let statement: String
    let label: String

    var id: String { "\(label):\(statement)" }
}

struct KeyTechnology: Codable, Hashable, Identifiable {
    let concept: String
    let solves: String

    var id: String { "\(concept):\(solves)" }
}

struct SummaryResponse: Codable {
    let oneLinerZh: String
    let oneLinerEn: String
    let bulletsZh: [String]
    let bulletsEn: [String]
    let tagsZh: [String]
    let tagsEn: [String]
    let actions: [String]
    let renderMarkdown: String?
    let coreViewpoint: String?
    let underlyingProblem: String?
    let keyTechnologies: [KeyTechnology]
    let claimTypes: [ClaimType]
    let researchKeywordsEn: [String]
    let qualityScore: Double

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.oneLinerZh = try container.decodeIfPresent(String.self, forKey: .oneLinerZh) ?? ""
        self.oneLinerEn = try container.decodeIfPresent(String.self, forKey: .oneLinerEn) ?? ""
        self.bulletsZh = try container.decodeIfPresent([String].self, forKey: .bulletsZh) ?? []
        self.bulletsEn = try container.decodeIfPresent([String].self, forKey: .bulletsEn) ?? []
        self.tagsZh = try container.decodeIfPresent([String].self, forKey: .tagsZh) ?? []
        self.tagsEn = try container.decodeIfPresent([String].self, forKey: .tagsEn) ?? []
        self.actions = try container.decodeIfPresent([String].self, forKey: .actions) ?? []
        self.renderMarkdown = try container.decodeIfPresent(String.self, forKey: .renderMarkdown)
        self.coreViewpoint = try container.decodeIfPresent(String.self, forKey: .coreViewpoint)
        self.underlyingProblem = try container.decodeIfPresent(String.self, forKey: .underlyingProblem)
        self.keyTechnologies = try container.decodeIfPresent([KeyTechnology].self, forKey: .keyTechnologies) ?? []
        self.claimTypes = try container.decodeIfPresent([ClaimType].self, forKey: .claimTypes) ?? []
        self.researchKeywordsEn = try container.decodeIfPresent([String].self, forKey: .researchKeywordsEn) ?? []
        self.qualityScore = try container.decodeIfPresent(Double.self, forKey: .qualityScore) ?? 0
    }
}

struct BookmarkItemResponse: Codable, Identifiable {
    let mongoId: String?
    let tweetId: String
    let authorName: String
    let authorAvatarUrl: String?
    let text: String
    let url: String
    let createdAtX: String
    let syncedAt: String?
    let summary: SummaryResponse?

    enum CodingKeys: String, CodingKey {
        case mongoId = "_id"
        case tweetId
        case authorName
        case authorAvatarUrl
        case text
        case url
        case createdAtX
        case syncedAt
        case summary
    }

    var id: String { tweetId }
}

struct ItemListResponse: Codable {
    let items: [BookmarkItemResponse]
    let nextCursor: String?
}

enum DigestPeriod: String, Codable, CaseIterable, Identifiable {
    case daily
    case weekly

    var id: String { rawValue }
    var title: String { self == .daily ? "日摘要" : "周摘要" }
}

enum StatsRange: String, Codable, CaseIterable, Identifiable {
    case sevenDays = "7d"
    case thirtyDays = "30d"
    case ninetyDays = "90d"

    var id: String { rawValue }
    var title: String {
        switch self {
        case .sevenDays:
            return "7天"
        case .thirtyDays:
            return "30天"
        case .ninetyDays:
            return "90天"
        }
    }
}

enum ClaimLabel: String, Codable, CaseIterable, Identifiable {
    case fact
    case opinion
    case speculation

    var id: String { rawValue }
    var title: String {
        switch self {
        case .fact:
            return "事实"
        case .opinion:
            return "观点"
        case .speculation:
            return "推测"
        }
    }
}

struct DigestHistoryResponse: Codable {
    let items: [DigestResponse]
    let nextCursor: String?
}

struct TagCount: Codable, Identifiable, Hashable {
    let tag: String
    let count: Int

    var id: String { tag }
}

struct ClaimLabelCount: Codable, Identifiable, Hashable {
    let label: String
    let count: Int

    var id: String { "\(label)-\(count)" }
}

struct KeywordCount: Codable, Identifiable, Hashable {
    let keyword: String
    let count: Int

    var id: String { keyword }
}

struct SummaryStatsResponse: Codable {
    let range: String
    let from: String
    let to: String
    let totalSummaries: Int
    let avgQualityScore: Double
    let actionItemCount: Int
    let topTags: [TagCount]
    let claimLabelDistribution: [ClaimLabelCount]
    let topResearchKeywords: [KeywordCount]

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.range = try container.decodeIfPresent(String.self, forKey: .range) ?? "7d"
        self.from = try container.decodeIfPresent(String.self, forKey: .from) ?? ""
        self.to = try container.decodeIfPresent(String.self, forKey: .to) ?? ""
        self.totalSummaries = try container.decodeIfPresent(Int.self, forKey: .totalSummaries) ?? 0
        self.avgQualityScore = try container.decodeIfPresent(Double.self, forKey: .avgQualityScore) ?? 0
        self.actionItemCount = try container.decodeIfPresent(Int.self, forKey: .actionItemCount) ?? 0
        self.topTags = try container.decodeIfPresent([TagCount].self, forKey: .topTags) ?? []
        self.claimLabelDistribution = try container.decodeIfPresent([ClaimLabelCount].self, forKey: .claimLabelDistribution) ?? []
        self.topResearchKeywords = try container.decodeIfPresent([KeywordCount].self, forKey: .topResearchKeywords) ?? []
    }
}

struct WidgetDigestSnapshot: Codable {
    let topTheme: String
    let action: String
    let periodKey: String
    let generatedAt: String

    static let placeholder = WidgetDigestSnapshot(
        topTheme: "No digest yet",
        action: "Open app and run sync",
        periodKey: "",
        generatedAt: ""
    )
}

extension DigestResponse {
    var widgetSnapshot: WidgetDigestSnapshot {
        WidgetDigestSnapshot(
            topTheme: topThemes.first ?? "No theme",
            action: tomorrowActions.first ?? (topItems.first?.nextStep ?? "Open app for details"),
            periodKey: periodKey,
            generatedAt: generatedAt
        )
    }
}
