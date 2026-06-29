export function ForbiddenPage() {
  return (
    <main className="error-page" aria-labelledby="error-heading">
      <span className="error-page__code" aria-hidden="true">403</span>
      <h1 id="error-heading">Access Forbidden</h1>
      <p>You are not registered as a maintainer for this organisation.</p>
      <a href="#/" className="btn btn-secondary">← Back to home</a>
    </main>
  );
}
