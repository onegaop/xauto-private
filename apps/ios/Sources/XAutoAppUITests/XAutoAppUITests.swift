import XCTest

final class XAutoAppUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchEnvironment["XAUTO_TEST_MODE"] = "ui_offline_smoke"
        app.launch()
    }

    override func tearDownWithError() throws {
        if let caseRun = testRun as? XCTestCaseRun, caseRun.failureCount > 0 {
            let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
            attachment.name = "ui-smoke-failure-\(name)"
            attachment.lifetime = .keepAlways
            add(attachment)
        }
        app = nil
        try super.tearDownWithError()
    }

    func testTabNavigationSmoke() {
        let weekTab = requiredTabButton(identifier: "tab.week", fallbackLabel: "Week")
        weekTab.tap()
        XCTAssertTrue(
            app.navigationBars["Week"].waitForExistence(timeout: 8),
            "Week page should be visible"
        )

        let settingsTab = requiredTabButton(identifier: "tab.settings", fallbackLabel: "Settings")
        settingsTab.tap()
        XCTAssertTrue(
            app.navigationBars["Settings"].waitForExistence(timeout: 8),
            "Settings page should be visible"
        )

        let todayTab = requiredTabButton(identifier: "tab.today", fallbackLabel: "Today")
        todayTab.tap()
        XCTAssertTrue(
            app.navigationBars["XAuto"].waitForExistence(timeout: 8),
            "Today page should be visible"
        )
    }

    func testSettingsCriticalControlsSmoke() {
        let settingsTab = requiredTabButton(identifier: "tab.settings", fallbackLabel: "Settings")
        settingsTab.tap()

        XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 8), "Settings page should be visible")

        let apiBaseField = app.textFields["settings.api_base"]
        XCTAssertTrue(apiBaseField.waitForExistence(timeout: 8), "API Base field should exist")

        let securePatField = app.secureTextFields["settings.pat"]
        let plainPatField = app.textFields["settings.pat"]
        XCTAssertTrue(
            securePatField.waitForExistence(timeout: 2) || plainPatField.waitForExistence(timeout: 2),
            "PAT field should exist"
        )

        let saveButton = requiredButton(identifier: "settings.save_test", fallbackLabel: "Save & Test")
        let adminButton = requiredButton(identifier: "settings.open_admin", fallbackLabel: "Open Admin Dashboard")

        XCTAssertTrue(adminButton.exists, "Open Admin button should exist")

        saveButton.tap()
        XCTAssertTrue(
            app.navigationBars["Settings"].waitForExistence(timeout: 8),
            "Settings should remain usable after Save & Test"
        )
        XCTAssertEqual(app.state, .runningForeground)
        XCTAssertTrue(saveButton.waitForExistence(timeout: 8), "Save & Test button should still exist")
    }

    private func requiredTabButton(identifier: String, fallbackLabel: String) -> XCUIElement {
        let byIdentifier = app.tabBars.buttons[identifier]
        if byIdentifier.waitForExistence(timeout: 1) {
            return byIdentifier
        }
        let byLabel = app.tabBars.buttons[fallbackLabel]
        XCTAssertTrue(byLabel.waitForExistence(timeout: 8), "Tab should exist: \(identifier) or \(fallbackLabel)")
        return byLabel
    }

    private func requiredButton(identifier: String, fallbackLabel: String) -> XCUIElement {
        let byIdentifier = app.buttons[identifier]
        if byIdentifier.waitForExistence(timeout: 1) {
            return byIdentifier
        }
        let byLabel = app.buttons[fallbackLabel]
        XCTAssertTrue(byLabel.waitForExistence(timeout: 8), "Button should exist: \(identifier) or \(fallbackLabel)")
        return byLabel
    }
}
