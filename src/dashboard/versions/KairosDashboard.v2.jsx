import React from "react";

export default function LegacyV2Redirect() {
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
        background: "#06080c",
        color: "#e8ecf4",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "24px",
        textAlign: "center",
      }}
    >
      Redirecting to the Kairos dashboard...
    </div>
  );
}
