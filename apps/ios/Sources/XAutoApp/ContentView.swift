import SwiftUI

struct ContentView: View {
    var body: some View {
        TabView {
            TodayView()
                .tabItem {
                    Label("Today", systemImage: "sun.max")
                }

            WeekView()
                .tabItem {
                    Label("Week", systemImage: "calendar")
                }

            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gear")
                }
        }
    }
}

struct TodayView: View {
    @StateObject private var viewModel = TodayViewModel()

    var body: some View {
        NavigationStack {
            List {
                if let digest = viewModel.digest {
                    Section("Top Themes") {
                        ForEach(digest.topThemes, id: \.self) { theme in
                            Text(theme)
                        }
                    }
                }

                Section("Items") {
                    ForEach(viewModel.items) { item in
                        NavigationLink(item.summary?.oneLinerZh ?? item.text) {
                            ItemDetailView(item: item)
                        }
                    }
                }
            }
            .navigationTitle("Today")
            .task {
                await viewModel.load()
            }
        }
    }
}

struct WeekView: View {
    @StateObject private var viewModel = WeekViewModel()

    var body: some View {
        NavigationStack {
            List {
                if let digest = viewModel.digest {
                    Section("Top Themes") {
                        ForEach(digest.topThemes, id: \.self) { theme in
                            Text(theme)
                        }
                    }

                    Section("Top Items") {
                        ForEach(digest.topItems) { item in
                            VStack(alignment: .leading, spacing: 6) {
                                Text(item.reason)
                                    .font(.body)
                                Text(item.nextStep)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Week")
            .task {
                await viewModel.load()
            }
        }
    }
}

struct ItemDetailView: View {
    let item: BookmarkItemResponse

    var body: some View {
        List {
            Section("Author") {
                Text(item.authorName)
            }

            Section("Content") {
                Text(item.text)
            }

            if let summary = item.summary {
                Section("Summary") {
                    Text(summary.oneLinerZh)
                    ForEach(summary.bulletsZh, id: \.self) { bullet in
                        Text("• \(bullet)")
                    }
                }

                Section("Actions") {
                    ForEach(summary.actions, id: \.self) { action in
                        Text(action)
                    }
                }
            }
        }
        .navigationTitle("Item")
    }
}

struct SettingsView: View {
    @AppStorage("xauto_api_base") private var apiBase = "http://localhost:8080"
    @AppStorage("xauto_pat") private var pat = ""

    var body: some View {
        Form {
            Section("Connection") {
                TextField("API Base URL", text: $apiBase)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled(true)

                TextField("PAT", text: $pat)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled(true)
            }

            Section("Info") {
                Text("PAT is generated in XAuto Admin and stored locally.")
            }
        }
        .navigationTitle("Settings")
    }
}
