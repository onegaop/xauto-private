import Foundation

@MainActor
final class TodayViewModel: ObservableObject {
    @Published var digest: DigestResponse?
    @Published var items: [BookmarkItemResponse] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            digest = try await APIClient.shared.fetchTodayDigest()
            let list = try await APIClient.shared.fetchItems(cursor: nil)
            items = list.items
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

@MainActor
final class WeekViewModel: ObservableObject {
    @Published var digest: DigestResponse?
    @Published var isLoading = false
    @Published var errorMessage: String?

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            digest = try await APIClient.shared.fetchWeekDigest()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
