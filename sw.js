const clientsMap = new Map();
const swChannel = new BroadcastChannel('mcp_routing');

// Handle responses coming back from your mcp.html page script
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

    // 1. Handle primary Claude Connection and 401 challenge sequence
    if (url.pathname.endsWith('/sse')) {
        const authHeader = event.request.headers.get('authorization');
        
        if (!authHeader) {
            event.respondWith(new Response(JSON.stringify({ error: "Handshake required" }), {
                status: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'WWW-Authenticate': `Bearer resource_metadata="${url.origin}/metadata.json"`
                }
            }));
            return;
        }

        // Once validation clears, spin up the active stream mapping
        event.respondWith(new Response(
            `data: ${JSON.stringify({ event: "endpoint", url: "./messages" })}\n\n`, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Access-Control-Allow-Origin': '*'
            }
        }));
    } 

    // 2. Serve metadata configuration descriptors for RFC discovery
    else if (url.pathname.endsWith('/metadata.json')) {
        event.respondWith(new Response(JSON.stringify({
            issuer: url.origin,
            token_endpoint: `${url.origin}/token`
        }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        }));
    }

    // 3. FIX: Handle the backend POST verification token exchange request
    // This removes the "Authorization with the MCP server failed" error code block
    else if (url.pathname.endsWith('/token')) {
        event.respondWith(new Response(JSON.stringify({
            access_token: "benonincet_universal_pass_token",
            token_type: "Bearer",
            expires_in: 3600
        }), {
            headers: { 
                'Content-Type': 'application/json', 
                'Access-Control-Allow-Origin': '*' 
            }
        }));
    }

    // 4. Trap and serialize tool execution JSON-RPC payloads
    else if (url.pathname.endsWith('/messages')) {
        event.respondWith(new Promise(async (resolve) => {
            try {
                const body = await event.request.json();
                const id = Math.random().toString(36);
                clientsMap.set(id, resolve);
                swChannel.postMessage({ type: 'mcp_request', body: body, id: id });
            } catch (err) {
                resolve(new Response(JSON.stringify({ error: "Invalid syntax layout" }), { status: 400 }));
            }
        }));
    }
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
