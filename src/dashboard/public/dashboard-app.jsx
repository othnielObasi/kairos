import React from "react";

export default function LegacyDashboardRedirect() {
  React.useEffect(() => {
    window.location.replace("/kairos");
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#080b11",
        color: "#c9d1dc",
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Cascadia Code', monospace",
        padding: "24px",
        textAlign: "center",
      }}
    >
      Redirecting to the Kairos dashboard...
    </div>
  );
}
