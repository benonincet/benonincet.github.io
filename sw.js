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

    // 1. Intercept the core streaming configuration layer
    if (url.pathname.endsWith('/sse')) {
        const authHeader = event.request.headers.get('authorization');
        
        // Satisfy the unauthenticated server scan sequence
        if (!authHeader) {
            event.respondWith(new Response(JSON.stringify({ error: "Auth payload required" }), {
                status: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'WWW-Authenticate': `Bearer resource_metadata="${url.origin}/metadata.json"`
                }
            }));
            return;
        }

        // Establish the data pipeline stream
        event.respondWith(new Response(
            `data: ${JSON.stringify({ event: "endpoint", url: "./messages" })}\n\n`, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Access-Control-Allow-Origin': '*'
            }
        }));
    } 

    // 2. Serve the OAuth Metadata file required by Claude’s interface probe
    else if (url.pathname.endsWith('/metadata.json')) {
        event.respondWith(new Response(JSON.stringify({
            issuer: url.origin,
            token_endpoint: `${url.origin}/token`
        }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        }));
    }

    // 3. Serialize and route JSON-RPC commands down to the page execution block
    else if (url.pathname.endsWith('/messages')) {
        event.respondWith(new Promise(async (resolve) => {
            try {
                const body = await event.request.json();
                const id = Math.random().toString(36);
                clientsMap.set(id, resolve);
                swChannel.postMessage({ type: 'mcp_request', body: body, id: id });
            } catch (err) {
                resolve(new Response(JSON.stringify({ error: "Bad parameters" }), { status: 400 }));
            }
        }));
    }
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
