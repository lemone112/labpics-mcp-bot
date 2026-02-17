export function GET(request) {
  const url = new URL("/favicon.svg", request.url);
  return Response.redirect(url, 307);
}
