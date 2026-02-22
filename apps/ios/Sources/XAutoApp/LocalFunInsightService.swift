import Foundation

struct LocalFunInsight {
    let title: String
    let highlights: [String]
    let suggestions: [String]
}

enum LocalFunInsightService {
    static func generate(from text: String) -> LocalFunInsight {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return LocalFunInsight(
                title: "内容较短，先观察",
                highlights: ["当前条目文本为空或不可用。"],
                suggestions: ["稍后重新同步该条目。"]
            )
        }

        let hashtags = extractMatches(in: trimmed, pattern: "#[A-Za-z0-9_\\u4e00-\\u9fa5]+")
        let mentions = extractMatches(in: trimmed, pattern: "@[A-Za-z0-9_]+")
        let links = extractMatches(in: trimmed, pattern: "https?://\\S+")

        let sentence = trimmed
            .replacingOccurrences(of: "\n", with: " ")
            .split(whereSeparator: { [".", "。", "!", "！", "?", "？"].contains($0) })
            .first
            .map(String.init)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? String(trimmed.prefix(80))

        var highlights: [String] = []
        highlights.append("核心句：\(sentence)")
        if !hashtags.isEmpty {
            highlights.append("标签集中在：\(hashtags.prefix(3).joined(separator: "、"))")
        }
        if !mentions.isEmpty {
            highlights.append("涉及账号：\(mentions.prefix(3).joined(separator: "、"))")
        }
        if !links.isEmpty {
            highlights.append("包含 \(links.count) 个外部链接，可进一步点开核验。")
        }
        if highlights.count == 1 {
            highlights.append("这条更像观点表达，可结合历史摘要再判断优先级。")
        }

        var suggestions: [String] = []
        if !links.isEmpty {
            suggestions.append("优先打开首个链接确认原始上下文。")
        }
        if !hashtags.isEmpty {
            suggestions.append("把高频标签加入关注列表，便于后续筛选。")
        }
        suggestions.append("如与当前主题相关，加入明日行动列表。")

        return LocalFunInsight(
            title: "端侧趣味洞察",
            highlights: Array(highlights.prefix(3)),
            suggestions: Array(suggestions.prefix(3))
        )
    }

    private static func extractMatches(in text: String, pattern: String) -> [String] {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: []) else {
            return []
        }

        let range = NSRange(text.startIndex..., in: text)
        let matches = regex.matches(in: text, options: [], range: range)

        return matches.compactMap { match in
            guard let range = Range(match.range, in: text) else {
                return nil
            }
            return String(text[range])
        }
    }
}
