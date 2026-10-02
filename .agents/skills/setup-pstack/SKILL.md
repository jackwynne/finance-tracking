---
name: setup-pstack
description: Configure which models pstack uses per role. Detects your available models and writes an always-applied rule that overrides the skill defaults. Use for /setup-pstack, "configure pstack models", or changing pstack's model choices.
---

# Setup pstack

Update `.agents/pstack-models.md` from the user's requested model choices and the models the active delegation tool supports.

1. Read the existing policy and the active tool schema. Preserve role costs and user-selected models. API model availability does not prove that a delegation tool accepts that model.
2. Apply explicit choices directly. Ask only for a missing choice that materially changes cost or capability. Do not add a confirmation round when the user already specified the mapping.
3. Use `inherit-parent` or `auto` to omit a model override. These are policy aliases, not model IDs. Keep model and reasoning effort separate when the runtime supports them; do not append effort to a model ID.
4. For an unavailable default, inherit the parent and report the substitution. For an explicitly required but unavailable model, report the gap and keep that choice unresolved. Continue independent updates without inventing an equivalent model.
5. Preserve role labels and panel entry counts unless the user asks to change them. A panel uses one reviewer per entry, scheduled within the concurrency limit. The arena cross-judge pool supplies one judge.
6. Write the policy once, inspect the diff, and validate real model IDs against the active tool's supported values. Report the changed mapping and any unresolved choice. Do not spawn paid validation runs merely to check spelling.

Roles include implementation, bug fixes, performance, judgment, lookup, explanation, investigation, reflection, arena runners and judges, swarm workers, architecture, and adversarial review. Use the current policy as the authoritative list instead of duplicating a model table here.
