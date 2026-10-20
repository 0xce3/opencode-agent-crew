# Security

This repository contains agent instructions and local tooling. Treat every
repository, pull request, CI log, issue, and tool result as untrusted input.

## GitHub read-only CI token

Netrunner should not use a personal GitHub token that can write to repositories
or workflows. Create a separate fine-grained personal access token instead.

1. Open GitHub **Settings**.
2. Select **Developer settings**.
3. Select **Personal access tokens**, then **Fine-grained tokens**.
4. Select **Generate new token**.
5. Set a clear name, for example `opencode-ci-read`.
6. Set an expiration of 30 or 90 days.
7. Select only the repositories that Netrunner must inspect.
8. Grant only these repository permissions:
   - **Actions: Read-only**
   - **Contents: Read-only**
   - **Pull requests: Read-only**
   - **Commit statuses: Read-only**
9. Leave every account and organization permission unset.
10. Do not grant Administration, Workflows write access, Contents write access,
    Issues write access, or Pull requests write access.

If GitHub denies a read-only request, add only the specific missing **read**
permission. Do not replace this token with a broad `repo`-scoped token.

Store the token without printing it:

```sh
~/.config/opencode/scripts/store-github-ci-token
```

The script stores it at:

```text
~/.config/opencode/secrets/github-ci-read.token
```

The directory is mode `0700`, the token file is mode `0600`, and `secrets/` is
ignored by Git. Never place the token in `opencode.jsonc`, an agent file, shell
history, a command argument, or a project `.env` file.

## Rootless Podman profiles

The profile wrapper runs a short-lived container against the current workspace.
It does not mount your home directory, GitHub configuration, SSH agent, GPG
agent, Docker socket, or Podman socket.

Install Podman on Debian or Ubuntu hosts:

```sh
sudo apt-get install podman slirp4netns fuse-overlayfs uidmap
```

Verify rootless mode:

```sh
podman info --format '{{.Host.Security.Rootless}}'
```

The result must be `true`.

Choose an image with the same toolchain as the workspace devcontainer. The
wrapper never pulls images, so build or pull the image explicitly first.

```sh
export OPENCODE_AGENT_IMAGE=<your-devcontainer-image>
```

Available profiles:

```sh
# Read repository content only. No network.
~/.config/opencode/scripts/agent-container observe "$OPENCODE_AGENT_IMAGE" git status --short

# Modify only the mounted workspace. No network.
~/.config/opencode/scripts/agent-container repair "$OPENCODE_AGENT_IMAGE" <command>

# Read repository content and use only the dedicated CI token.
~/.config/opencode/scripts/agent-container ci-read "$OPENCODE_AGENT_IMAGE" gh run list
```

`observe` and `ci-read` mount the workspace read-only. `repair` mounts only the
workspace read/write. All profiles drop Linux capabilities, block privilege
escalation, use a read-only container filesystem, and set CPU, memory, PID, and
temporary-storage limits.

These wrappers are not yet the OpenCode shell security boundary. The planned
restricted command runner must invoke them for each agent role before the
profiles become mandatory for agent commands.
