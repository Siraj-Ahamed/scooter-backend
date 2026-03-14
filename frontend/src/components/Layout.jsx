import { NavLink, useNavigate } from "react-router-dom";
import {
    LayoutDashboard,
    Map,
    Truck,
    Navigation,
    Bell,
    LogOut,
    Wifi,
    WifiOff,
    Layers,
    BarChart2,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import ThemeToggle from "./ThemeToggle";

const navItems = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/map", label: "Live Map", icon: Map },
    { to: "/vehicles", label: "Fleet", icon: Truck },
    { to: "/zones", label: "Zones", icon: Layers },
    { to: "/trips", label: "Trips", icon: Navigation },
    { to: "/alerts",    label: "Alerts",    icon: Bell },
    { to: "/analytics", label: "Analytics",  icon: BarChart2 },
];

export default function Layout({ children }) {
    const { user, logout } = useAuth();
    const { connected, unreadCount } = useSocket();
    const navigate = useNavigate();

    const handleLogout = async () => {
        await logout();
        navigate("/login");
    };

    return (
        <div className="app-layout">
            <aside className="sidebar">
                <div className="sidebar-logo">
                    <div className="sidebar-logo-text">FleetOps</div>
                    <div className="sidebar-logo-sub">Fleet Control Centre</div>
                </div>

                <nav className="sidebar-nav">
                    {navItems.map(({ to, label, icon: Icon, end }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={end}
                            className={({ isActive }) =>
                                `nav-item ${isActive ? "active" : ""}`
                            }
                        >
                            <Icon size={15} />
                            {label}
                            {label === "Alerts" && unreadCount > 0 && (
                                <span
                                    style={{
                                        marginLeft: "auto",
                                        background: "var(--red)",
                                        color: "#fff",
                                        borderRadius: "10px",
                                        padding: "1px 6px",
                                        fontSize: "10px",
                                        fontFamily: "var(--mono)",
                                        fontWeight: 700,
                                    }}
                                >
                                    {unreadCount > 99 ? "99+" : unreadCount}
                                </span>
                            )}
                        </NavLink>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            marginBottom: 12,
                        }}
                    >
                        {connected ? (
                            <>
                                <Wifi size={12} color="var(--green)" />
                                <span
                                    style={{
                                        fontSize: 11,
                                        color: "var(--green)",
                                        fontFamily: "var(--mono)",
                                    }}
                                >
                                    LIVE
                                </span>
                            </>
                        ) : (
                            <>
                                <WifiOff size={12} color="var(--text3)" />
                                <span
                                    style={{
                                        fontSize: 11,
                                        color: "var(--text3)",
                                        fontFamily: "var(--mono)",
                                    }}
                                >
                                    OFFLINE
                                </span>
                            </>
                        )}
                    </div>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 10,
                        }}
                    >
                        <div
                            style={{
                                width: 28,
                                height: 28,
                                borderRadius: "50%",
                                background: "var(--surface2)",
                                border: "1px solid var(--border2)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 12,
                                fontWeight: 600,
                                color: "var(--accent)",
                            }}
                        >
                            {user?.name?.[0]?.toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                                style={{
                                    fontSize: 12,
                                    fontWeight: 500,
                                    color: "var(--text)",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {user?.name}
                            </div>
                            <div
                                style={{
                                    fontSize: 10,
                                    color: "var(--text3)",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {user?.email}
                            </div>
                        </div>
                    </div>
                    <button
                        className="btn btn-ghost btn-sm w-full"
                        onClick={handleLogout}
                        style={{ justifyContent: "center" }}
                    >
                        <LogOut size={13} /> Sign out
                    </button>
                </div>
            </aside>

            {/* Main area: header bar + content */}
            <div
                style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                }}
            >
                {/* ── Top bar with theme toggle ── */}
                <div className="page-header-bar">
                    <ThemeToggle />
                </div>

                <main className="main-content">{children}</main>
            </div>
        </div>
    );
}

