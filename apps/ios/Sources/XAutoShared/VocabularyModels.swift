import Foundation

struct VocabularyLookupRequest: Encodable {
    let term: String
    let context: String?
    let sourceLangHint: String?
    let targetLang: String
}

struct VocabularyPhoneticResponse: Codable {
    let ipa: String
    let us: String
    let uk: String

    init(ipa: String, us: String, uk: String) {
        self.ipa = ipa
        self.us = us
        self.uk = uk
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.ipa = try container.decodeIfPresent(String.self, forKey: .ipa) ?? ""
        self.us = try container.decodeIfPresent(String.self, forKey: .us) ?? ""
        self.uk = try container.decodeIfPresent(String.self, forKey: .uk) ?? ""
    }
}

struct VocabularyCollocationResponse: Codable, Identifiable, Hashable {
    let text: String
    let translation: String

    var id: String { "\(text)|\(translation)" }

    init(text: String, translation: String) {
        self.text = text
        self.translation = translation
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.text = try container.decodeIfPresent(String.self, forKey: .text) ?? ""
        self.translation = try container.decodeIfPresent(String.self, forKey: .translation) ?? ""
    }
}

struct VocabularyConfusableResponse: Codable, Identifiable, Hashable {
    let word: String
    let diff: String

    var id: String { "\(word)|\(diff)" }

    init(word: String, diff: String) {
        self.word = word
        self.diff = diff
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.word = try container.decodeIfPresent(String.self, forKey: .word) ?? ""
        self.diff = try container.decodeIfPresent(String.self, forKey: .diff) ?? ""
    }
}

struct VocabularyExampleResponse: Codable {
    let source: String
    let target: String

    init(source: String, target: String) {
        self.source = source
        self.target = target
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.source = try container.decodeIfPresent(String.self, forKey: .source) ?? ""
        self.target = try container.decodeIfPresent(String.self, forKey: .target) ?? ""
    }
}

struct VocabularyLookupResponse: Codable {
    let term: String
    let normalizedTerm: String
    let sourceLanguage: String
    let targetLanguage: String
    let translation: String
    let shortDefinitionZh: String
    let shortDefinitionEn: String
    let phonetic: VocabularyPhoneticResponse
    let partOfSpeech: [String]
    let domainTags: [String]
    let collocations: [VocabularyCollocationResponse]
    let example: VocabularyExampleResponse
    let confusable: [VocabularyConfusableResponse]
    let confidence: Double
    let provider: String
    let model: String
    let source: String
    let cachedAt: String

    init(
        term: String,
        normalizedTerm: String,
        sourceLanguage: String,
        targetLanguage: String,
        translation: String,
        shortDefinitionZh: String,
        shortDefinitionEn: String,
        phonetic: VocabularyPhoneticResponse,
        partOfSpeech: [String],
        domainTags: [String],
        collocations: [VocabularyCollocationResponse],
        example: VocabularyExampleResponse,
        confusable: [VocabularyConfusableResponse],
        confidence: Double,
        provider: String,
        model: String,
        source: String,
        cachedAt: String
    ) {
        self.term = term
        self.normalizedTerm = normalizedTerm
        self.sourceLanguage = sourceLanguage
        self.targetLanguage = targetLanguage
        self.translation = translation
        self.shortDefinitionZh = shortDefinitionZh
        self.shortDefinitionEn = shortDefinitionEn
        self.phonetic = phonetic
        self.partOfSpeech = partOfSpeech
        self.domainTags = domainTags
        self.collocations = collocations
        self.example = example
        self.confusable = confusable
        self.confidence = confidence
        self.provider = provider
        self.model = model
        self.source = source
        self.cachedAt = cachedAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.term = try container.decodeIfPresent(String.self, forKey: .term) ?? ""
        self.normalizedTerm = try container.decodeIfPresent(String.self, forKey: .normalizedTerm) ?? ""
        self.sourceLanguage = try container.decodeIfPresent(String.self, forKey: .sourceLanguage) ?? "unknown"
        self.targetLanguage = try container.decodeIfPresent(String.self, forKey: .targetLanguage) ?? "zh-CN"
        self.translation = try container.decodeIfPresent(String.self, forKey: .translation) ?? ""
        self.shortDefinitionZh = try container.decodeIfPresent(String.self, forKey: .shortDefinitionZh) ?? ""
        self.shortDefinitionEn = try container.decodeIfPresent(String.self, forKey: .shortDefinitionEn) ?? ""
        self.phonetic = try container.decodeIfPresent(VocabularyPhoneticResponse.self, forKey: .phonetic)
            ?? VocabularyPhoneticResponse(ipa: "", us: "", uk: "")
        self.partOfSpeech = try container.decodeIfPresent([String].self, forKey: .partOfSpeech) ?? []
        self.domainTags = try container.decodeIfPresent([String].self, forKey: .domainTags) ?? []
        self.collocations = try container.decodeIfPresent([VocabularyCollocationResponse].self, forKey: .collocations) ?? []
        self.example = try container.decodeIfPresent(VocabularyExampleResponse.self, forKey: .example)
            ?? VocabularyExampleResponse(source: "", target: "")
        self.confusable = try container.decodeIfPresent([VocabularyConfusableResponse].self, forKey: .confusable) ?? []
        self.confidence = try container.decodeIfPresent(Double.self, forKey: .confidence) ?? 0
        self.provider = try container.decodeIfPresent(String.self, forKey: .provider) ?? ""
        self.model = try container.decodeIfPresent(String.self, forKey: .model) ?? ""
        self.source = try container.decodeIfPresent(String.self, forKey: .source) ?? "model"
        self.cachedAt = try container.decodeIfPresent(String.self, forKey: .cachedAt) ?? ""
    }
}
