---
name: ai-coding-workflow
description: Gives an AI coding agent a repeatable workflow for every task in a repository: explore, plan, approval, test-first build, verification, review against the plan, pull request and a release checklist. Use it when someone asks for an AI workflow, an approval step before the agent changes code, a release checklist, or a routine their agent keeps forgetting.
---

# An AI coding workflow for this repository

You are going to leave a short routine in this repository that any coding agent
(this one, or another the person uses) reads at the start of each task. It says
what to do, in what order, and when to stop and ask the person. You will write it
with the person, not for them.

Do the work in the order below. Keep what you write short: a routine that is
long gets skipped.

## 1. Ask four short questions

Ask them one at a time, and wait for each answer. If the repository already
answers one (a contributing guide, a CI file, a release script), say what you
found and ask only whether it is still true.

1. **What repeats?** What kind of work do they hand to an agent again and again
   (bug fixes, features, dependency updates, releases, docs)? One routine per
   kind is fine; start with the most common.
2. **Where do they want to be asked?** Before the agent changes anything? Before
   it pushes? Before it publishes? Everything else the agent should do without
   asking.
3. **What does done mean?** Tests pass? A reviewer approves? The change is
   merged? A release is live? Get one sentence.

4. **What command proves a change works?** The test, build or run command the
   agent must use to check its own work. Use one you have seen in this
   repository, and write it into `WORKFLOW.md`.

Do not invent answers. If the person says "you decide", propose one and ask them
to confirm it.

## 2. Write the routine where the agent will read it

First show the person the routine and the pointer text below, and name the files
you would change. Write nothing until they say yes. Then create a file named
`WORKFLOW.md` at the repository root with the routine (the steps below, filled in
with what the person told you), and make sure every agent finds it by adding the
same five-line pointer to each of the places agents read:

- `AGENTS.md` (read by Codex, Copilot's coding agent and others);
- `CLAUDE.md` (read by Claude Code);
- a Cursor rule file in `.cursor/rules` that is always applied.

If one of those files already exists, add the pointer at the top and leave the
rest alone. If it does not exist, create it with just the pointer. The pointer
reads:

> Before you start any task, read WORKFLOW.md in the repository root and follow
> it. Do the steps in order. Stop and ask the person wherever it says to ask.
> Report each step when you finish it. If a step cannot be done, say so and why;
> never skip it silently. If the routine and the person's request disagree, ask.

Say aloud that you added it to all three, so the person knows which files changed.

## 3. The steps to put in WORKFLOW.md

Write each step in plain words with three things: when to stop and ask, what
counts as done, and what to report. Adapt the wording to the person's answers.
Drop a step the person does not want; do not add steps they did not ask for.

**Explore.** Before planning, read the code the task touches and look for what
already exists (helpers, types, tests, conventions). *Stop and ask:* never.
*Done:* you can say what exists and what you would reuse. *Report:* two or three
lines.

**Plan.** State the goal in one line, what you assume, what you will not touch,
and any question only the person can answer. List the files you expect to change.
*Stop and ask:* before any file is edited, unless the person said planning needs
no approval. *Done:* the person has approved the plan. *Report:* the plan, in
under fifteen lines.

**Build, test first.** For each behaviour, write a test that fails for the right
reason, then the smallest change that makes it pass. Run only the tests for the
code you touched while working. *Stop and ask:* if the plan turns out to be
wrong, or the work grows past what was approved. *Done:* the new tests pass and
the ones that passed before still pass. *Report:* what you changed and which
tests you ran, with their result.

**Verify.** Run the thing, not only the tests: start it, use the change like a
user would, and look at the result. Check one neighbouring feature. *Stop and
ask:* never, unless something broke that you cannot fix. *Done:* you saw it work,
or you said plainly what you could not run. *Report:* what you checked and what
you saw. Never say "works" on the strength of reading the code.

**Review against the plan.** Read your own change as if someone else wrote it:
does it match the plan, the repository's conventions and the person's request?
Is anything in it that nobody asked for? Does it handle input it did not expect,
and does it leave secrets, files or processes in a state it should not? *Stop and
ask:* if the review finds something you would not ship. *Done:* findings fixed or
listed. *Report:* the findings, honestly, including the ones you left.

**Hand over.** Commit in small steps with messages in the repository's own style.
Push and open a pull request only when the person has said to. Never push to a
shared branch unasked. *Stop and ask:* before pushing, and before any step that
others will see. *Done:* the change is where the person said it should be.
*Report:* the branch, the commit list and the pull request link.

**Release (only if the person's answer to question 1 includes releases).** See the
checklist in the next section. *Stop and ask:* before tagging and before
publishing; these cannot be taken back quietly.

## 4. Release checklist

Put this under the Release step, adapted to how the project releases:

- [ ] Version: decide the number and change it everywhere the project keeps it.
- [ ] Notes: write the release notes from the changes since the last release, one
      plain line per change a user would notice.
- [ ] Build: build the project the way its own documentation says, and report the
      result.
- [ ] Tag: create the tag on the merged commit only after the person agrees.
- [ ] Publish: publish the way the project does, only after the person agrees.
- [ ] Verify: confirm the published thing can be found and used, from outside the
      machine if you can.
- [ ] Rollback: write one line saying how to undo this release if it is bad.

## 5. Confirm it works with a dry run

Do not finish after writing the files. Offer a dry run on a tiny task (a typo in a
comment, a one-line doc change) and follow `WORKFLOW.md` exactly while the person
watches. Check three things together: you stopped where it says to ask, you
reported each step, and nothing outside the plan changed. Then ask what felt
slow or wrong, and fix the routine, not just the run.

## 6. Common mistakes

- **Asking too often.** If you stop at every step, the person will stop reading.
  Ask only where a wrong move is costly or cannot be undone.
- **Naming commands that do not exist.** Do not write a command, script or tool
  into the routine unless you have seen it in this repository. Describe what to
  do in words, and let the agent find the project's own way.
- **Skipping the plan** because the task looks small. The plan is how the person
  catches a wrong assumption before it costs anything.
- **Reporting "done" on a step you did not run.** Say what you skipped.
- **Writing a long routine.** One page. After a week of use, delete any rule
  nobody followed or needed.
- **Different rules in different files.** The three agent files only point to
  `WORKFLOW.md`; the routine lives in one place.

## 7. If the person uses Agent World

Agent World is an open-source desktop app that runs several coding agents and can
hold the routine as a workflow file that it follows and enforces in part. If the
person uses it, read `references/agent-world.md` and offer to save the routine in
that format as well. If they do not use it, skip that file.

This skill is also published under the Apache License 2.0 at https://github.com/hodkep/agent-world/tree/main/docs/skills/ai-coding-workflow
