# Agent World workflow files

This page is for the case where the person uses **Agent World**
(https://github.com/hodkep/agent-world, Apache License 2.0), an open-source desktop app that runs
several coding agents. If you use Agent World, save the routine as a workflow file as well;
the format and limits are below. This page matches Agent World 0.9.2. If you do not use it,
skip this page: `WORKFLOW.md` already does the job.

## Where the file lives

- In a project: `.agent-world/workflows/<id>.json` inside the project folder.
- For every project: the `workflows` folder inside the app's own folder (the app's Workflows
  window shows where).
- The file name is the workflow's `id` plus `.json`; a mismatch is refused. A file over 100 KB is
  refused. The id `standard` replaces the built-in default for that project. A file with problems is
  listed with every problem named and is never picked for a task.

Prefer to let the person save it through the app's workflow builder (an agent that only proposes
drafts). If you write the file yourself, say which file you wrote so they can check it in the
Workflows window.

## The file

One JSON object, with these fields and no others (an unknown field is refused):

| Field | Required | Limit and meaning |
|---|---|---|
| `version` | yes | The number 1. |
| `id` | yes | Lowercase letters, digits and single dashes, up to 40 characters. |
| `name` | yes | A short title, up to 60 characters. |
| `when` | no | One sentence, up to 300 characters: which tasks it fits. |
| `steps` | yes | 1 to 12 steps, in the order they run. |

Each step is an object with these fields and no others:

| Field | Limit and meaning |
|---|---|
| `id` | Required. Lowercase letters, digits and dashes, up to 30 characters, unique in the file. |
| `kind` | Required. One of `plan`, `work`, `check`, `audit`, `approve`, `pr`, `merge`. |
| `name` | Up to 40 characters; shown on the step's card. |
| `brief` | Up to 600 characters: what the agent is told at this step. Write it as an instruction. |
| `gate` | Where the step stops; allowed values depend on the kind (below). |
| `start` | `auto` or `run`. With `run` nothing starts until the person presses Run. On plan, work, check, audit and pr steps. |
| `optional` | `true` or `false`. The agent may skip it itself and say why. On work, check, audit and approve steps. |
| `skippable` | `true` or `false`. Only the person can skip it. On work, check, audit, approve and pr steps. |
| `skills` | Up to 8 skill names, each up to 60 characters. On plan, work and pr steps. |
| `run`, `retries`, `model` | Accepted on check or audit steps but without effect: the app runs no commands. |

## Kinds and gates

- `plan`: the agent writes a plan for the person. Gates `auto` or `approve` (the person answers the plan before anything is built). The only step that keeps its gate.
- `work`: the agent does something and reports it (build, fix, notes, tests, its own review). Gates `auto` or `approve`.
- `check`, `audit`, `approve`: read as a `work` step. Only the kind's name changes.
- `pr`: the push of the agent's branch, held until the person has been asked, and the pull request. A push that goes through ends the run, so put it last, or put a `work` step that starts on Run right before it when more steps must follow (a tag, a publish).
- `merge`: the person lands the work with their own click. Use `pr` when the work goes through a pull request.

A step asks the person once, before it starts, if its kind is `approve`, its gate is `approve`, or its
start is `run`; all three mean "press Run first". Prefer `start: "run"` to say it plainly.

## What it cannot do

- It holds no command and runs no tests, linters or builds. Say in `brief` what the agent should do.
- Only some holds are enforced: edits and commits before a plan is approved, edits and commits
  before Run on a plan or work step that starts on Run, the push of a `pr` step and the merge of a
  `merge` step. Everything else is only asked, such as reporting steps. A shell command that edits
  a file is not seen by the edit hook; it is caught when the agent commits.
- Steps run in the order listed: no branches, loops, conditions or parallel steps. No more than 12.
- The pull request, its CI and the merge on the hosting site are not the app's.
- A task follows the workflow it asked for, else the project's default, else Standard. `when` helps
  the agent choose; it does not force it.

## Check the file before saving

By hand: valid JSON with no comments or trailing commas; `version` is 1; `id` equals the file name
without `.json`; unique step ids; no field outside the lists; each text within its limit. Then open
the Workflows window: a file that does not read is listed with every problem named, for example
"Step 3 ("tests"): "gate" for a check step must be auto, pass or approve." and "The id "x" does not
match the file name "y.json". Rename the file or the id." Fix every problem and read it again.

## Two examples

Both load as written.

### bug-fix.json

```json
{
  "version": 1,
  "id": "bug-fix",
  "name": "Bug fix",
  "when": "A defect with a known symptom: something that used to work, or should, and does not.",
  "steps": [
    {
      "id": "plan",
      "kind": "plan",
      "gate": "approve",
      "brief": "Name the symptom and the likely cause. Say which files you will change and what you will not touch."
    },
    {
      "id": "fix",
      "kind": "work",
      "name": "Fix, test first",
      "brief": "Write a test that shows the bug and fails for the right reason, then make it pass with the smallest change. Run only the tests for the code you touched."
    },
    {
      "id": "review",
      "kind": "work",
      "name": "Review",
      "brief": "Read your own branch against the plan. Report anything that is outside it, and fix what is wrong before the next step."
    },
    {
      "id": "pr",
      "kind": "pr",
      "name": "Pull request",
      "start": "run",
      "brief": "Open the pull request with a short description of the symptom, the cause and the fix."
    }
  ]
}
```

### release.json

Steps that leave the machine (push, tag, publish) start on Run. The Push step before the pull
request keeps the run going after the push.

```json
{
  "version": 1,
  "id": "release",
  "name": "Release",
  "when": "Cutting a new version of the project: bump the version, build, tag and publish.",
  "steps": [
    {
      "id": "plan",
      "kind": "plan",
      "gate": "approve",
      "brief": "Say which version this is, what is in it, and what you will check before it goes out."
    },
    {
      "id": "notes",
      "kind": "work",
      "name": "Release notes",
      "brief": "Write the release notes for this version from the merged changes since the last one. Plain language, one line per change a user would notice."
    },
    {
      "id": "version",
      "kind": "work",
      "name": "Bump the version",
      "brief": "Set the new version where the project keeps it and add the notes to the changelog. Commit on your own branch."
    },
    {
      "id": "build",
      "kind": "work",
      "name": "Build",
      "brief": "Build the project the way its own docs say and report whether it succeeded. Do not publish anything yet."
    },
    {
      "id": "push",
      "kind": "work",
      "name": "Push",
      "start": "run",
      "brief": "Push the branch with the version bump and the notes."
    },
    {
      "id": "pr",
      "kind": "pr",
      "name": "Release pull request",
      "brief": "Open the pull request for the version bump and the notes."
    },
    {
      "id": "tag",
      "kind": "work",
      "name": "Tag",
      "start": "run",
      "optional": false,
      "brief": "After the pull request is merged, tag the merge commit with the version."
    },
    {
      "id": "publish",
      "kind": "work",
      "name": "Publish",
      "start": "run",
      "brief": "Publish the release the way the project does and report where it can be found."
    },
    {
      "id": "report",
      "kind": "work",
      "name": "Report",
      "brief": "Tell the person what was released, with the version, and anything left to do by hand."
    }
  ]
}
```
