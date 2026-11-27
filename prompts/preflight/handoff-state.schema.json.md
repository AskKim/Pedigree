{

"\$schema": "https://json-schema.org/draft/2020-12/schema",

"\$id": "prompts/preflight/handoff-state.schema.json",

"title": "Preflight Handoff State Schema v2",

"description": "Validates docs/handoff-state.json for two-platform AI
Studio -\> Anti-Gravity orchestration. Last Updated:
2026-11-25T18:32:00-06:00",

"type": "object",

"additionalProperties": false,

"required": \[

"schema_version",

"active_branch",

"target_version",

"resume_cursor",

"phase_a_scope_hash",

"ai_studio_status",

"ai_studio_completed_at",

"ai_studio_commit_sha",

"improvement_log_anchor",

"antigravity_status",

"antigravity_completed_at",

"history",

"last_error"

\],

"properties": {

"schema_version": { "const": 2 },

"active_branch": { "type": "string", "minLength": 1 },

"target_version": { "type": "string", "minLength": 1 },

"resume_cursor": {

"type": \["object", "null"\],

"additionalProperties": false,

"required": \["phase", "next_step_id"\],

"properties": {

"phase": { "enum": \["A", "B"\] },

"next_step_id": { "type": "string", "minLength": 1 }

}

},

"phase_a_scope_hash": { "type": \["string", "null"\] },

"ai_studio_status": { "enum": \["pending", "in_progress", "completed"\]
},

"ai_studio_completed_at": { "type": \["string", "null"\], "pattern":
"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z\$" },

"ai_studio_commit_sha": { "type": \["string", "null"\] },

"improvement_log_anchor": {

"type": \["object", "null"\],

"additionalProperties": false,

"required": \["file", "top_heading", "line_count"\],

"properties": {

"file": { "type": "string" },

"top_heading": { "type": "string" },

"line_count": { "type": "integer", "minimum": 0 }

}

},

"antigravity_status": { "enum": \["pending", "in_progress",
"completed"\] },

"antigravity_completed_at": { "type": \["string", "null"\], "pattern":
"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z\$" },

"history": {

"type": "array",

"items": {

"type": "object",

"additionalProperties": false,

"required": \["step_id", "branch", "version", "head_sha", "platform",
"status", "completed_at", "touched_files"\],

"properties": {

"step_id": { "type": "string", "minLength": 1 },

"branch": { "type": "string", "minLength": 1 },

"version": { "type": "string", "minLength": 1 },

"head_sha": { "type": "string", "minLength": 1 },

"platform": { "enum": \["ai-studio", "antigravity"\] },

"status": { "enum": \["completed", "failed", "skipped"\] },

"completed_at": { "type": "string", "pattern":
"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z\$" },

"touched_files": { "type": "array", "items": { "type": "string" } },

"error": { "type": \["string", "null"\] }

}

}

},

"last_error": { "type": \["string", "null"\] }

}

}
