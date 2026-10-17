# Workflows

A pipeline an agent follows for each task: plan, build, checks, review, land.

## Turn workflows on

Off by default: **Settings**, then **Features**.

- **Workflows** adds a **Workflow** tab to each agent and a top bar button.
- **Plan gate** (on by default): an agent waits for your approval of its plan before it edits.
- **Merge gate** (on by default): landing waits for an approved plan and seen findings.
- The dial sets how much care each task takes: [The three dials](#the-three-dials).

## What an agent does with a workflow

The default is **Standard** (**Plan**, **Build**, **Audit**, **Land**), or your pick for the project. For one task the agent:

1. Tells the office it began a task, which opens a run.
2. Writes a plan to `.agent-world/plan.md` (goal, assumptions, out of scope, questions).
3. Waits for your approval, then builds.
4. Has any **check** steps run, and its branch reviewed against the plan (not at **Economy**).
5. Lands the branch when you ask.

A commit with no announced task gets a run marked **from a commit**: no workflow, plan hold or track.

## Enforced and only asked

Announcing a task, handing in a plan, reporting steps and saying done are only asked. The app holds:

- Edits until the plan is approved: by a hook for Claude agents, by a plugin for agy agents. A shell command such as `sed -i` is caught at the commit instead.
- Commits until the plan is approved, and a merge into the base branch while the gate holds it: by git, for every program, even with `--no-verify`.
- Checks and the review: the app runs them.
- **Finish**: refuses unless the gate is met or you click **Land anyway**.

Limits:

- An agent that unsets git's environment variables or sets its own `core.hooksPath` gets past the git holds.
- Only a task's first round is held for its plan, and not with **Plan gate** off.
- The **Merge into main** button in the Code tab applies no gate. Use **Finish this branch** ([Code and preview](code-and-preview.md)).

## Follow a run: the track

While a run is open, a track sits above the agent's chat: its steps as stations, with the agent's figure on the one it has reached. A station is **met**, **met after trouble** (with a retry count), **failed**, **here now**, **not yet** or **not asked**. The agent's **Workflow** tab shows it with a tile for each run this week.

## Approve a plan, checks and steps

- A **Plan gate** panel opens in the chat. Answer the open questions (a plan with none says the agent asked no questions), click **＋ Add a note for name** for a note that goes with the approval, then **Approve plan**, or **Request changes** and **Send back**. **Let name edit without approval** lifts the hold.
- A **check** step is a command the app runs in the agent's worktree, with a 5 minute limit. A project's commands need **Approve and run** (or **Don't run**) first, and again after the file changes. A failing check goes back to the agent, twice by default, then **Run again** or **Skip this check**.
- A **your approval** step waits for **Approve** or **Send back**.

## Land a branch

Ask the agent to merge the branch. If the gate holds it, git refuses, the agent tells you why, and a band headed **Merge held** appears under the run track with a **Land held** marker. It lists what holds it, such as an unapproved plan or **N audit findings have not been seen**. Then either:

- Tick each review finding as seen, then ask the agent to merge again.
- Click **Land anyway**. The branch lands once, on the agent's next try.

**Not yet** puts the band away; click the marker, now **Land held · not yet**, to bring it back.

![The Merge held band under the run track](../images/merge-held.png)

A failed review never holds landing. Checks and steps that need you hold it even with **Merge gate** off.

## The Workflows window

The **Workflows** button in the top bar opens it.

- **Runs**: for **7 days** or **30 days**, two charts (**Workflows invoked**, **Stages followed**) over a ledger grouped as **Needs you**, **Still open**, **Landed with trouble**, **Landed clean** and **Stopped**.
- **Insights**: a tile for each gate of each run.
- **Workflows**: the project's workflows, the chosen one's steps and its **History**: what was saved to it through the builder.

![The Runs tab](../images/runs.png)

## Make or change a workflow

1. Type a sentence in **Describe a workflow to the builder** and click **Start with the builder**, or click **Open the builder** to start empty. To change a saved one, click **Edit with the builder**: a fresh chat starts with it as the draft.
2. The builder only proposes. Talk to it, or edit the draft: names, briefs, skills, a check's command, **Tries** and stop, and steps (**▲ ▼**, **✕**, **＋ Add step**). **You edited N things** counts your changes; **Undo edits** goes back to the proposal.
3. Saving waits while the draft has a problem. Click **Save to** the project, or **Save for everything**; saving approves exactly the commands the draft lists.

![The builder's draft with one step renamed by hand](../images/workflow-builder.png)

## A run and its todo

A run begun while its agent is on a [todo](todos.md) belongs to that task:

- The **Runs** ledger shows a `todo#N` chip. Click it to open the task.
- The task's **Workflow run** section says how the run stands, in the ledger's own words (such as **still open**). Click it to open the run.
- Finishing the run finishes the task, if the agent has not.

![A task and its Workflow run](../images/todo-run.png)

## The three dials

- **Economy**: the plan may be skipped for a one-sentence change; no review.
- **Balanced** (default): a plan every time; a small model reviews the branch.
- **Max**: also a larger reviewer, and a check of your request against the plan.

Next: [Library and playbook](library-and-playbook.md)
