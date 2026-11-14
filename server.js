const http = require("node:http");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

const staticFiles = {
    "/": ["test.html", "text/html; charset=utf-8"],
    "/test.html": ["test.html", "text/html; charset=utf-8"],
    "/main_menu.js": ["main_menu.js", "text/javascript; charset=utf-8"]
};

const server = http.createServer(async (request, response) => {
    if (request.method === "POST" && request.url === "/api/room-code") {
        const chunks = [];
        for await (const chunk of request) {
            chunks.push(chunk);
        }

        const code = Buffer.concat(chunks).toString("utf8");
        if (!/^[A-Z0-9]{6}$/.test(code)) {
            response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
            response.end("Expected a six-character uppercase alphanumeric code");
            return;
        }

        response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        response.end(code);
        return;
    }

    if (request.method !== "GET") {
        response.writeHead(405, { "Allow": "GET, POST" });
        response.end("Method not allowed");
        return;
    }

    const file = staticFiles[request.url];
    if (!file) {
        response.writeHead(404);
        response.end("Not found");
        return;
    }

});

server.listen(3000, "127.0.0.1", () => {
    console.log("Test server listening at http://127.0.0.1:3000/test.html");
});
