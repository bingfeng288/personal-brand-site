// EdgeOne Pages 边缘函数：/api/chat
// 代理 AI API 请求，密钥仅存在服务端，前端无法接触
export function onRequestPost(context) {
    return handleChat(context);
}

export function onRequestOptions() {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        }
    });
}

async function handleChat(context) {
    const { request } = context;

    // ===== 服务端配置（密钥仅存在于此，前端无法接触） =====
    const ENDPOINT   = 'https://token-plan-cn.xiaomimimo.com/v1';
    const API_KEY    = 'tp-cyxoma2lr0p2agq4rff5sxgtlccbyff83ehlhj8wdm96mj9o';
    const AUTH_HEADER = 'api-key';
    const AUTH_PREFIX = '';
    const MODEL      = 'mimo-v2.5-pro';

    let body;
    try {
        body = await request.json();
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    }

    const messages = body.messages;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return new Response(JSON.stringify({ error: 'messages 不能为空' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    }

    // 构建上游请求体
    const upstreamBody = {
        model: MODEL,
        messages: messages,
        temperature: 0.7,
        max_completion_tokens: 1024,
    };

    const upstreamUrl = ENDPOINT.replace(/\/$/, '') + '/chat/completions';

    const headers = { 'Content-Type': 'application/json' };
    headers[AUTH_HEADER] = AUTH_PREFIX + API_KEY;

    try {
        const upstreamResp = await fetch(upstreamUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(upstreamBody),
        });

        const respText = await upstreamResp.text();

        return new Response(respText, {
            status: upstreamResp.status,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            }
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: 'Upstream request failed: ' + e.message }), {
            status: 502,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    }
}
