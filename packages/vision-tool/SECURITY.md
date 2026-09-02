# Security and permission boundary

`dsh-vision-free-eyes` runs inside the DSH Host process and has the following
bounded capabilities:

- **Files**: read-only access to the single absolute image path supplied to the
  `vision` Tool. It rejects directories, relative paths, empty files, oversized
  files, and content whose magic bytes are not a supported image format.
- **Network**: outbound HTTPS only to
  `https://open.bigmodel.cn/api/paas/v4/chat/completions`; selected image bytes
  and the user's image question are sent to that service.
- **Credentials**: reads `GLM_API_KEY`, `ZHIPU_API_KEY`, or explicitly configured
  environment-variable names. On Windows only, when the process environment is
  missing the key, it invokes `reg query HKCU\\Environment /v GLM_API_KEY` with a
  fixed argv array. It does not use a shell string, log the key, persist it, or
  return it in Tool output.
- **DSH/Profile**: adds only the `dsh-vision-free-eyes` entry and the `vision`
  Tool. Runtime code does not write a Profile, mutate Loader/Fiber state, or
  disable, replace, shadow, install, or import an `@deepseek-ai/*` component.
- **Lifecycle and dependencies**: no `preinstall`, `install`, `postinstall`, or
  `prepare` script and no npm runtime dependency.

Verified evidence is limited to package tests plus disposable Web Profile
install, config composition, cold start, and uninstall on DSH `0.1.0-rc.8`,
`0.1.1-rc.1`, and `0.1.1-rc.2`. Rollback, a real user Profile, Windows runtime,
an image request with a real GLM key, and an independent security audit remain
unverified. These are separate gates and must not be inferred from the partial
evidence above.
