/**
 * EdgeOne Pages 边缘函数 — AI API 代理
 * 解决浏览器 CORS 问题
 * 路径：/functions/chat.js → 部署后可通过 /api/chat 访问
 *
 * ⚠️ 安全说明：
 *   - API Key 只存在本文件中，不会暴露给前端
 *   - 如需更换 Key，修改下方 CONFIG.key 后重新部署
 *   - 如果 GitHub 仓库是公开的，请勿提交真实 Key，改用部署时注入
 */

// ============ 配置区（部署前填写）============
const CONFIG = {
  // AI API 地址（不含 /chat/completions）
  endpoint: 'https://token-plan-cn.xiaomimimo.com/v1',

  // API Key（只存在边缘函数，前端不可见）
  key: 'tp-cyxoma2lr0p2agq4rff5sxgtlccbyff83ehlhj8wdm96mj9o',

  // 认证头配置（OpenAI/DeepSeek: Authorization + "Bearer "；MiMo: api-key + ""）
  authHeader: 'api-key',
  authPrefix: '',

  // 模型名称
  model: 'mimo-v2.5-pro',

  // 最大输出 token（MiMo 用 max_completion_tokens，OpenAI 兼容用 max_tokens）
  maxTokens: 1024,
  useMaxCompletionTokens: true, // MiMo: true；OpenAI/DeepSeek: false
};
// ================================================

export async function onRequest(context) {
  const { request } = context;

  // 只允许 POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const { messages } = body;

    if (!Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: '请求体必须包含 messages 数组' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 拼接上游 URL
    const sep = CONFIG.endpoint.endsWith('/') ? '' : '/';
    const upstreamUrl = CONFIG.endpoint + sep + 'chat/completions';

    // 构造上游请求体
    const upstreamBody = {
      model: CONFIG.model,
      messages: messages,
      temperature: 0.7,
    };
    if (CONFIG.useMaxCompletionTokens) {
      upstreamBody.max_completion_tokens = CONFIG.maxTokens;
    } else {
      upstreamBody.max_tokens = CONFIG.maxTokens;
    }

    // 构造上游请求头
    const upstreamHeaders = {
      'Content-Type': 'application/json',
      [CONFIG.authHeader]: CONFIG.authPrefix + CONFIG.key,
    };

    const upstreamResp = await fetch(upstreamUrl, {
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
