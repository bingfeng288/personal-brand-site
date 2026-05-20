#!/usr/bin/env node
/**
 * IMA 知识库文件上传自动化脚本
 * 用法：node upload-to-ima.cjs <kb_id> <file1> [file2] [file3] ...
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SKILL_DIR = process.env.SKILL_DIR || path.join(process.env.HOME || '~', '.workbuddy/skills/ima-skill');
const IMA_API = path.join(SKILL_DIR, 'ima_api.cjs');
const PREFLIGHT = path.join(SKILL_DIR, 'knowledge-base/scripts/preflight-check.cjs');
const COS_UPLOAD = path.join(SKILL_DIR, 'knowledge-base/scripts/cos-upload.cjs');

function run(cmd, input) {
  const result = spawnSync('node', [cmd, ...(input ? ['--file', input] : [])], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    throw new Error(`脚本执行失败: ${cmd}\nstderr: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function imaApi(apiPath, body) {
  const bodyJson = typeof body === 'string' ? body : JSON.stringify(body);
  // 写临时文件避免 shell 转义
  const tmpFile = `/tmp/ima_body_${Date.now()}.json`;
  fs.writeFileSync(tmpFile, bodyJson);
  
  try {
    const result = spawnSync('node', [IMA_API, apiPath, `--body-file`, tmpFile], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    if (result.status !== 0) {
      const err = result.stderr || result.stdout;
      throw new Error(`API 调用失败: ${apiPath}\n${err}`);
    }
    
    const stdout = result.stdout.trim();
    if (!stdout) throw new Error(`API 返回为空: ${apiPath}`);
    const data = JSON.parse(stdout);
    if (data.code !== 0) {
      throw new Error(`API 业务错误: ${apiPath}\ncode=${data.code}, msg=${data.msg}`);
    }
    return data;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch(e) {}
  }
}

async function uploadFile(kbId, filePath) {
  console.log(`\n📂 处理文件: ${path.basename(filePath)}`);
  
  // Step 1: preflight check
  console.log('  ⏳ preflight check...');
  const preflight = JSON.parse(run(PREFLIGHT, filePath));
  if (!preflight.pass) {
    console.error(`  ❌ preflight 失败: ${preflight.reason}`);
    return { success: false, file: filePath, error: preflight.reason };
  }
  console.log(`  ✅ preflight 通过 (media_type=${preflight.media_type}, size=${preflight.file_size})`);
  
  const { file_name, file_ext, file_size, media_type, content_type } = preflight;
  
  // Step 2: check repeated names
  console.log('  ⏳ 检查重名...');
  const checkResult = imaApi('openapi/wiki/v1/check_repeated_names', {
    params: [{ name: file_name, media_type }],
    knowledge_base_id: kbId
  });
  if (checkResult.data?.is_repeated) {
    console.log(`  ⚠️  文件名重复: ${file_name}`);
    console.log(`      已存在媒体 ID: ${checkResult.data.exist_media_id}`);
    console.log(`      跳过上传（不支持替换）`);
    return { success: false, file: filePath, error: '文件名重复，已跳过' };
  }
  console.log('  ✅ 无重名');
  
  // Step 3: create_media
  console.log('  ⏳ 创建媒体记录...');
  const createResult = imaApi('openapi/wiki/v1/create_media', {
    file_name,
    file_size,
    content_type,
    knowledge_base_id: kbId,
    file_ext
  });
  const { media_id, cos_credential } = createResult.data;
  console.log(`  ✅ 媒体创建成功: media_id=${media_id}`);
  
  // Step 4: COS upload
  console.log('  ⏳ 上传文件到 COS...');
  const cosResult = spawnSync('node', [
    COS_UPLOAD,
    '--file', filePath,
    '--secret-id', cos_credential.secret_id,
    '--secret-key', cos_credential.secret_key,
    '--token', cos_credential.token,
    '--bucket', cos_credential.bucket_name,
    '--region', cos_credential.region,
    '--cos-key', cos_credential.cos_key,
    '--content-type', content_type,
    '--start-time', cos_credential.start_time,
    '--expired-time', cos_credential.expired_time,
    '--timeout', '300000'
  ], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  
  if (cosResult.status !== 0) {
    console.error(`  ❌ COS 上传失败:\n${cosResult.stderr || cosResult.stdout}`);
    return { success: false, file: filePath, error: 'COS 上传失败' };
  }
  console.log('  ✅ COS 上传成功');
  
  // Step 5: add_knowledge
  console.log('  ⏳ 添加到知识库...');
  const addResult = imaApi('openapi/wiki/v1/add_knowledge', {
    media_type,
    media_id,
    title: file_name,
    knowledge_base_id: kbId,
    file_info: {
      cos_key: cos_credential.cos_key,
      file_size,
      file_name
    }
  });
  console.log(`  ✅ 已添加到知识库! media_id=${addResult.data?.media_id || media_id}`);
  
  return { success: true, file: filePath, media_id };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('用法: node upload-to-ima.cjs <kb_id> <file1> [file2] ...');
    process.exit(1);
  }
  
  const kbId = args[0];
  const files = args.slice(1);
  
  console.log(`🚀 开始上传 ${files.length} 个文件到知识库 ${kbId}`);
  
  const results = [];
  for (const file of files) {
    if (!fs.existsSync(file)) {
      console.error(`❌ 文件不存在: ${file}`);
      results.push({ success: false, file, error: '文件不存在' });
      continue;
    }
    try {
      const result = await uploadFile(kbId, file);
      results.push(result);
    } catch (e) {
      console.error(`❌ 上传失败: ${e.message}`);
      results.push({ success: false, file, error: e.message });
    }
  }
  
  console.log(`\n📊 上传结果: ${results.filter(r => r.success).length}/${results.length} 成功`);
  for (const r of results) {
    console.log(`  ${r.success ? '✅' : '❌'} ${path.basename(r.file)}: ${r.error || '成功'}`);
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
