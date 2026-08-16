export default {
  async fetch(request) {
    return Response.json({
      ok: true,
      name: "pg-roundtable",
      path: new URL(request.url).pathname,
    });
  },
};
