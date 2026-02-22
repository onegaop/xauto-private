import SwiftUI
import WidgetKit

struct WidgetEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetDigestSnapshot
}

struct WidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> WidgetEntry {
        WidgetEntry(date: Date(), snapshot: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (WidgetEntry) -> Void) {
        let snapshot = WidgetDigestStore.load() ?? .placeholder
        completion(WidgetEntry(date: Date(), snapshot: snapshot))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WidgetEntry>) -> Void) {
        let snapshot = WidgetDigestStore.load() ?? .placeholder
        let entry = WidgetEntry(date: Date(), snapshot: snapshot)
        let refreshAt = Calendar.current.date(byAdding: .minute, value: 45, to: Date()) ?? Date().addingTimeInterval(2700)
        completion(Timeline(entries: [entry], policy: .after(refreshAt)))
    }
}

struct WidgetEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: WidgetEntry

    var body: some View {
        switch family {
        case .systemMedium:
            mediumLayout
        default:
            smallLayout
        }
    }

    private var smallLayout: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Today")
                .font(.caption)
                .foregroundStyle(.secondary)

            Text(entry.snapshot.topTheme)
                .font(.headline)
                .lineLimit(3)
                .minimumScaleFactor(0.9)

            Spacer(minLength: 0)

            Text(entry.snapshot.action)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(12)
        .containerBackground(for: .widget) {
            LinearGradient(
                colors: [
                    Color(red: 0.97, green: 0.95, blue: 0.90),
                    Color(red: 0.92, green: 0.91, blue: 0.85)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }

    private var mediumLayout: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                Text("XAuto Digest")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(entry.snapshot.topTheme)
                    .font(.title3.weight(.bold))
                    .lineLimit(3)
            }
            Spacer(minLength: 0)
            VStack(alignment: .leading, spacing: 6) {
                Text("Next")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(entry.snapshot.action)
                    .font(.subheadline)
                    .lineLimit(4)
            }
            .frame(maxWidth: 140, alignment: .leading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(14)
        .containerBackground(for: .widget) {
            LinearGradient(
                colors: [
                    Color(red: 0.97, green: 0.95, blue: 0.90),
                    Color(red: 0.92, green: 0.91, blue: 0.85)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }
}

@main
struct XAutoWidget: Widget {
    let kind: String = XAutoSharedKeys.widgetKind

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WidgetProvider()) { entry in
            WidgetEntryView(entry: entry)
                .widgetURL(URL(string: "xauto://today"))
        }
        .configurationDisplayName("XAuto Digest")
        .description("Shows your latest digest theme and next action.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
