/**
 * EdgeOne Pages 边缘函数 — AI API 通用代理
 * 解决浏览器 CORS 问题
 * 路径：/functions/api/chat.js → 部署后可通过 /api/chat 访问
 *
 * 支持格式：
 *   - OpenAI 兼容：authHeader="Authorization", authPrefix="Bearer "
 *   - MiMo：authHeader="api-key", authPrefix=""
 */

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await context.request.json();

    const {
      endpoint,
      key,
      authHeader = 'Authorization',
      authPrefix = 'Bearer ',
      upstreamBody,
    } = body;

    if (!endpoint || !key || !upstreamBody) {
      return new Response(
        JSON.stringify({ error: '缺少必要参数：endpoint / key / upstreamBody' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 拼接真实 API 地址（自动补 /chat/completions）
    const sep = endpoint.endsWith('/') ? '' : '/';
    const url = endpoint + sep + 'chat/completions';

    // 构造 upstream headers
    const upstreamHeaders = {
      'Content-Type': 'application/json',
      [authHeader]: authPrefix + key,
    };

    const upstreamResp = await fetch(url, {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify(upstreamBody),
    });

    const contentType = upstreamResp.headers.get('Content-Type') || '';
    const respBody = contentType.includes('application/json')
      ? JSON.stringify(await upstreamResp.json())
      : await upstreamResp.text();

    return new Response(respBody, {
      status: upstreamResp.status,
      headers: {
        'Content-Type': contentType || 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
