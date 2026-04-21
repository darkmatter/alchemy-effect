const port = Number(process.env.PORT ?? "8080");
const greeting = process.env.GREETING ?? "hello";

Bun.serve({
  port,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return new Response("ok", { status: 200 });
    }
    return new Response(`${greeting}\n`, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  },
});

console.log(`[bun-ssh-deploy-example] listening on :${port}`);
