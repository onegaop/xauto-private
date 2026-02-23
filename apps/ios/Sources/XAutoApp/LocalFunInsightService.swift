import Foundation

enum LocalFunInsightMode: String, CaseIterable, Identifiable {
    case recap
    case challenge
    case actionPlan

    var id: String { rawValue }

    var title: String {
        switch self {
        case .recap:
            return "快速复述"
        case .challenge:
            return "反方挑战"
        case .actionPlan:
            return "行动计划"
        }
    }

    var subtitle: String {
        switch self {
        case .recap:
            return "把这条内容压缩成可转述结论。"
        case .challenge:
            return "从反方视角找漏洞与证据缺口。"
        case .actionPlan:
            return "转成 24 小时可执行步骤。"
        }
    }

    var buttonTitle: String {
        switch self {
        case .recap:
            return "生成复述稿"
        case .challenge:
            return "生成反方挑战"
        case .actionPlan:
            return "生成行动计划"
        }
    }
}

struct LocalFunInsight {
    let title: String
    let highlights: [String]
    let suggestions: [String]
    let source: String
}

enum LocalFunInsightService {
    static func generate(from item: BookmarkItemResponse, mode: LocalFunInsightMode) async -> LocalFunInsight {
        let trimmed = item.text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return LocalFunInsight(
                title: "内容为空",
                highlights: ["当前条目正文不可用，无法生成端侧增强结果。"],
                suggestions: ["先回到 Today 页面触发同步，再重试。"],
                source: "Rule-based fallback"
            )
        }

        #if canImport(FoundationModels)
        if #available(iOS 26.0, *),
           let modelInsight = await FoundationModelsLocalInsightGenerator.generate(from: item, mode: mode) {
            return modelInsight
        }
        #endif

        return ruleBasedFallback(from: item, mode: mode)
    }

    private static func ruleBasedFallback(from item: BookmarkItemResponse, mode: LocalFunInsightMode) -> LocalFunInsight {
        let normalized = item.text.replacingOccurrences(of: "\n", with: " ").trimmingCharacters(in: .whitespacesAndNewlines)
        let summary = item.summary
        let core = summary?.coreViewpoint?.trimmingCharacters(in: .whitespacesAndNewlines)
        let problem = summary?.underlyingProblem?.trimmingCharacters(in: .whitespacesAndNewlines)
        let firstSentence = firstReadableSentence(in: normalized)
        let mainLine = nonEmpty(core) ?? nonEmpty(summary?.oneLinerZh) ?? firstSentence
        let firstAction = summary?.actions.first ?? "补齐背景与证据后再决策"
        let firstKeyword = summary?.researchKeywordsEn.first ?? "x-post-analysis"
        let firstClaim = summary?.claimTypes.first?.statement ?? mainLine

        switch mode {
        case .recap:
            return LocalFunInsight(
                title: "30秒复述",
                highlights: [
                    "结论：\(mainLine)",
                    "背景：\(nonEmpty(problem) ?? "核心前提未完全展开，需结合上下文。")",
                    "转述句：这条内容的重点是「\(mainLine)」。"
                ],
                suggestions: [
                    "先把结论发给同事，再补一条证据链接。",
                    "若要深入，优先搜索关键词：\(firstKeyword)。"
                ],
                source: "Rule-based fallback"
            )
        case .challenge:
            return LocalFunInsight(
                title: "反方挑战",
                highlights: [
                    "可被质疑点：\(firstClaim)",
                    "反方问题：如果样本偏差或时效过期，结论是否仍成立？",
                    "证据缺口：缺少可复现数据或明确对照组。"
                ],
                suggestions: [
                    "补一个可量化指标，再判断是否采纳。",
                    "加入至少一个反例来源，避免单一叙事。"
                ],
                source: "Rule-based fallback"
            )
        case .actionPlan:
            return LocalFunInsight(
                title: "24h行动计划",
                highlights: [
                    "第 1 步（现在）：确认原文上下文与链接可信度。",
                    "第 2 步（2h 内）：抽取 1 个可执行动作：\(firstAction)。",
                    "第 3 步（今日结束前）：记录结果并决定保留/丢弃该策略。"
                ],
                suggestions: [
                    "把执行结果写回你的工作清单，明天复盘。",
                    "若结果无增益，直接归档，减少信息噪音。"
                ],
                source: "Rule-based fallback"
            )
        }
    }

    private static func firstReadableSentence(in text: String) -> String {
        let candidates = text
            .split(whereSeparator: { [".", "。", "!", "！", "?", "？"].contains($0) })
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        if let first = candidates.first {
            return String(first.prefix(90))
        }
        return String(text.prefix(90))
    }

    private static func nonEmpty(_ value: String?) -> String? {
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
            return nil
        }
        return trimmed
    }
}

#if canImport(FoundationModels)
import FoundationModels

@available(iOS 26.0, *)
private enum FoundationModelsLocalInsightGenerator {
    static func generate(from item: BookmarkItemResponse, mode: LocalFunInsightMode) async -> LocalFunInsight? {
        do {
            let session = LanguageModelSession(
                instructions: """
                You are an on-device assistant for a personal X bookmark app.
                Return exactly 6 lines in Chinese:
                line1 short title (<=12 chars),
                line2-4 concise highlights,
                line5-6 actionable suggestions.
                No markdown, no numbering, no extra text.
                """
            )

            let summary = item.summary
            let prompt = """
            Mode: \(mode.title)
            Goal: \(mode.subtitle)
            PostText: \(item.text)
            CoreViewpoint: \(summary?.coreViewpoint ?? "")
            UnderlyingProblem: \(summary?.underlyingProblem ?? "")
            Actions: \((summary?.actions ?? []).joined(separator: " | "))
            Keywords: \((summary?.researchKeywordsEn ?? []).joined(separator: " | "))
            """

            let response = try await session.respond(to: prompt)
            let text = response.content.trimmingCharacters(in: .whitespacesAndNewlines)
            let lines = text
                .split(separator: "\n")
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }

            guard lines.count >= 4 else {
                return nil
            }

            let title = String(lines[0].prefix(18))
            let highlights = Array(lines.dropFirst().prefix(3))
            let suggestions = lines.count > 4 ? Array(lines.dropFirst(4).prefix(2)) : []

            return LocalFunInsight(
                title: title.isEmpty ? mode.title : title,
                highlights: highlights.isEmpty ? ["未能生成足够内容，请重试。"] : highlights,
                suggestions: suggestions,
                source: "Foundation Models"
            )
        } catch {
            return nil
        }
    }
}
#endif
