import { useTheme } from "../context/ThemeContext";

export default function ThemeToggle() {
    const { isDark, toggle } = useTheme();

    return (
        <div
            className="theme-toggle-wrap"
            onClick={toggle}
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
            <span className={`theme-toggle-label ${!isDark ? "active" : ""}`}>
                Light
            </span>

            <div className="theme-toggle-track" role="switch" aria-checked={isDark}>
                <div className="theme-toggle-thumb">{isDark ? "\u{1F319}" : "\u2600\uFE0F"}</div>
            </div>

            <span className={`theme-toggle-label ${isDark ? "active" : ""}`}>
                Dark
            </span>
        </div>
    );
}
