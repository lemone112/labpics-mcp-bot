export function GET() {
  return new Response(null, {
    status: 307,
    headers: {
      location: "/favicon.svg",
    },
  });
}
