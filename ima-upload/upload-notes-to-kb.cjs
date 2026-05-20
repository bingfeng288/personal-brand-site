#!/usr/bin/env node
/**
 * IMA 知识库上传（Notes 方式）
 * 用法：node upload-notes-to-kb.cjs <kb_id> <file1.md> [file2.md] ...
 *
 * 流程：
 *   1. import_doc   → 创建笔记（Markdown 内容）
 *   2. add_knowledge (media_type=11) → 把笔记添加到知识库
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SKILL_DIR = process.env.SKILL_DIR || path.join(process.env.HOME, '.workbuddy/skills/ima-skill');
const IMA_API = path.join(SKILL_DIR, 'ima_api.cjs');

function imaApi(apiPath, bodyObj) {
  const bodyStr = JSON.stringify(bodyObj);
  const result = spawnSync('node', [IMA_API, apiPath, bodyStr], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 60000,
  });
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || '').trim();
    throw new Error(`API 调用失败: ${apiPath}\n${err}`);
  }
  const raw = result.stdout.trim();
  if (!raw) throw new Error(`API 返回为空: ${apiPath}`);
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error(`API 返回非 JSON: ${apiPath}\n${raw.slice(0, 200)}`);
  }
  if (data.code !== 0) {
    throw new Error(`API 业务错误: ${apiPath}\ncode=${data.code}, msg=${data.msg}`);
  }
  return data;
}

function uploadOne(kbId, filePath) {
  const fileName = path.basename(filePath);
  const title = fileName.replace(/\.md$/i, '');
  console.log(`\n📝 处理：${fileName}`);

  // Step 1: 读取文件，确认 UTF-8
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    throw new Error(`读取文件失败: ${filePath}\n${e.message}`);
  }
  if (!content.trim()) {
    throw new Error(`文件内容为空: ${filePath}`);
  }

  // Step 2: import_doc —— 创建笔记
  console.log('  ⏳ 创建笔记...');
  const importResult = imaApi('openapi/note/v1/import_doc', {
    content_format: 1,
    content: content,
  });
  const noteId = importResult.data?.note_id;
  if (!noteId) {
    throw new Error(`import_doc 未返回 note_id：${JSON.stringify(importResult.data)}`);
  }
  console.log(`  ✅ 笔记已创建：note_id=${noteId}`);

  // Step 3: add_knowledge (media_type=11) —— 添加到知识库
  console.log('  ⏳ 添加到知识库...');
  const addResult = imaApi('openapi/wiki/v1/add_knowledge', {
    media_type: 11,
    note_info: { content_id: noteId },
    title: title,
    knowledge_base_id: kbId,
  });
  const mediaId = addResult.data?.media_id;
  console.log(`  ✅ 已添加到知识库！media_id=${mediaId || '(见响应)'}`);

  return { success: true, file: filePath, noteId, mediaId };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('用法：node upload-notes-to-kb.cjs <kb_id> <file1.md> [file2.md] ...');
    process.exit(1);
  }
  const kbId = args[0];
  const files = args.slice(1);

  console.log(`🚀 开始上传 ${files.length} 个文件到知识库（Notes 方式）`);
  console.log(`   知识库 ID：${kbId}`);

  const results = [];
  for (const file of files) {
    if (!fs.existsSync(file)) {
      results.push({ success: false, file, error: '文件不存在' });
      continue;
    }
    try {
      const r = uploadOne(kbId, file);
      results.push(r);
    } catch (e) {
      console.error(`  ❌ 失败：${e.message}`);
      results.push({ success: false, file, error: e.message });
    }
  }

  console.log(`\n📊 上传结果：${results.filter(r => r.success).length}/${results.length} 成功`);
  for (const r of results) {
    const name = path.basename(r.file || '');
    console.log(`  ${r.success ? '✅' : '❌'} ${name}${r.error ? '：' + r.error : ''}`);
  }
}

main();
