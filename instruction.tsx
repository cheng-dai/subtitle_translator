import { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./instruction.css";

const IntroductionPage = () => {
  const [activeTab, setActiveTab] = useState<"manual" | "changelog">("manual");

  return (
    <div className="settings-container">
      <header className="settings-header">
        <div className="header-content">
          <div className="logo">
            <span className="logo-icon">🎬</span>
            <h1>SVT Play Subtitles</h1>
          </div>
        </div>
      </header>

      <main className="settings-main">
        <div className="welcome-section">
          <div className="welcome-icon">🎉</div>
          <h2>Welcome to SVT Play Subtitles!</h2>
          <p>
            This extension automatically translates Swedish subtitles to your
            preferred language on SVT Play videos.
          </p>
        </div>

        <div className="tab-navigation">
          <button
            className={`tab-button ${activeTab === "manual" ? "active" : ""}`}
            onClick={() => setActiveTab("manual")}
          >
            📖 User Manual
          </button>
          <button
            className={`tab-button ${
              activeTab === "changelog" ? "active" : ""
            }`}
            onClick={() => setActiveTab("changelog")}
          >
            📝 Changelog
          </button>
        </div>

        {activeTab === "manual" && (
          <div className="tab-content">
            <section className="instructions-section">
              <h3>How to Use</h3>
              <div className="instruction-steps">
                <div className="step">
                  <div className="step-number">1</div>
                  <div className="step-content">
                    <strong>Navigate to SVT Play</strong>
                    <p>Go to any video on svtplay.se</p>
                  </div>
                </div>
                <div className="step">
                  <div className="step-number">2</div>
                  <div className="step-content">
                    <strong>Open the Extension</strong>
                    <p>Click the extension icon in your browser toolbar</p>
                  </div>
                </div>
                <div className="step">
                  <div className="step-number">3</div>
                  <div className="step-content">
                    <strong>Enable Subtitles</strong>
                    <p>Toggle the switch to turn on subtitle translation</p>
                  </div>
                </div>
                <div className="step">
                  <div className="step-number">4</div>
                  <div className="step-content">
                    <strong>Select Language</strong>
                    <p>
                      Choose your preferred subtitle language from the dropdown
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="features-section">
              <h3>Features</h3>
              <ul className="features-list">
                <li>✨ Automatic subtitle detection</li>
                <li>🌍 40+ language support</li>
                <li>⚡ Real-time translation</li>
                <li>💾 Remembers your preferences</li>
                <li>🔄 Works with all SVT Play videos</li>
              </ul>
            </section>

            <section className="troubleshooting-section">
              <h3>Troubleshooting</h3>
              <div className="troubleshooting-item">
                <h4>Subtitles not appearing?</h4>
                <p>
                  Make sure the video has Swedish subtitles enabled first, then
                  activate the extension.
                </p>
              </div>
              <div className="troubleshooting-item">
                <h4>Translation not working?</h4>
                <p>
                  Check your internet connection and try refreshing the page.
                </p>
              </div>
              <div className="troubleshooting-item">
                <h4>Extension not responding?</h4>
                <p>
                  Try disabling and re-enabling the extension, or restart your
                  browser.
                </p>
              </div>
            </section>

            <section className="support-section">
              <h3>Need Help?</h3>
              <p>Found a bug or have a suggestion?</p>
              <a
                href="https://github.com/your-repo/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="support-link"
              >
                Report an issue
              </a>
            </section>
          </div>
        )}

        {activeTab === "changelog" && (
          <div className="tab-content">
            <section className="changelog-section">
              <h3>Version History</h3>

              <div className="version-entry">
                <h4>v1.0.0 - Initial Release</h4>
                <p className="version-date">December 2024</p>
                <ul className="changelog-list">
                  <li>✨ Initial release of SVT Play Subtitles extension</li>
                  <li>🌍 Support for 40+ languages</li>
                  <li>⚡ Real-time subtitle translation</li>
                  <li>💾 Automatic language preference saving</li>
                  <li>🎯 Automatic subtitle detection on SVT Play videos</li>
                  <li>🔄 Works with all SVT Play video content</li>
                </ul>
              </div>

              <div className="version-entry">
                <h4>v0.9.0 - Beta Release</h4>
                <p className="version-date">November 2024</p>
                <ul className="changelog-list">
                  <li>🔧 Core translation functionality</li>
                  <li>🎨 Basic UI implementation</li>
                  <li>🧪 Initial testing with Swedish content</li>
                </ul>
              </div>

              <div className="version-entry">
                <h4>v0.8.0 - Development</h4>
                <p className="version-date">October 2024</p>
                <ul className="changelog-list">
                  <li>🏗️ Project setup and architecture</li>
                  <li>🔌 Chrome extension manifest configuration</li>
                  <li>📝 Initial documentation</li>
                </ul>
              </div>
            </section>

            <section className="roadmap-section">
              <h3>Upcoming Features</h3>
              <ul className="roadmap-list">
                <li>🔧 Improved Chrome version detection</li>
                <li>🎯 Enhanced video detection flow</li>
                <li>🎨 Improved popup design</li>
                <li>⚙️ Additional language options</li>
                <li>📱 Mobile browser support</li>
                <li>🎵 Audio translation support</li>
              </ul>
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

// Initialize the React app
const container = document.getElementById("settings");
if (container) {
  const root = createRoot(container);
  root.render(<IntroductionPage />);
}
