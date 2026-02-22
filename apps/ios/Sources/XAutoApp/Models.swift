import Foundation

struct DigestItem: Codable, Identifiable {
    let tweetId: String
    let reason: String
    let nextStep: String
    var id: String { tweetId }
}

struct DigestResponse: Codable {
    let _id: String?
    let period: String
    let periodKey: String
    let topThemes: [String]
    let topItems: [DigestItem]
    let risks: [String]
    let tomorrowActions: [String]
    let generatedAt: String
}

struct SummaryResponse: Codable {
    let oneLinerZh: String
    let oneLinerEn: String
    let bulletsZh: [String]
    let bulletsEn: [String]
    let tagsZh: [String]
    let tagsEn: [String]
    let actions: [String]
    let qualityScore: Double
}

struct BookmarkItemResponse: Codable, Identifiable {
    let _id: String?
    let tweetId: String
    let authorName: String
    let text: String
    let url: String
    let createdAtX: String
    let summary: SummaryResponse?

    var id: String { tweetId }
}

struct ItemListResponse: Codable {
    let items: [BookmarkItemResponse]
    let nextCursor: String?
}
