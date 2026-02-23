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

// MARK: - Entry View

struct WidgetEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: WidgetEntry

    var body: some View {
        switch family {
        case .systemMedium:
            mediumLayout
        case .accessoryRectangular:
            accessoryRectangularLayout
        case .accessoryInline:
            accessoryInlineLayout
        default:
            smallLayout
        }
    }

    private var relativeTime: String {
        let raw = entry.snapshot.generatedAt
        guard !raw.isEmpty else { return "" }
        let parser = ISO8601DateFormatter()
        guard let date = parser.date(from: raw) else { return "" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: entry.date)
    }

    // MARK: Small

    private var smallLayout: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 5) {
                Circle()
                    .fill(Color.orange.gradient)
                    .frame(width: 7, height: 7)
                Text("XAuto")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
            }

            Text(entry.snapshot.topTheme)
                .font(.headline)
                .lineLimit(3)
                .minimumScaleFactor(0.85)

            Spacer(minLength: 0)

            VStack(alignment: .leading, spacing: 2) {
                if isActionMeaningful {
                    Text(entry.snapshot.action)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
                if !relativeTime.isEmpty {
                    Text(relativeTime)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(16)
        .containerBackground(for: .widget) {
            Color(.systemBackground)
        }
    }

    // MARK: Medium

    private var mediumLayout: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                HStack(spacing: 5) {
                    Circle()
                        .fill(Color.orange.gradient)
                        .frame(width: 7, height: 7)
                    Text("XAuto Digest")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if !entry.snapshot.periodKey.isEmpty {
                    Text(entry.snapshot.periodKey)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }

            Text(entry.snapshot.topTheme)
                .font(.title3.weight(.bold))
                .lineLimit(2)

            Spacer(minLength: 0)

            HStack(alignment: .bottom) {
                if isActionMeaningful {
                    Label {
                        Text(entry.snapshot.action)
                            .lineLimit(2)
                    } icon: {
                        Image(systemName: "arrow.right.circle.fill")
                    }
                    .font(.caption)
                    .foregroundStyle(.orange)
                }
                Spacer(minLength: 0)
                if !relativeTime.isEmpty {
                    Text(relativeTime)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(16)
        .containerBackground(for: .widget) {
            Color(.systemBackground)
        }
    }

    // MARK: Lock Screen — Rectangular

    private var accessoryRectangularLayout: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                Image(systemName: "sparkle")
                    .font(.caption2)
                    .widgetAccentable()
                Text("XAuto")
                    .font(.caption.weight(.semibold))
                    .widgetAccentable()
            }
            Text(entry.snapshot.topTheme)
                .font(.caption)
                .lineLimit(2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Lock Screen — Inline

    private var accessoryInlineLayout: some View {
        Label(entry.snapshot.topTheme, systemImage: "sparkle")
    }

    // MARK: Helpers

    private var isActionMeaningful: Bool {
        let action = entry.snapshot.action
        return !action.isEmpty && action != WidgetDigestSnapshot.placeholder.action
    }
}

// MARK: - Widget Configuration

@main
struct XAutoWidget: Widget {
    let kind: String = XAutoSharedKeys.widgetKind

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WidgetProvider()) { entry in
            WidgetEntryView(entry: entry)
                .widgetURL(URL(string: "xauto://today"))
        }
        .configurationDisplayName("XAuto Digest")
        .description("今日摘要主题与下一步行动。")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .accessoryRectangular,
            .accessoryInline,
        ])
    }
}
