import { ScalekitClient } from '@scalekit-sdk/node';
import { ConnectorStatus } from '@scalekit-sdk/node/lib/pkg/grpc/scalekit/v1/connected_accounts/connected_accounts_pb';

async function main() {
  const envUrl = 'https://agentmesh.scalekit.dev';
  const clientId = 'skc_130664905920479750';
  const clientSecret = 'test_l3pP0WZJulgxxYkoKv1DHv851puc2s5cdWSgqZWaxioulAqMedNzNSd6UUbfKUZ7';

  console.log('Initializing ScalekitClient...');
  const scalekit = new ScalekitClient(envUrl, clientId, clientSecret);
  const actions = scalekit.actions;

  const connectionName = 'gmail';
  const identifier = 'user_123';

  console.log(`Getting or creating connected account for ${connectionName} / ${identifier}...`);
  try {
    const response = await actions.getOrCreateConnectedAccount({
      connectionName,
      identifier,
    });
    
    const connectedAccount = response.connectedAccount;
    console.log('Connected account ID:', connectedAccount?.id);
    console.log('Connected account status:', connectedAccount?.status);

    if (connectedAccount?.status !== ConnectorStatus.ACTIVE) {
      console.log(`${connectionName} is not active. Generating auth link...`);
      const linkResponse = await actions.getAuthorizationLink({
        connectionName,
        identifier,
      });
      console.log('🔗 Auth Link:', linkResponse.link);
    } else {
      console.log(`${connectionName} is active! Testing tool call...`);
      const toolResponse = await actions.executeTool({
        toolName: 'gmail_fetch_mails',
        connectedAccountId: connectedAccount?.id,
        toolInput: {
          query: 'is:unread',
          max_results: 1,
        },
      });
      console.log('Tool response:', JSON.stringify(toolResponse.data, null, 2));
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

main().catch(console.error);
