import WidgetKit
import SwiftUI

struct WidgetEntry: TimelineEntry {
    let date: Date
    let topTheme: String
    let action: String
}

struct WidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> WidgetEntry {
        WidgetEntry(date: Date(), topTheme: "Loading", action: "Open app for details")
    }

    func getSnapshot(in context: Context, completion: @escaping (WidgetEntry) -> Void) {
        completion(WidgetEntry(date: Date(), topTheme: "XAuto", action: "Review today digest"))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WidgetEntry>) -> Void) {
        let entry = WidgetEntry(date: Date(), topTheme: "XAuto", action: "Open app to refresh")
        let nextRefresh = Calendar.current.date(byAdding: .minute, value: 45, to: Date()) ?? Date().addingTimeInterval(2700)
        completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
    }
}

struct WidgetEntryView: View {
    var entry: WidgetProvider.Entry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Today Theme")
                .font(.caption)
                .foregroundColor(.secondary)
            Text(entry.topTheme)
                .font(.headline)
                .lineLimit(2)
            Spacer()
            Text(entry.action)
                .font(.caption2)
                .foregroundColor(.secondary)
        }
        .padding()
    }
}

struct XAutoWidget: Widget {
    let kind: String = "XAutoWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WidgetProvider()) { entry in
            WidgetEntryView(entry: entry)
        }
        .configurationDisplayName("XAuto Digest")
        .description("Shows key digest points from your X bookmarks.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
