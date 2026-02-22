import SwiftUI
import UIKit
import Atributika
import AtributikaViews

struct RichPostTextView: UIViewRepresentable {
    let text: String
    let onLinkTap: (URL) -> Void

    func makeUIView(context: Context) -> AttributedLabel {
        let label = AttributedLabel()
        label.backgroundColor = .clear
        label.adjustsFontForContentSizeCategory = true
        label.numberOfLines = 0
        label.lineBreakMode = .byCharWrapping
        label.highlightedLinkAttributes = Attrs()
            .foregroundColor(.systemOrange)
            .underlineStyle(.single)
            .attributes
        label.onLinkTouchUpInside = { _, value in
            guard let raw = value as? String, let url = URL(string: raw) else {
                return
            }
            onLinkTap(url)
        }
        return label
    }

    func updateUIView(_ uiView: AttributedLabel, context: Context) {
        let fallbackWidth = UIScreen.main.bounds.width - 64
        let width = uiView.bounds.width > 0 ? uiView.bounds.width : fallbackWidth
        uiView.preferredMaxLayoutWidth = max(120, width)
        uiView.attributedText = makeAttributedText(from: text)
        uiView.invalidateIntrinsicContentSize()
    }

    private func makeAttributedText(from rawText: String) -> NSAttributedString {
        let base = Attrs()
            .font(.preferredFont(forTextStyle: .body))
            .foregroundColor(.label)

        let linkStyle = Attrs()
            .foregroundColor(.systemBlue)
            .underlineStyle(.single)

        let links = DetectionTuner { detection in
            Attrs(linkStyle).akaLink(detection.text.normalizedWebURLString)
        }

        let mentions = DetectionTuner { detection in
            let handle = detection.text.replacingOccurrences(of: "@", with: "")
            return Attrs(linkStyle).akaLink("https://x.com/\(handle)")
        }

        let hashtags = DetectionTuner { detection in
            let value = detection.text.replacingOccurrences(of: "#", with: "")
            let encoded = value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? value
            return Attrs(linkStyle).akaLink("https://x.com/hashtag/\(encoded)")
        }

        return rawText
            .styleLinks(links)
            .styleMentions(mentions)
            .styleHashtags(hashtags)
            .styleBase(base)
            .attributedString
    }
}

private extension String {
    var normalizedWebURLString: String {
        if hasPrefix("http://") || hasPrefix("https://") {
            return self
        }
        return "https://\(self)"
    }
}
