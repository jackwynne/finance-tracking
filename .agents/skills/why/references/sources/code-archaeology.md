# Code archaeology (git and in-repo evidence)

## What this source contains

- Commit history, including messages, dates, authors, and diffs
- Pull request descriptions, review comments, and discussions through `gh`
- Inline comments, TODOs, FIXMEs, and deprecation notes
- Architectural decision records kept in the repository
- Tests whose names and assertions encode motivating edge cases
- Files modified together in the same commits
- Changelog entries and repository release notes
- Issue or ticket IDs mentioned in commit messages and pull request bodies

## How to search it

Expand the seed commit list:

```bash
git log --follow --oneline -- <file>
git log -S '<exact_string_from_code>' -- <file>
git log -G '<regex>' -- <file>
git blame -L <start>,<end> <file>
git show <hash>
git log <old>..<new> -p -- <file>
```

For each substantive commit, pull the pull request context:

```bash
git log -1 --format=%B <hash>
gh pr view <number> --json title,body,author,createdAt,mergedAt,labels,closingIssuesReferences,comments,reviews,files
```

Look for repository context:

```bash
rg -l -i 'architecture.decision' --glob '*.md'
rg -n -C2 '(TODO|FIXME|HACK|XXX|NOTE)' <target_file>
rg -l '<symbol>' --glob '*test*'
```

## What good evidence looks like

- A pull request description that explains the problem being solved
- A review thread where alternatives were debated
- An inline comment explaining a non-obvious constraint
- A test name or assertion that records a motivating edge case
- A commit message that references a ticket or incident
- A changelog entry describing the user-visible rationale

## Common pitfalls

- **Squash merges.** Individual branch commits may be absent. Fall back to the pull request body and comments.
- **Misleading commit messages.** Read the diff before trusting the subject.
- **Copied patterns.** Trace the pattern to its first repository use before assigning intent to the current author.
- **Automated commits.** Dependency bots and backports rarely contain useful rationale.
- **Code as evidence of intent.** Code proves mechanics. Use commits, pull requests, comments, tests, and docs to support claims about intent.

## What to return

For every relevant commit, pull request, comment, test, or document, return:

- the exact text or an accurate short paraphrase
- the commit hash, pull request number, or file and line
- author and date when available
- whether the evidence is direct or circumstantial
