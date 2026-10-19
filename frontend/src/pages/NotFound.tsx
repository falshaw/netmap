import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: "var(--bg-primary, #030014)" }}
    >
      <div
        className="text-center p-12 rounded-[20px]"
        style={{
          maxWidth: 520,
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(20px)",
          boxShadow: "0 25px 80px rgba(0,0,0,0.5)",
        }}
      >
        <div
          className="text-7xl font-bold mb-4"
          style={{
            background: "linear-gradient(135deg, #06b6d4, #7c3aed)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          404
        </div>
        <h1
          className="text-2xl font-semibold mb-2"
          style={{ color: "rgba(255,255,255,0.9)" }}
        >
          Page Not Found
        </h1>
        <p className="mb-8" style={{ color: "rgba(255,255,255,0.5)" }}>
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all"
          style={{
            background: "linear-gradient(135deg, #06b6d4, #7c3aed)",
            color: "#fff",
            textDecoration: "none",
          }}
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
