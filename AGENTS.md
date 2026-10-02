<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Project skills

- Shared skills are in [.agents/skills](.agents/skills). Use the skill that fits the task and read only the supporting references it needs. This project's Convex guidance and development commands take precedence over skill examples.
- For delegated workflows, read [.agents/pstack-models.md](.agents/pstack-models.md) and use the active runtime's supported tools and models. User-selected models take precedence.
- Apply [TypeScript best practices](.agents/skills/typescript-best-practices/SKILL.md) when reading or editing TypeScript. Its supporting [type system discipline](.agents/skills/principle-type-system-discipline/SKILL.md) and [boundary discipline](.agents/skills/principle-boundary-discipline/SKILL.md) skills are included locally.
- Apply [unslop](.agents/skills/unslop/SKILL.md) to app copy, documentation, and responses.
- The `anti-slop` Oxlint plugin is in [tools/oxlint/anti-slop](tools/oxlint/anti-slop) and runs with `pnpm lint`. Verify rule changes with `pnpm test:lint`.
- The transaction and portfolio review and implementation plan is in [docs/improvement-plan.html](docs/improvement-plan.html).
