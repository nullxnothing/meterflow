// Code execution is disabled for security — Node.js vm module is not a sandbox.
// To re-enable, replace with isolated-vm or a containerized runner.

export async function executeCodeRunner({ code }) {
  return {
    output: '',
    returnValue: null,
    error: 'Code execution is temporarily disabled for security hardening. Use the AI chat to walk through code logic instead.',
    executionTimeMs: 0,
  };
}
