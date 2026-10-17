# Workflows

A pipeline an agent follows for each task (plan, build, checks, review, land), with gates that stop for you and a record of how each run went.

## Turn workflows on

Workflows is off until you turn it on: **Settings** (the gear), then **Features**.

- **Workflows** adds a **Workflow** tab to each agent and a **Workflows** button to the top bar.
- **Plan gate** (on by default): an agent waits for your approval of its plan before it edits.
- **Merge gate** (on by default): landing waits for an approved plan and seen review findings.
- The dial (**Economy**, **Balanced** by default, **Max**) sets how much care each task takes. See [The three dials](#the-three-dials).

Turning it off with runs open asks **Let them finish, then hide**, **Stop them now** or **Cancel**.

## What an agent does with a workflow

The default workflow is **Standard** (**Plan**, **Build**, **Audit**, **Land**) unless you pick another for the project. For one task the agent:

1. Tells the office it began a task, which opens a run.
2. Writes a plan to `.agent-world/plan.md` (goal, assumptions marked given or guessed, out of scope, open questions) and hands it in.
3. Waits for your approval, then builds.
4. Has any **check** steps run, and its branch reviewed against the plan (not at **Economy**).
5. Lands the branch when you ask it to.

A commit with no announced task gets a run marked **from a commit**; it has no workflow, so no plan hold and no track.

## Enforced and only asked

Announcing a task, handing in a plan, reporting steps and saying done are only asked of the agent. The app holds:

- Edits until the plan is approved: by a hook for Claude agents, by Agent World's plugin for agy agents. A shell command such as `sed -i` is caught at the commit instead.
- Commits until the plan is approved: by git, for every program, even with `--no-verify`.
- A merge into the base branch while the gate holds it: by git, for every program.
- Checks and the review: the app runs them.
- **Finish**: refuses unless the gate is met or you click **Land anyway**.

Limits:

- An agent that unsets git's environment variables or sets its own `core.hooksPath` gets past the git holds.
- Only a task's first round is held for its plan.
- With **Plan gate** off, nothing is held for a plan. At **Economy** an agent that submits no plan is not held.
- The **Merge into main** button in the Code tab applies none of the gates. Use **Finish this branch** (see [Code and preview](code-and-preview.md)).

## Follow a run: the track

While a run is open, a track sits above the agent's chat: its steps as stations, with the agent's figure on the one it has reached. A station is **met**, **met after trouble** (with a count of retries), **failed**, **here now**, **not yet** or **not asked**. A line beside it says what the run waits for, such as **needs your approval** or **ready to land: ask the agent**. The agent's **Workflow** tab shows the same track and a tile for each run this week.

## Approve a plan, checks and steps

- A **Plan gate** panel opens in the chat. Answer the open questions, then **Approve plan**, or **Request changes** and **Send back**. **Let name edit without approval** lifts the hold, and the run records it.
- A **check** step is a command the app runs in the agent's worktree, with a 5 minute limit. A project's commands first need **Approve and run** (or **Don't run**), and again after the file changes. A failing check goes back to the agent, up to two retries by default, then **Run again** or **Skip this check**.
- A **your approval** step waits for **Approve** or **Send back**.

## Land a branch

To land a branch, ask the agent to merge it. If the gate holds the merge, git refuses it, the agent is told to tell you why, and a band headed **Merge held** appears under the run track with a **Land held** marker. It lists what holds the merge, such as the plan not approved or **N audit findings have not been seen**. Then either:

- Tick each review finding as seen. When nothing holds the merge, ask the agent to merge again; no other word is needed.
- Click **Land anyway**. The branch as it is now lands once on the agent's next try.

**Not yet** puts the band away; the marker reads **Land held · not yet**, and clicking it brings the band back. **Finish this branch** shows the same rows.

![The run track with the Land held marker and the Merge held band](../images/merge-held.png)

A failed review never holds landing. Checks and steps that need you hold landing even with **Merge gate** off.

## The Workflows window

Click **Workflows** in the top bar. **Runs**: **7 days** or **30 days**. Two charts, **Workflows invoked** and **Stages followed**, sit over a ledger grouped as **Needs you**, **Still open**, **Landed with trouble**, **Landed clean** and **Stopped**.

![The Runs tab: two charts over the ledger](../images/runs.png)

**Insights**: a tile for each gate of each run, with the numbers under each column.

**Workflows**: the project's workflows with the chosen one's steps. To make one from a sentence, open a project, type it in **Describe a workflow to the builder** and click **Start with the builder**. The builder can only propose: its draft appears beside its chat, and you save it with **Save to** the project or **Save for everything**. File format and design: [docs/workflows-design.md](../workflows-design.md).

## The three dials

- **Economy**: the plan may be skipped for a one-sentence change; no review.
- **Balanced**: a plan every time; a small model reviews the branch.
- **Max**: also a larger reviewer and an intent check of your request against the plan.

The dial does not change an agent's own model.

Next: [Library and playbook](library-and-playbook.md)
