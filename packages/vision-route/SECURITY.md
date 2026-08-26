# Security and permission boundary

`dsh-vision-proxy-route` runs inside the DSH Host process and has the following
bounded capabilities:

- **Files and attachments**: obtains only image bytes referenced by the current
  request or an explicit bounded follow-up through the injected DSH
  `attachments` service. It does not enumerate attachment storage or directly
  write files.
- **Network**: outbound HTTPS only to
  `https://open.bigmodel.cn/api/paas/v4/chat/completions`; selected image bytes
  and the related user question are sent to that service. The configured target
  provider separately handles the transcribed text through normal DSH routing.
- **Credentials**: reads `GLM_API_KEY` or `ZHIPU_API_KEY`. On Windows only, when
  the process environment is missing the key, it invokes
  `reg query HKCU\\Environment /v GLM_API_KEY` with a fixed argv array. It does
  not use a shell string, log the key, persist it, or inject it into the target
  provider request.
- **DSH/Profile**: adds only the `dsh-vision-proxy-route` entry and a separately
  named provider route. Runtime code does not write a Profile, mutate
  Loader/Fiber state, or disable, replace, shadow, install, or import an
  `@deepseek-ai/*` component.
- **Lifecycle and dependencies**: no `preinstall`, `install`, `postinstall`, or
  `prepare` script and no npm runtime dependency.

Verified evidence is limited to package tests plus disposable Web Profile
install, config composition, cold start, and uninstall on DSH `0.1.0-rc.8`,
`0.1.1-rc.1`, and `0.1.1-rc.2`. Rollback, a real user Profile, Windows runtime,
an image request with a real GLM key, and an independent security audit remain
unverified. These are separate gates and must not be inferred from the partial
evidence above.
