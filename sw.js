const clientsMap = new Map();
const swChannel = new BroadcastChannel('mcp_routing');

swChannel.onmessage = (e) => {
    if (e.data.type === 'mcp_response') {
        const resolve = clientsMap.get(e.data.id);
        if (resolve) {
            resolve(new Response(JSON.stringify(e.data.response), {
                headers: { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            }));
            clientsMap.delete(e.data.id);
        }
    }
};

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Trap the Claude Desktop SSE stream requests
    if (url.pathname.endsWith('/sse')) {
        event.respondWith(new Response(
            `data: ${JSON.stringify({ event: "endpoint", url: "./messages" })}\n\n`, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Access-Control-Allow-Origin': '*'
            }
        }));
    } 
    // Trap the JSON-RPC message calls
    else if (url.pathname.endsWith('/messages')) {
        event.respondWith(new Promise(async (resolve) => {
            const body = await event.request.json();
            const id = Math.random().toString(36);
            clientsMap.set(id, resolve);
            swChannel.postMessage({ type: 'mcp_request', body: body, id: id });
        }));
    }
});

// Force immediately active registration states
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
