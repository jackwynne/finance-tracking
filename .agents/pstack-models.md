# pstack model configuration

Luna handles lookup and summary roles. Implementation, reasoning, judgment, and review inherit the active parent model, including Astra when selected.

User-selected models take precedence. These role mappings override inline model defaults in local skills and playbooks. Read the active delegation tool schema before spawning. `inherit-parent` and `auto` mean omit the model override; they are not model IDs. Preserve the current reasoning effort unless the task or user calls for a change, and pass effort separately only when the tool supports it.

If a configured model is unavailable, inherit the parent and report the substitution. If the user explicitly requires that exact model or a multi-model comparison, report the missing capability instead of claiming an equivalent run. Do not install tools or create a configuration PR just to work around an unavailable default. Schedule workers within the session's concurrency limit. With no delegation capability, perform the work locally and report any requested independent review that could not run.

feature, refactoring: inherit-parent
bug-fix: inherit-parent
perf-issue: inherit-parent
hillclimb: inherit-parent
judgment and prose: inherit-parent
hardest tasks: inherit-parent
how explorer: gpt-5.6-luna
how explainer: inherit-parent
how critics: inherit-parent, gpt-5.6-luna
why investigators: gpt-5.6-luna
why synthesizer: inherit-parent
reflect tooling: inherit-parent
reflect judgment, divergent, synthesizer: inherit-parent
arena runners: inherit-parent, inherit-parent
arena cross-judge pool: inherit-parent
swarm workers: gpt-5.6-luna
architect runners: inherit-parent, inherit-parent
interrogate reviewers: inherit-parent, gpt-5.6-luna
