# Security

Agent World starts shells and the command line programs of your coding agents (Claude Code, Antigravity) on your computer, serves a local message box and hook address to them on `127.0.0.1`, and holds a bearer token for each agent to use it. A flaw that lets another program, a web page or an agent act beyond what you allowed is a serious one, and we want to hear about it.

## Reporting a problem

**Do not open a public issue.** Use GitHub's private reporting: on the repository's **Security** tab, choose **Report a vulnerability**. Say what you found, how to reproduce it, and what it lets someone do. You will get an answer as soon as a maintainer can read it, and we will tell you when it is fixed.

## What is in scope

- Anything that lets something other than the agent it was issued to use an agent's token, or call the local message box or hook address without one.
- A way for a page shown in the Preview tab to reach the app, your files or your agents' credentials.
- A way for text from a tool, a file or a web page to make the app run something the person did not allow.
- Secrets or credentials written where they should not be.

Agents themselves run with the permissions you give them in their own settings; an agent doing what its permission mode allows is not a vulnerability.

## Supported versions

Only the latest release.
