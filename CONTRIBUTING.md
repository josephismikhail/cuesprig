# Contributing to Cuesprig

Create a feature branch and open a pull request against `main`. Keep each commit focused on one change. Include the reason for the change and describe the behavior you verified. For browser integration changes, identify the platform, the editor screen, and the interaction you tested. Use fictional data in screenshots.

Run `npm run check` and `npm test` before opening a pull request. The **Tests** workflow runs both commands and attaches a built extension to the run. GitHub can squash merge a PR once tests pass and review conversations are resolved. Dependabot opens weekly PRs for updates to GitHub Actions. The app currently has no npm runtime dependencies.

## Repository administration

The initial repository needs a `main` branch with the Tests workflow. Enable squash merges, then open a pull request and verify that its `test` check runs. On GitHub, require pull requests, the `test` check with branches up to date, resolved conversations, and linear history. Disable force pushes and deletion. The configuration permits solo maintenance by requiring zero approving reviews. Adjust that count when additional maintainers can review changes.

For a new repository, a maintainer with GitHub CLI admin access can apply the checked-in settings after verifying the check name. The API replaces the branch’s existing protection settings, so review existing rules before using it on a configured repository.

```sh
gh api --method PUT repos/OWNER/cuesprig/branches/main/protection --input .github/main-protection.json
gh api repos/OWNER/cuesprig/branches/main/protection
```

Keep release tags on tested `main` commits. A tag such as `v0.2.0` must match the package and extension versions. The release workflow tests and publishes the ZIP and its SHA-256 checksum.
