#!/usr/bin/env node
// SPDX-FileCopyrightText: 2024-2026 AskKim
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from 'fs';
import path from 'path';
import Ajv from 'ajv';

const manifestPath = path.resolve('prompts/preflight/manifest/preflight.manifest.json');
const schemaPath = path.resolve('prompts/preflight/manifest/manifest.schema.json');
const wiringPath = path.resolve('prompts/preflight/pf-launcher-uni-wiring.md');
const launcherPath = path.resolve('prompts/preflight/pf-launcher-uni.md');
const readmeDir = path.resolve('prompts/preflight/run-uni/read');
const tocPlaceholder = '<!-- MANIFEST_TOC -->';

function loadJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function validate() {
  const ajv = new Ajv();
  const schema = loadJSON(schemaPath);
  const validate = ajv.compile(schema);
  const data = loadJSON(manifestPath);
  const valid = validate(data);
  if (!valid) {
    console.error('Manifest validation errors:', validate.errors);
    process.exit(1);
  }
  return data;
}

function generateWiring(data) {
  const rows = data.steps.map(s => `| ${s.id} | \`${s.file}\` | ${s.type} |`).join('\n');
  const content = `# Preflight Launcher Wiring Guide\n\n| Step ID | Prompt File | Type |\n|---|---|---|\n${rows}\n`;
  fs.writeFileSync(wiringPath, content, 'utf8');
}

function generateTOC(data) {
  const tocLines = data.steps.map(s => `- [${s.id}](${s.file}) — ${s.type}`).join('\n');
  const launcher = fs.readFileSync(launcherPath, 'utf8');
  const newContent = launcher.replace(tocPlaceholder, `${tocPlaceholder}\n\n## Table of Contents\n${tocLines}\n`);
  fs.writeFileSync(launcherPath, newContent, 'utf8');
}

function ensureReadmeDir() {
  if (!fs.existsSync(readmeDir)) {
    fs.mkdirSync(readmeDir, { recursive: true });
  }
}

function generateReadmes(data) {
  ensureReadmeDir();
  data.steps.forEach(step => {
    const readmePath = path.join(readmeDir, `${step.id}-readme.md`);
    const content = `// SPDX-FileCopyrightText: 2024-2026 AskKim\n// SPDX-License-Identifier: AGPL-3.0-or-later\n\n# ${step.id} Prompt Readme\n\n**Description:** ${step.description}\n\n**Prompt file:** \`${step.file}\`\n`;
    fs.writeFileSync(readmePath, content, 'utf8');
  });
}

function main() {
  const data = validate();
  generateWiring(data);
  generateTOC(data);
  generateReadmes(data);
  console.log('Preflight generation completed.');
}

main();
