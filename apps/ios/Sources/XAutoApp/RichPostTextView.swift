import SwiftUI
import UIKit

struct RichPostTextView: UIViewRepresentable {
    let text: String
    let highlightedTerms: [String]
    let textStyle: UIFont.TextStyle
    let fontWeight: UIFont.Weight
    let textColor: UIColor
    let onLinkTap: (URL) -> Void
    let onVocabularyTap: ((String) -> Void)?

    init(
        text: String,
        highlightedTerms: [String] = [],
        textStyle: UIFont.TextStyle = .body,
        fontWeight: UIFont.Weight = .regular,
        textColor: UIColor = .label,
        onLinkTap: @escaping (URL) -> Void,
        onVocabularyTap: ((String) -> Void)? = nil
    ) {
        self.text = text
        self.highlightedTerms = highlightedTerms
        self.textStyle = textStyle
        self.fontWeight = fontWeight
        self.textColor = textColor
        self.onLinkTap = onLinkTap
        self.onVocabularyTap = onVocabularyTap
    }

    func makeUIView(context: Context) -> UITextView {
        let textView = UITextView()
        textView.backgroundColor = .clear
        textView.isEditable = false
        textView.isSelectable = true
        textView.isScrollEnabled = false
        textView.adjustsFontForContentSizeCategory = true
        textView.textContainerInset = .zero
        textView.textContainer.lineFragmentPadding = 0
        textView.textContainer.widthTracksTextView = true
        textView.textContainer.maximumNumberOfLines = 0
        textView.textContainer.lineBreakMode = .byCharWrapping
        textView.setContentHuggingPriority(.defaultLow, for: .horizontal)
        textView.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        textView.delegate = context.coordinator
        textView.linkTextAttributes = [:]
        return textView
    }

    func updateUIView(_ uiView: UITextView, context: Context) {
        context.coordinator.onLinkTap = onLinkTap
        context.coordinator.onVocabularyTap = onVocabularyTap
        uiView.attributedText = makeAttributedText(from: text)
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onLinkTap: onLinkTap, onVocabularyTap: onVocabularyTap)
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UITextView, context: Context) -> CGSize? {
        let fallbackWidth = uiView.bounds.width > 0 ? uiView.bounds.width : 320
        let width = max(0, proposal.width ?? fallbackWidth)
        guard width > 0 else {
            return nil
        }

        let target = CGSize(width: width, height: CGFloat.greatestFiniteMagnitude)
        let size = uiView.sizeThatFits(target)
        return CGSize(width: width, height: ceil(size.height))
    }

    private func makeAttributedText(from rawText: String) -> NSAttributedString {
        let attributed = NSMutableAttributedString(string: rawText)
        let nsText = rawText as NSString
        let fullRange = NSRange(location: 0, length: nsText.length)
        let font = preferredFont(for: textStyle, weight: fontWeight)

        attributed.addAttributes(
            [
                .font: font,
                .foregroundColor: textColor
            ],
            range: fullRange
        )

        var occupiedRanges: [NSRange] = []
        applyURLLinks(to: attributed, rawText: rawText, occupiedRanges: &occupiedRanges)
        applyMentionLinks(to: attributed, rawText: rawText, occupiedRanges: &occupiedRanges)
        applyHashtagLinks(to: attributed, rawText: rawText, occupiedRanges: &occupiedRanges)
        applyVocabularyHighlights(to: attributed, rawText: rawText, occupiedRanges: &occupiedRanges)

        return attributed
    }

    private func preferredFont(for style: UIFont.TextStyle, weight: UIFont.Weight) -> UIFont {
        let descriptor = UIFontDescriptor.preferredFontDescriptor(withTextStyle: style)
        return UIFont.systemFont(ofSize: descriptor.pointSize, weight: weight)
    }

    private func applyURLLinks(
        to attributed: NSMutableAttributedString,
        rawText: String,
        occupiedRanges: inout [NSRange]
    ) {
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else {
            return
        }

        let fullRange = NSRange(location: 0, length: (rawText as NSString).length)
        detector.enumerateMatches(in: rawText, options: [], range: fullRange) { match, _, _ in
            guard let match, let url = match.url else {
                return
            }

            applyLinkAttributes(
                to: attributed,
                range: match.range,
                url: url,
                color: .systemBlue,
                backgroundColor: nil
            )
            occupiedRanges.append(match.range)
        }
    }

    private func applyMentionLinks(
        to attributed: NSMutableAttributedString,
        rawText: String,
        occupiedRanges: inout [NSRange]
    ) {
        guard let regex = try? NSRegularExpression(pattern: "(?<![A-Za-z0-9_])@[A-Za-z0-9_]{1,15}") else {
            return
        }

        let nsText = rawText as NSString
        let fullRange = NSRange(location: 0, length: nsText.length)
        let matches = regex.matches(in: rawText, range: fullRange)

        for match in matches where !overlaps(match.range, with: occupiedRanges) {
            let handle = nsText.substring(with: match.range).replacingOccurrences(of: "@", with: "")
            guard let url = URL(string: "https://x.com/\(handle)") else {
                continue
            }

            applyLinkAttributes(
                to: attributed,
                range: match.range,
                url: url,
                color: .systemBlue,
                backgroundColor: nil
            )
            occupiedRanges.append(match.range)
        }
    }

    private func applyHashtagLinks(
        to attributed: NSMutableAttributedString,
        rawText: String,
        occupiedRanges: inout [NSRange]
    ) {
        guard let regex = try? NSRegularExpression(pattern: "(?<![A-Za-z0-9_])#[A-Za-z0-9_]{1,64}") else {
            return
        }

        let nsText = rawText as NSString
        let fullRange = NSRange(location: 0, length: nsText.length)
        let matches = regex.matches(in: rawText, range: fullRange)

        for match in matches where !overlaps(match.range, with: occupiedRanges) {
            let tag = nsText.substring(with: match.range).replacingOccurrences(of: "#", with: "")
            let encoded = tag.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? tag
            guard let url = URL(string: "https://x.com/hashtag/\(encoded)") else {
                continue
            }

            applyLinkAttributes(
                to: attributed,
                range: match.range,
                url: url,
                color: .systemBlue,
                backgroundColor: nil
            )
            occupiedRanges.append(match.range)
        }
    }

    private func applyVocabularyHighlights(
        to attributed: NSMutableAttributedString,
        rawText: String,
        occupiedRanges: inout [NSRange]
    ) {
        let orderedTerms = normalizedUniqueTerms(from: highlightedTerms)
        guard !orderedTerms.isEmpty else {
            return
        }

        for term in orderedTerms {
            guard let range = firstNonOverlappingRange(
                of: term,
                in: rawText,
                occupiedRanges: occupiedRanges
            ) else {
                continue
            }

            guard let dictionaryURL = dictionaryURL(for: term) else {
                continue
            }

            applyLinkAttributes(
                to: attributed,
                range: range,
                url: dictionaryURL,
                color: .systemOrange,
                backgroundColor: UIColor.systemOrange.withAlphaComponent(0.1)
            )
            attributed.addAttribute(.underlineStyle, value: NSUnderlineStyle.single.rawValue, range: range)
            attributed.addAttribute(.underlineColor, value: UIColor.systemOrange.withAlphaComponent(0.3), range: range)
            // Add a custom attribute to identify vocabulary links for special rendering if needed
            attributed.addAttribute(NSAttributedString.Key("XAutoVocabularyTerm"), value: term, range: range)
            occupiedRanges.append(range)
        }
    }

    private func normalizedUniqueTerms(from terms: [String]) -> [String] {
        var output: [String] = []
        var seen = Set<String>()

        for raw in terms {
            let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
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

    private func firstNonOverlappingRange(
        of term: String,
        in rawText: String,
        occupiedRanges: [NSRange]
    ) -> NSRange? {
        let nsText = rawText as NSString
        let candidateRanges = ranges(of: term, in: rawText)

        for range in candidateRanges where range.location != NSNotFound && range.length > 0 {
            guard NSMaxRange(range) <= nsText.length else {
                continue
            }
            if overlaps(range, with: occupiedRanges) {
                continue
            }
            return range
        }

        return nil
    }

    private func ranges(of term: String, in rawText: String) -> [NSRange] {
        let nsText = rawText as NSString
        let fullRange = NSRange(location: 0, length: nsText.length)

        if isEnglishLike(term) {
            let escaped = NSRegularExpression.escapedPattern(for: term)
            let pattern = "(?<![A-Za-z0-9_])\(escaped)(?![A-Za-z0-9_])"
            guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else {
                return []
            }
            return regex.matches(in: rawText, options: [], range: fullRange).map(\.range)
        }

        var output: [NSRange] = []
        var searchRange = fullRange
        while true {
            let found = nsText.range(of: term, options: [], range: searchRange)
            if found.location == NSNotFound || found.length == 0 {
                break
            }
            output.append(found)
            let nextLocation = NSMaxRange(found)
            if nextLocation >= nsText.length {
                break
            }
            searchRange = NSRange(location: nextLocation, length: nsText.length - nextLocation)
        }
        return output
    }

    private func isEnglishLike(_ term: String) -> Bool {
        term.range(of: "[A-Za-z]", options: .regularExpression) != nil
    }

    private func dictionaryURL(for term: String) -> URL? {
        var components = URLComponents()
        components.scheme = "xauto-dict"
        components.host = "lookup"
        components.queryItems = [URLQueryItem(name: "term", value: term)]
        return components.url
    }

    private func applyLinkAttributes(
        to attributed: NSMutableAttributedString,
        range: NSRange,
        url: URL,
        color: UIColor,
        backgroundColor: UIColor?
    ) {
        var attributes: [NSAttributedString.Key: Any] = [
            .link: url,
            .foregroundColor: color,
            .underlineStyle: NSUnderlineStyle.single.rawValue
        ]

        if let backgroundColor {
            attributes[.backgroundColor] = backgroundColor
        }

        attributed.addAttributes(attributes, range: range)
    }

    private func overlaps(_ range: NSRange, with ranges: [NSRange]) -> Bool {
        for item in ranges {
            if NSIntersectionRange(range, item).length > 0 {
                return true
            }
        }
        return false
    }
}

extension RichPostTextView {
    final class Coordinator: NSObject, UITextViewDelegate {
        var onLinkTap: (URL) -> Void
        var onVocabularyTap: ((String) -> Void)?

        init(onLinkTap: @escaping (URL) -> Void, onVocabularyTap: ((String) -> Void)?) {
            self.onLinkTap = onLinkTap
            self.onVocabularyTap = onVocabularyTap
        }

        func textView(_ textView: UITextView, primaryActionFor textItem: UITextItem, defaultAction: UIAction) -> UIAction? {
            switch textItem.content {
            case .link(let url):
                return UIAction { [weak self] _ in
                    self?.handle(url)
                }
            default:
                return defaultAction
            }
        }

        private func handle(_ url: URL) {
            if url.scheme == "xauto-dict" {
                let term = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                    .queryItems?
                    .first(where: { $0.name == "term" })?
                    .value?
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                if let term, !term.isEmpty {
                    onVocabularyTap?(term)
                }
                return
            }

            onLinkTap(url)
        }
    }
}
