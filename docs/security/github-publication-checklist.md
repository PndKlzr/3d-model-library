# GitHub Publication Checklist

Use this checklist immediately before or after changing the repository visibility to public. These
settings live on GitHub and cannot be enforced by files in the repository alone.

## Repository Settings

- Keep Issues enabled so bug reports and feature requests use the checked-in templates.
- Enable Private vulnerability reporting under Security > Code security and analysis.
- Enable Dependabot alerts and security updates.
- Enable Secret scanning and Push protection when they are available for the repository.
- Confirm Actions can run workflows from this repository with read-only default token permissions.

## Default Branch Protection

Create a ruleset for the default branch with these protections:

- Require a pull request before merging.
- Require status checks to pass before merging.
- Select the `Windows verification` check from the CI workflow.
- Require branches to be up to date before merging.
- Block force pushes and branch deletion.
- Allow an administrator bypass only for repository recovery.

## First Public Check

- Open the Actions tab and confirm the CI workflow completes successfully.
- Open the Security tab and confirm there are no unresolved dependency or secret alerts.
- Check the public README screenshots and issue templates in a signed-out browser session.
- Confirm the repository contains no model files, metadata backups, cache files, logs, or installers.
- Keep the private history bundle outside the repository and never attach it to an issue or release.

## Future Binary Releases

Do not advertise an unsigned development build as a production release. Before distributing an
installer, repeat the security checklist and add packaging, code signing, checksums, Electron fuses,
and ASAR integrity verification.
