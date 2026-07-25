const clientsMap = new Map();
const swChannel = new BroadcastChannel('mcp_routing');

// Handle responses coming back from the page layout context
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

// Main routing engine to handle network requests from the web client
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 1. Handle primary Claude Connection and initial 401 challenge probe
    if (url.pathname.endsWith('/sse')) {
        const authHeader = event.request.headers.get('authorization');
        
        if (!authHeader) {
            event.respondWith(new Response(JSON.stringify({ error: "OAuth context required." }), {
                status: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'WWW-Authenticate': `Bearer resource_metadata="${url.origin}/metadata.json"`
                }
            }));
            return;
        }

        // If authorization token check is passed, open the event stream channel
        event.respondWith(new Response(
            `data: ${JSON.stringify({ event: "endpoint", url: "./messages" })}\n\n`, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Access-Control-Allow-Origin': '*'
            }
        }));
    } 

    // 2. Serve the simulated RFC OAuth Metadata Discovery file
    else if (url.pathname.endsWith('/metadata.json')) {
        event.respondWith(new Response(JSON.stringify({
            issuer: url.origin,
            token_endpoint: `${url.origin}/token`
        }), {
            headers: { 
                'Content-Type': 'application/json', 
                'Access-Control-Allow-Origin': '*' 
            }
        }));
    }

    // 3. Process the OAuth token checkpoint validation
    else if (url.pathname.endsWith('/token')) {
        event.respondWith(new Response(JSON.stringify({
            access_token: "mock_secure_pass_token",
            token_type: "Bearer",
            expires_in: 3600
        }), {
            headers: { 
                'Content-Type': 'application/json', 
                'Access-Control-Allow-Origin': '*' 
            }
        }));
    }

    // 4. Trap and route JSON-RPC tool/method execution messages
    else if (url.pathname.endsWith('/messages')) {
        event.respondWith(new Promise(async (resolve) => {
            try {
                const body = await event.request.json();
                const id = Math.random().toString(36);
                clientsMap.set(id, resolve);
                swChannel.postMessage({ type: 'mcp_request', body: body, id: id });
            } catch (err) {
                resolve(new Response(JSON.stringify({ error: "Invalid JSON payload" }), { status: 400 }));
            }
        }));
    }
});

// Force worker to activate instantly on first load without needing a manual refresh
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
