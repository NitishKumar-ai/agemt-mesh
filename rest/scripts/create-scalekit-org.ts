/**
 * Script to create a Scalekit organization
 * Run with: pnpm --filter rest exec tsx scripts/create-scalekit-org.ts
 */
import { ScalekitClient } from '@scalekit-sdk/node';
import { config } from 'dotenv';
import { join } from 'path';

// Load .env from workspace root
config({ path: join(process.cwd(), '..', '.env') });

async function createOrganization() {
  const envUrl = process.env.SCALEKIT_ENVIRONMENT_URL;
  const clientId = process.env.SCALEKIT_CLIENT_ID;
  const clientSecret = process.env.SCALEKIT_CLIENT_SECRET;

  if (!envUrl || !clientId || !clientSecret) {
    console.error('❌ Missing Scalekit credentials in .env file');
    console.error('Required: SCALEKIT_ENVIRONMENT_URL, SCALEKIT_CLIENT_ID, SCALEKIT_CLIENT_SECRET');
    process.exit(1);
  }

  console.log('🔧 Initializing Scalekit client...');
  const scalekit = new ScalekitClient(envUrl, clientId, clientSecret);

  // First, check if any organizations exist
  try {
    console.log('🔍 Checking for existing organizations...');
    const listResult = await scalekit.organization.listOrganization({});
    const orgs: any[] = (listResult as any).organizations ?? (listResult as any).data ?? [];
    
    if (orgs.length > 0) {
      console.log(`✅ Found ${orgs.length} existing organization(s):`);
      orgs.forEach((org: any) => {
        console.log(`   - ${org.displayName || org.name || 'Unnamed'} (ID: ${org.id})`);
      });
      console.log('\n💡 Add this to your .env file:');
      console.log(`SCALEKIT_ORGANIZATION_ID=${orgs[0].id}`);
      return;
    }

    console.log('📝 No organizations found. Creating one...');
  } catch (err: any) {
    console.error('⚠️  Error checking organizations:', err.message);
  }

  // Create a new organization
  try {
    const { organization } = await scalekit.organization.createOrganization('AgentMesh');
    console.log('✅ Organization created successfully!');
    console.log(`   Name: ${organization.displayName || organization.name || 'AgentMesh'}`);
    console.log(`   ID: ${organization.id}`);
    console.log('\n💡 Add this to your .env file:');
    console.log(`SCALEKIT_ORGANIZATION_ID=${organization.id}`);
  } catch (err: any) {
    console.error('❌ Failed to create organization:', err.message);
    if (err.response?.data) {
      console.error('   Details:', JSON.stringify(err.response.data, null, 2));
    }
    process.exit(1);
  }
}

createOrganization().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
