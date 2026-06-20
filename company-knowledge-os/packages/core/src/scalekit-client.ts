import { ScalekitClient } from '@scalekit-sdk/node';
import 'dotenv/config';

// Ensure required environment variables exist
if (!process.env.SCALEKIT_ENVIRONMENT_URL || !process.env.SCALEKIT_CLIENT_ID || !process.env.SCALEKIT_CLIENT_SECRET) {
  console.warn(
    'Scalekit environment variables (SCALEKIT_ENVIRONMENT_URL, SCALEKIT_CLIENT_ID, SCALEKIT_CLIENT_SECRET) are missing. ' +
    'Scalekit-powered connectors may fail to initialize properly.'
  );
}

// Initialize the singleton client
export const scalekit = new ScalekitClient(
  process.env.SCALEKIT_ENVIRONMENT_URL || '',
  process.env.SCALEKIT_CLIENT_ID || '',
  process.env.SCALEKIT_CLIENT_SECRET || ''
);

export const scalekitActions = scalekit.actions;
