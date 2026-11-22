import { Link } from "react-router-dom";

export function ForbiddenPage() {
  return (
    <main className="error-page" role="main">
      <h1>403 — Forbidden</h1>
      <p>You are not registered as a maintainer for this organisation.</p>
      <Link to="/" className="btn btn-primary">Go home</Link>
    </main>
  );
}
