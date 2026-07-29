export const ENVIRONMENT_NAME_APPROVAL_INPUT = 'environment_name';

export function requestedEnvironmentApprovalInputs({
  platform,
  environment,
  explicitEnvironmentName,
}) {
  if (platform !== 'win32' || environment?.name || explicitEnvironmentName) return [];
  return [ENVIRONMENT_NAME_APPROVAL_INPUT];
}

export function guidanceSupportsApprovalInput(guidance, inputName) {
  const supported = guidance?.supported_approval_inputs;
  return Boolean(
    supported
    && typeof supported === 'object'
    && !Array.isArray(supported)
    && Object.hasOwn(supported, inputName),
  );
}

export function requireApprovedEnvironmentName(granted) {
  const name = granted?.approval_values?.environment_name;
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('token grant did not include approval_values.environment_name');
  }
  return name;
}
