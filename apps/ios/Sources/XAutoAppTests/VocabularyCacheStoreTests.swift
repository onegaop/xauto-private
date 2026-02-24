import XCTest
@testable import XAutoApp

final class VocabularyCacheStoreTests: XCTestCase {
    func testNormalizedTermTrimsLowercasesAndCollapsesWhitespace() {
        let normalized = VocabularyCacheStore.normalizedTerm("  Hello   World  ")
        XCTAssertEqual(normalized, "hello-world")
    }

    func testNormalizedTermPreservesChineseAndAllowedSymbols() {
        let normalized = VocabularyCacheStore.normalizedTerm("  机器学习 + LLM/Agent_v2.0  ")
        XCTAssertEqual(normalized, "机器学习-+-llm/agent_v2.0")
    }

    func testNormalizedTermReplacesDisallowedCharactersAndTrimsDashes() {
        let normalized = VocabularyCacheStore.normalizedTerm("  !!!GPT@@@  ")
        XCTAssertEqual(normalized, "gpt")
    }

    func testNormalizedTermReturnsEmptyWhenNoValidCharacters() {
        let normalized = VocabularyCacheStore.normalizedTerm("  !!!@@@###  ")
        XCTAssertTrue(normalized.isEmpty)
    }

    func testCacheKeyUsesLowercasedTargetLanguage() {
        let key = VocabularyCacheStore.cacheKey(normalizedTerm: "hello-world", targetLang: "ZH-CN")
        XCTAssertEqual(key, "vocab:v1:hello-world:zh-cn")
    }
}
