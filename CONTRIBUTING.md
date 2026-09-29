# Contributing to 3D Model Library

Thanks for helping improve the project. Bug reports, workflow ideas, documentation fixes, and code contributions are welcome.

## Before Opening an Issue

- Search existing issues to avoid duplicates.
- Confirm the problem still happens on the latest development branch.
- Remove personal paths, usernames, model names, notes, tags, and slicer configuration from screenshots and logs.
- Do not upload private model libraries, paid models, slicer executables, access tokens, or application data.

Security vulnerabilities should follow [SECURITY.md](SECURITY.md) instead of being reported publicly.

## Bug Reports

Please include:

- Windows version;
- app commit or version;
- clear reproduction steps;
- expected and observed behavior;
- affected file format, without uploading the model unless its license allows redistribution;
- sanitized logs or screenshots when useful.

## Feature Requests

Describe the workflow problem first, then the proposed behavior. Screenshots or examples from other applications are useful when they do not contain private information.

## Code Contributions

1. Fork the repository and create a focused branch.
2. Install dependencies with `npm ci`.
3. Keep file operations constrained to the active library.
4. Add or update tests for behavioral changes.
5. Run the required checks:

```powershell
npm test
npm run build
npm audit
```

6. Open a pull request explaining the problem, solution, and verification performed.

By submitting a contribution, you agree that it may be distributed under the repository's [GPL-3.0 license](LICENSE).
