import Link from "next/link";

export default function AuthCodeErrorPage() {
  return (
    <main className="auth-wrap">
      <div className="card">
        <div className="tricolore" style={{ marginBottom: "1.25rem", borderRadius: 2 }} />
        <h1 className="card-title">Link problem</h1>
        <p className="card-sub">
          This email link is invalid or has already been used. Please request a
          new one.
        </p>
        <Link href="/login" className="btn btn-primary">
          Back to login
        </Link>
      </div>
    </main>
  );
}
