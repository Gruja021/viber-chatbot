import * as readline from 'readline';
import dotenv from 'dotenv';

dotenv.config();

const API_BASE = process.env.WEBHOOK_BASE_URL || 'http://localhost:3000';
const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN;

if (!ADMIN_TOKEN) {
  console.error('ERROR: ADMIN_API_TOKEN environment variable is required');
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function apiCall(method: string, path: string, body?: object): Promise<any> {
  const url = `${API_BASE}${path}`;
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ADMIN_TOKEN}`,
    },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

function printStep(step: number, title: string) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  Step ${step}: ${title}`);
  console.log(`${'='.repeat(50)}\n`);
}

function printSuccess(msg: string) {
  console.log(`  [OK] ${msg}`);
}

function printError(msg: string) {
  console.error(`  [FAIL] ${msg}`);
}

async function step0_prerequisites(): Promise<{
  viberToken: string;
  firmName: string;
  slug: string;
  systemPrompt: string;
}> {
  printStep(0, 'Prerequisites');

  const firmName = await ask('  Firm name: ');
  if (!firmName) throw new Error('Firm name is required');

  const defaultSlug = firmName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const slugInput = await ask(`  Slug [${defaultSlug}]: `);
  const slug = slugInput || defaultSlug;

  const viberToken = await ask('  Viber Bot auth token: ');
  if (!viberToken) throw new Error('Viber token is required');

  const systemPrompt = await ask('  System prompt (or press Enter for default): ');

  return { viberToken, firmName, slug, systemPrompt };
}

async function step1_createTenant(params: {
  viberToken: string;
  firmName: string;
  slug: string;
  systemPrompt: string;
}): Promise<{ tenantId: string; slug: string }> {
  printStep(1, 'Create Tenant Record');

  const body: Record<string, any> = {
    slug: params.slug,
    firm_name: params.firmName,
    viber_auth_token: params.viberToken,
  };

  if (params.systemPrompt) {
    body.system_prompt = params.systemPrompt;
  }

  const tenant = await apiCall('POST', '/api/tenants', body);
  printSuccess(`Tenant created: id=${tenant.id}, slug=${tenant.slug}`);
  return { tenantId: tenant.id, slug: tenant.slug };
}

async function step2_setupChatwoot(tenantId: string): Promise<void> {
  printStep(2, 'Chatwoot Setup');

  const setupChatwoot = await ask('  Configure Chatwoot? (y/n) [y]: ');
  if (setupChatwoot.toLowerCase() === 'n') {
    console.log('  Skipping Chatwoot setup.');
    return;
  }

  const chatwootToken = await ask('  Chatwoot API token: ');
  const chatwootAccountId = await ask('  Chatwoot account ID: ');
  const inboxName = await ask('  Inbox name for this tenant: ');

  if (!chatwootToken || !chatwootAccountId || !inboxName) {
    throw new Error('Chatwoot token, account ID, and inbox name are required');
  }

  // Create inbox
  const chatwootBase = process.env.CHATWOOT_BASE_URL || 'http://localhost:3000';
  const inboxResponse = await fetch(
    `${chatwootBase}/api/v1/accounts/${chatwootAccountId}/inboxes`,
    {
      method: 'POST',
      headers: {
        'api_access_token': chatwootToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: inboxName,
        channel: { type: 'api' },
      }),
    }
  );

  if (!inboxResponse.ok) {
    const err = await inboxResponse.json();
    throw new Error(`Failed to create inbox: ${JSON.stringify(err)}`);
  }

  const inbox = await inboxResponse.json();
  printSuccess(`Inbox created: id=${inbox.id}, name=${inbox.name}`);

  // Assign agents
  const assignAgents = await ask('  Assign agents to inbox? (y/n) [n]: ');
  if (assignAgents.toLowerCase() === 'y') {
    // List available agents
    const agentsResponse = await fetch(
      `${chatwootBase}/api/v1/accounts/${chatwootAccountId}/agents`,
      {
        headers: { 'api_access_token': chatwootToken },
      }
    );

    if (agentsResponse.ok) {
      const agents = await agentsResponse.json();
      if (agents.length > 0) {
        console.log('\n  Available agents:');
        agents.forEach((a: any) => {
          console.log(`    [${a.id}] ${a.name} (${a.email})`);
        });
        const agentIdsStr = await ask('  Agent IDs to assign (comma-separated): ');
        const agentIds = agentIdsStr.split(',').map((id: string) => parseInt(id.trim(), 10)).filter(Boolean);

        if (agentIds.length > 0) {
          await fetch(
            `${chatwootBase}/api/v1/accounts/${chatwootAccountId}/inbox_members`,
            {
              method: 'POST',
              headers: {
                'api_access_token': chatwootToken,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                inbox_id: inbox.id,
                user_ids: agentIds,
              }),
            }
          );
          printSuccess(`${agentIds.length} agent(s) assigned to inbox`);
        }
      } else {
        console.log('  No agents found in this account.');
      }
    }
  }

  // Update tenant with Chatwoot details
  await apiCall('PUT', `/api/tenants/${tenantId}`, {
    chatwoot_account_id: parseInt(chatwootAccountId, 10),
    chatwoot_inbox_id: inbox.id,
    chatwoot_api_token: chatwootToken,
  });
  printSuccess('Tenant updated with Chatwoot configuration');
}

async function step3_registerWebhook(tenantId: string): Promise<void> {
  printStep(3, 'Register Viber Webhook');

  const result = await apiCall('POST', '/api/viber/register-webhook', {
    tenant_id: tenantId,
  });

  printSuccess(`Webhook registered: ${result.webhook_url}`);
}

async function step4_healthCheck(tenantId: string): Promise<void> {
  printStep(4, 'Health Check & Test');

  try {
    const report = await apiCall('GET', `/api/tenants/${tenantId}/health`);
    console.log('\n  Health check results:');
    for (const check of report.checks) {
      const icon = check.healthy ? '[OK]' : '[FAIL]';
      console.log(`    ${icon} ${check.check}: ${check.detail || ''}`);
    }

    if (report.allHealthy) {
      printSuccess('All health checks passed!');
    } else {
      printError('Some health checks failed. Review the results above.');
    }
  } catch (err: any) {
    // 503 still returns a body — try to parse it
    printError(`Health check request failed: ${err.message}`);
  }

  // Optional test message
  const sendTest = await ask('\n  Send a test message? (y/n) [n]: ');
  if (sendTest.toLowerCase() === 'y') {
    const viberUserId = await ask('  Viber user ID to send to: ');
    if (viberUserId) {
      try {
        const result = await apiCall('POST', '/api/viber/test-message', {
          tenant_id: tenantId,
          viber_user_id: viberUserId,
        });
        printSuccess(`Test message sent! Bot: ${result.bot_name}, webhook match: ${result.webhook_match}`);
      } catch (err: any) {
        printError(`Test message failed: ${err.message}`);
      }
    }
  }
}

async function main() {
  console.log('\n========================================');
  console.log('  Viber Chatbot — Tenant Onboarding');
  console.log('========================================');
  console.log(`  API: ${API_BASE}`);

  let tenantId: string | null = null;

  try {
    // Step 0: Collect prerequisites
    const prereqs = await step0_prerequisites();

    // Step 1: Create tenant
    const { tenantId: id } = await step1_createTenant(prereqs);
    tenantId = id;

    // Step 2: Chatwoot setup
    try {
      await step2_setupChatwoot(tenantId);
    } catch (err: any) {
      printError(`Chatwoot setup failed: ${err.message}`);
      const cont = await ask('  Continue anyway? (y/n) [y]: ');
      if (cont.toLowerCase() === 'n') {
        console.log('\n  Onboarding aborted. Tenant was created — clean up manually if needed.');
        rl.close();
        return;
      }
    }

    // Step 3: Register Viber webhook
    try {
      await step3_registerWebhook(tenantId);
    } catch (err: any) {
      printError(`Webhook registration failed: ${err.message}`);
      const cont = await ask('  Continue anyway? (y/n) [y]: ');
      if (cont.toLowerCase() === 'n') {
        console.log('\n  Onboarding aborted at Step 3.');
        rl.close();
        return;
      }
    }

    // Step 4: Health check + test
    await step4_healthCheck(tenantId);

    console.log('\n========================================');
    console.log('  Onboarding Complete!');
    console.log(`  Tenant ID: ${tenantId}`);
    console.log('========================================\n');
  } catch (err: any) {
    printError(`Onboarding failed: ${err.message}`);
    if (tenantId) {
      console.log(`  Tenant was created (id: ${tenantId}). Fix issues and retry remaining steps manually.`);
    }
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
