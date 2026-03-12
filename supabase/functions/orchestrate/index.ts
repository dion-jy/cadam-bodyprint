const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ProviderId = 'anthropic' | 'openai';
type AuthMode = 'oauth' | 'api_key' | 'auto';

interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface InterfaceContract {
  type: 'rect' | 'circular';
  w?: number;
  d?: number;
  dia?: number;
  socket_depth: number;
  clearance_mm: number;
}

interface PartSpec {
  name: string;
  description: string;
  dims: { w: number; h: number; d: number };
  interfaces: Record<string, {
    type: string;
    role: 'socket' | 'plug';
    contract_ref: string;
  }>;
}

interface DecompositionResult {
  parts: PartSpec[];
  interface_contracts: Record<string, InterfaceContract>;
  assembly_notes: string;
}

interface PartResult {
  name: string;
  code: string;
  error?: string;
  retries: number;
}

interface ProviderAdapter {
  provider: ProviderId;
  authMode: 'oauth' | 'api_key';
  model: string;
  callText(systemPrompt: string, userPrompt: string, maxTokens?: number): Promise<string>;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_DEFAULT_MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-6';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const ANTHROPIC_MODE = normalizeAuthMode(Deno.env.get('ANTHROPIC_MODE'));
const ANTHROPIC_OAUTH_TOKEN_URL = Deno.env.get('ANTHROPIC_OAUTH_TOKEN_URL') ?? 'https://console.anthropic.com/v1/oauth/token';
const ANTHROPIC_OAUTH_CLIENT_ID = Deno.env.get('ANTHROPIC_OAUTH_CLIENT_ID') ?? '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const ANTHROPIC_OAUTH_HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'claude-cli/2.1.2 (external, cli)',
  'x-app': 'cli',
};

const OPENAI_API_URL = Deno.env.get('OPENAI_API_URL') ?? 'https://api.openai.com/v1/responses';
const OPENAI_DEFAULT_MODEL = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4.1';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const OPENAI_MODE = normalizeAuthMode(Deno.env.get('OPENAI_MODE'));
const OPENAI_OAUTH_TOKEN_URL = Deno.env.get('OPENAI_OAUTH_TOKEN_URL') ?? '';
const OPENAI_OAUTH_CLIENT_ID = Deno.env.get('OPENAI_OAUTH_CLIENT_ID') ?? '';
const OPENAI_OAUTH_CLIENT_SECRET = Deno.env.get('OPENAI_OAUTH_CLIENT_SECRET') ?? '';

const CADAM_LLM_PROVIDER = normalizeProvider(Deno.env.get('CADAM_LLM_PROVIDER'));

const tokenCache: Partial<Record<ProviderId, OAuthTokens>> = {};

function normalizeProvider(value: string | undefined): ProviderId {
  return value?.toLowerCase() === 'openai' ? 'openai' : 'anthropic';
}

function normalizeAuthMode(value: string | undefined): AuthMode {
  switch (value?.toLowerCase()) {
    case 'oauth':
      return 'oauth';
    case 'api_key':
      return 'api_key';
    default:
      return 'auto';
  }
}

function getEnvOAuthTokens(provider: ProviderId): OAuthTokens {
  const prefix = provider.toUpperCase();
  const accessToken = Deno.env.get(`${prefix}_OAUTH_ACCESS_TOKEN`) ?? '';
  const refreshToken = Deno.env.get(`${prefix}_OAUTH_REFRESH_TOKEN`) ?? '';
  const expiresAtRaw = Deno.env.get(`${prefix}_OAUTH_EXPIRES_AT`) ?? '';
  const expiresAt = Number.parseInt(expiresAtRaw, 10);
  return {
    accessToken,
    refreshToken,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
  };
}

function hasOAuthCredentials(provider: ProviderId): boolean {
  const envTokens = getEnvOAuthTokens(provider);
  return Boolean(
    envTokens.accessToken ||
      envTokens.refreshToken ||
      tokenCache[provider]?.accessToken,
  );
}

async function loadTokensFromDB(provider: ProviderId): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/oauth_tokens?id=eq.${provider}&select=access_token,refresh_token,expires_at`,
    {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    },
  );

  if (!res.ok) return;

  const rows = await res.json() as Array<{
    access_token: string;
    refresh_token: string;
    expires_at: number;
  }>;

  if (rows.length === 0) return;

  tokenCache[provider] = {
    accessToken: rows[0].access_token,
    refreshToken: rows[0].refresh_token,
    expiresAt: rows[0].expires_at,
  };
}

async function saveTokensToDB(provider: ProviderId, tokens: OAuthTokens): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;

  await fetch(`${SUPABASE_URL}/rest/v1/oauth_tokens?on_conflict=id`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify([{
      id: provider,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: tokens.expiresAt,
      updated_at: new Date().toISOString(),
    }]),
  });
}

async function refreshOAuthTokens(provider: ProviderId, refreshToken: string): Promise<OAuthTokens> {
  if (provider === 'anthropic') {
    if (!ANTHROPIC_OAUTH_CLIENT_ID) {
      throw new Error('ANTHROPIC_OAUTH_CLIENT_ID is required for Anthropic OAuth refresh');
    }

    const res = await fetch(ANTHROPIC_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: ANTHROPIC_OAUTH_HEADERS,
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: ANTHROPIC_OAUTH_CLIENT_ID,
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic token refresh failed: ${await res.text()}`);
    }

    const data = await res.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
  }

  if (!OPENAI_OAUTH_TOKEN_URL || !OPENAI_OAUTH_CLIENT_ID) {
    throw new Error('OPENAI_OAUTH_TOKEN_URL and OPENAI_OAUTH_CLIENT_ID are required for OpenAI OAuth refresh');
  }

  const body: Record<string, string> = {
    grant_type: 'refresh_token',
    client_id: OPENAI_OAUTH_CLIENT_ID,
    refresh_token: refreshToken,
  };

  if (OPENAI_OAUTH_CLIENT_SECRET) {
    body.client_secret = OPENAI_OAUTH_CLIENT_SECRET;
  }

  const res = await fetch(OPENAI_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`OpenAI token refresh failed: ${await res.text()}`);
  }

  const data = await res.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: Date.now() + (data.expires_in ?? 8 * 60 * 60) * 1000,
  };
}

async function getOAuthAccessToken(provider: ProviderId): Promise<string> {
  const now = Date.now();
  const cached = tokenCache[provider];
  if (cached?.accessToken && cached.expiresAt > now + 5 * 60 * 1000) {
    return cached.accessToken;
  }

  await loadTokensFromDB(provider);
  const loaded = tokenCache[provider];
  if (loaded?.accessToken && loaded.expiresAt > now + 5 * 60 * 1000) {
    return loaded.accessToken;
  }

  const envTokens = getEnvOAuthTokens(provider);
  if (!tokenCache[provider]?.accessToken && envTokens.accessToken) {
    tokenCache[provider] = envTokens;
  } else if (!tokenCache[provider] && (envTokens.accessToken || envTokens.refreshToken)) {
    tokenCache[provider] = envTokens;
  }

  const current = tokenCache[provider];
  if (current?.accessToken && current.expiresAt > now + 5 * 60 * 1000) {
    return current.accessToken;
  }

  if (!current?.refreshToken) {
    return current?.accessToken ?? '';
  }

  const refreshed = await refreshOAuthTokens(provider, current.refreshToken);
  tokenCache[provider] = refreshed;
  await saveTokensToDB(provider, refreshed);
  return refreshed.accessToken;
}

async function resolveProviderAuthMode(provider: ProviderId): Promise<'oauth' | 'api_key'> {
  const configuredMode = provider === 'anthropic' ? ANTHROPIC_MODE : OPENAI_MODE;
  if (configuredMode === 'oauth') return 'oauth';
  if (configuredMode === 'api_key') return 'api_key';

  await loadTokensFromDB(provider);

  if (provider === 'anthropic') {
    return hasOAuthCredentials('anthropic') ? 'oauth' : 'api_key';
  }

  return hasOAuthCredentials('openai') ? 'oauth' : 'api_key';
}

function extractOpenAIText(data: unknown): string {
  if (typeof data !== 'object' || data === null) {
    throw new Error('OpenAI response was not an object');
  }

  const response = data as {
    output_text?: string;
    output?: Array<{
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };

  if (response.output_text) {
    return response.output_text;
  }

  const text = response.output
    ?.flatMap((item) => item.content ?? [])
    .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('');

  if (text) {
    return text;
  }

  throw new Error('No text content in OpenAI response');
}

async function createAnthropicAdapter(authMode: 'oauth' | 'api_key'): Promise<ProviderAdapter> {
  if (authMode === 'api_key' && !ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is required when ANTHROPIC_MODE=api_key');
  }

  return {
    provider: 'anthropic',
    authMode,
    model: ANTHROPIC_DEFAULT_MODEL,
    async callText(systemPrompt: string, userPrompt: string, maxTokens = 4096): Promise<string> {
      const authHeaders =
        authMode === 'oauth'
          ? (() => getOAuthAccessToken('anthropic').then((token) => {
            if (!token) {
              throw new Error('Anthropic OAuth token is not configured');
            }
            return {
              'Authorization': `Bearer ${token}`,
              'anthropic-version': '2023-06-01',
              'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14',
              'user-agent': 'claude-cli/2.1.2 (external, cli)',
              'x-app': 'cli',
            };
          }))()
          : Promise.resolve({
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          });

      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await authHeaders),
        },
        body: JSON.stringify({
          model: ANTHROPIC_DEFAULT_MODEL,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json() as {
        content?: Array<{ type?: string; text?: string }>;
      };

      if (data.content?.[0]?.type === 'text' && data.content[0].text) {
        return data.content[0].text;
      }

      throw new Error('No text content in Anthropic response');
    },
  };
}

async function createOpenAIAdapter(authMode: 'oauth' | 'api_key'): Promise<ProviderAdapter> {
  if (authMode === 'api_key' && !OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required when OPENAI_MODE=api_key');
  }

  return {
    provider: 'openai',
    authMode,
    model: OPENAI_DEFAULT_MODEL,
    async callText(systemPrompt: string, userPrompt: string, maxTokens = 4096): Promise<string> {
      const token =
        authMode === 'oauth'
          ? await getOAuthAccessToken('openai')
          : OPENAI_API_KEY;

      if (!token) {
        throw new Error('OpenAI credentials are not configured');
      }

      const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          model: OPENAI_DEFAULT_MODEL,
          instructions: systemPrompt,
          input: userPrompt,
          max_output_tokens: maxTokens,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }

      return extractOpenAIText(await response.json());
    },
  };
}

async function getProviderAdapter(): Promise<ProviderAdapter> {
  const provider = CADAM_LLM_PROVIDER;
  const authMode = await resolveProviderAuthMode(provider);

  if (provider === 'openai') {
    return createOpenAIAdapter(authMode);
  }

  return createAnthropicAdapter(authMode);
}

const DECOMPOSITION_SYSTEM_PROMPT = `You are an expert CAD engineer specializing in multi-part 3D printable assemblies.
Given a text description of a physical object, decompose it into separate 3D-printable parts with precise interface contracts.

Return ONLY valid JSON (no markdown, no code blocks) in this exact format:
{
  "parts": [
    {
      "name": "part_name_snake_case",
      "description": "What this part is, key features, internal components to accommodate",
      "dims": {"w": <mm>, "h": <mm>, "d": <mm>},
      "interfaces": {
        "top": {"type": "socket|plug", "role": "socket|plug", "contract_ref": "contract_name"},
        "bottom": {"type": "socket|plug", "role": "socket|plug", "contract_ref": "contract_name"}
      }
    }
  ],
  "interface_contracts": {
    "contract_name": {
      "type": "rect|circular",
      "w": <mm if rect>,
      "d": <mm if rect>,
      "dia": <mm if circular>,
      "socket_depth": <mm>,
      "clearance_mm": 0.3
    }
  },
  "assembly_notes": "Brief notes about assembly order and orientation"
}

Rules:
- Each part must be independently 3D printable (flat base, no impossible overhangs)
- Interface contracts define how parts connect: sockets (female) receive plugs (male)
- Socket inner dims = contract dims, Plug outer dims = contract dims - clearance_mm on each side
- Parts stack bottom-to-top by default
- Use snake_case for all names
- Include 0.3mm clearance for PLA snap-fit connections
- Account for internal components (electronics, servos, etc.) in part dimensions`;

function buildCodeGenPrompt(
  part: PartSpec,
  contracts: Record<string, InterfaceContract>,
  fullDescription: string,
): string {
  const interfaceDetails = Object.entries(part.interfaces).map(([position, iface]) => {
    if (!iface) return `${position}: no interface defined`;
    const contract = contracts[iface.contract_ref];
    if (!contract) return `${position}: no contract found`;
    const dims = contract.type === 'circular'
      ? `diameter=${contract.dia}mm`
      : `${contract.w}x${contract.d}mm`;
    return `${position}: ${iface.role} (${contract.type}, ${dims}, depth=${contract.socket_depth}mm, clearance=${contract.clearance_mm}mm)`;
  });

  return `Generate OpenSCAD code for the "${part.name}" part of this assembly:
"${fullDescription}"

Part description: ${part.description}
Dimensions: ${part.dims.w}x${part.dims.h}x${part.dims.d}mm (WxHxD)

Interface connections:
${interfaceDetails.join('\n')}

The part must:
- Be 3D printable (print with flat base down, no supports needed ideally)
- Use BOSL2 library (include <BOSL2/std.scad>)
- Have socket/plug features exactly matching the interface contracts
- Socket = recessed cavity matching contract dims
- Plug = protruding tab = contract dims minus clearance on each side
- Include $fn=64 for smooth curves
- Have all dimensions as named variables at the top
- Include internal cavities/holes for any components mentioned in the description`;
}

const CODE_GEN_SYSTEM_PROMPT = `You are an expert OpenSCAD programmer using the BOSL2 library.
Generate ONLY raw OpenSCAD code (no markdown, no code blocks, no explanation).
The code must:
- Start with include <BOSL2/std.scad>
- Define all dimensions as named variables at the top
- Use $fn=64 for smooth curves
- Be a complete, self-contained module that renders when executed
- Create proper socket (recessed) and plug (protruding) features for assembly
- Be 3D-printable: manifold geometry, flat base, reasonable wall thicknesses (>=1.5mm)
- For sockets: use difference() to cut the cavity
- For plugs: use union() to add the protruding tab
- Socket inner size = contract size exactly
- Plug outer size = contract size - (clearance * 2) on each lateral dimension

Return ONLY the OpenSCAD code. No explanations, no markdown.`;

async function generatePartCode(
  adapter: ProviderAdapter,
  part: PartSpec,
  contracts: Record<string, InterfaceContract>,
  fullDescription: string,
  maxRetries = 3,
): Promise<PartResult> {
  let lastError = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const userPrompt = attempt === 0
      ? buildCodeGenPrompt(part, contracts, fullDescription)
      : `${buildCodeGenPrompt(part, contracts, fullDescription)}

PREVIOUS ATTEMPT FAILED with this error:
${lastError}

Fix the issue and regenerate the complete code.`;

    try {
      let code = await adapter.callText(CODE_GEN_SYSTEM_PROMPT, userPrompt, 8192);

      const codeBlockRegex = /^```(?:openscad)?\n?([\s\S]*?)\n?```$/;
      const match = code.match(codeBlockRegex);
      if (match) {
        code = match[1].trim();
      }

      if (!code.includes('include') && !code.includes('use')) {
        lastError = 'Generated code missing BOSL2 include statement';
        continue;
      }

      const hasGeometry = /\b(cube|sphere|cylinder|cuboid|cyl|rect_tube|tube|prismoid|diff|union|difference)\b/.test(code);
      if (!hasGeometry) {
        lastError = 'Generated code has no geometry primitives';
        continue;
      }

      return { name: part.name, code, retries: attempt };
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';
    }
  }

  return {
    name: part.name,
    code: '',
    error: `Failed after ${maxRetries} retries: ${lastError}`,
    retries: maxRetries,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const { prompt }: { prompt: string } = await req.json();

    if (!prompt || prompt.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Prompt is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const adapter = await getProviderAdapter();

    const decompositionRaw = await adapter.callText(
      DECOMPOSITION_SYSTEM_PROMPT,
      prompt,
      4096,
    );

    let decomposition: DecompositionResult;
    try {
      let jsonStr = decompositionRaw.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      decomposition = JSON.parse(jsonStr);
    } catch {
      return new Response(
        JSON.stringify({
          error: `Failed to parse decomposition from ${adapter.provider}/${adapter.authMode}`,
          raw: decompositionRaw,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const partResults = await Promise.all(
      decomposition.parts.map((part) =>
        generatePartCode(adapter, part, decomposition.interface_contracts, prompt)
      ),
    );

    let assemblyPreview = 'include <BOSL2/std.scad>\n\n';
    assemblyPreview += `// Assembly preview — provider=${adapter.provider} auth=${adapter.authMode}\n`;
    assemblyPreview += '$fn = 64;\n\n';

    let stackHeight = 0;
    for (const part of decomposition.parts) {
      const result = partResults.find((r) => r.name === part.name);
      if (result && result.code && !result.error) {
        assemblyPreview += `// ${part.name}\n`;
        assemblyPreview += `color(rands(0.3, 0.9, 3)) translate([0, 0, ${stackHeight}])\n`;
        assemblyPreview += `  ${part.name}();\n\n`;
      }
      stackHeight += part.dims.h;
    }

    for (const result of partResults) {
      if (result.code && !result.error) {
        const codeWithoutInclude = result.code
          .replace(/^\s*include\s*<[^>]+>\s*;?\s*\n/gm, '')
          .replace(/^\s*use\s*<[^>]+>\s*;?\s*\n/gm, '');
        assemblyPreview += `module ${result.name}() {\n`;
        assemblyPreview += codeWithoutInclude
          .split('\n')
          .map((line: string) => '  ' + line)
          .join('\n');
        assemblyPreview += '\n}\n\n';
      }
    }

    return new Response(
      JSON.stringify({
        decomposition,
        parts: partResults,
        assemblyPreview,
        provider: adapter.provider,
        authMode: adapter.authMode,
        model: adapter.model,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error('Orchestrate error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
