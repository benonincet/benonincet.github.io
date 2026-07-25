const clientsMap = new Map();
const swChannel = new BroadcastChannel('mcp_routing');

swChannel.onmessage = (e) => {
    if (e.data.type === 'mcp_response') {
        const resolve = clientsMap.get(e.data.id);
        if (resolve) {
            resolve(new Response(JSON.stringify(e.data.response), {
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            }));
            clientsMap.delete(e.data.id);
        }
    }
};

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-MCP-Protocol-Version',
        'Access-Control-Expose-Headers': 'WWW-Authenticate, X-MCP-Protocol-Version'
    };

    if (event.request.method === 'OPTIONS') {
        event.respondWith(new Response(null, { headers: corsHeaders }));
        return;
    }

    // 1. Process standard Streaming initialization queries
    if (url.pathname.endsWith('/sse')) {
        const authHeader = event.request.headers.get('authorization');
        
        // Provide the dynamic metadata challenge pointer required by the spec
        if (!authHeader) {
            event.respondWith(new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json',
                    'WWW-Authenticate': `Bearer resource_metadata="${url.origin}/metadata.json"`
                }
            }));
            return;
        }

        event.respondWith(new Response(`data: ${JSON.stringify({ event: "endpoint", url: "./messages" })}\n\n`, {
            headers: { ...corsHeaders, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
        }));
    } 

    // 2. Serve metadata configuration specifications
    else if (url.pathname.endsWith('/metadata.json')) {
        event.respondWith(new Response(JSON.stringify({
            issuer: url.origin,
            token_endpoint: `${url.origin}/token`
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }));
    }

    // 3. Serialize and route dynamic JSON-RPC queries
    else if (url.pathname.endsWith('/messages')) {
        event.respondWith(new Promise(async (resolve) => {
            try {
                const body = await event.request.json();
                const id = Math.random().toString(36);
                clientsMap.set(id, resolve);
                swChannel.postMessage({ type: 'mcp_request', body: body, id: id });
            } catch (err) {
                resolve(new Response(JSON.stringify({ error: "Invalid payload layout" }), { status: 400, headers: corsHeaders }));
            }
        }));
    }
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
