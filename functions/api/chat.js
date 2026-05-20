/**
 * EdgeOne Pages 边缘函数 — AI API 代理
 * 解决浏览器 CORS 问题
 * 路径：/functions/api/chat.js → 部署后可通过 /api/chat 访问
 */

export async function onRequest(context) {
  // 仅允许 POST
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await context.request.json();

    const { endpoint, key, model, messages, max_tokens, temperature } = body;

    if (!endpoint || !key || !model || !messages) {
      return new Response(JSON.stringify({ error: '缺少必要参数：endpoint / key / model / messages' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 拼接真实 AI API 地址
    const url = endpoint.endsWith('/') ? endpoint + 'chat/completions' : endpoint + '/chat/completions';

    const upstreamResp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: max_tokens || 1000,
        temperature: temperature || 0.7,
      }),
    });

    const data = await upstreamResp.json();

    return new Response(JSON.stringify(data), {
      status: upstreamResp.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
