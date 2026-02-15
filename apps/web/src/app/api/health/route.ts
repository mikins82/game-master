// ---------------------------------------------------------------------------
// GET /api/health — Next.js health-check API route
// ---------------------------------------------------------------------------

export async function GET() {
  return Response.json({ status: "ok", service: "web" });
}
