export function enforceNoProdSecretsInEnv() {
  if (process.env.NODE_ENV === 'production') {
    // List of keys that are not allowed in process.env in production
    const prohibitedKeys = [
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
      'GEMINI_API_KEY',
      'E2B_API_KEY',
      'LANGFUSE_PUBLIC_KEY',
      'LANGFUSE_SECRET_KEY',
    ];

    const violations = prohibitedKeys.filter(key => process.env[key] !== undefined);
    
    if (violations.length > 0) {
      throw new Error(
        "[Security] Static .env files containing production secrets are forbidden. " +
        `The following keys were found in process.env: ${violations.join(', ')}. ` +
        "Please use SecretManager in production."
      );
    }
  }
}
