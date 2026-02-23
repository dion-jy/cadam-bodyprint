const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ANTHROPIC_REFRESH_TOKEN = Deno.env.get('ANTHROPIC_REFRESH_TOKEN') ?? '';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const OAUTH_TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token';
const OAUTH_HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'claude-cli/2.1.2 (external, cli)',
  'x-app': 'cli',
};

// In-memory token cache (persists across requests within same Edge Function instance)
let cachedAccessToken = Deno.env.get('ANTHROPIC_OAUTH_TOKEN') ?? '';
// If token loaded from env var, assume valid for 8h from startup; otherwise 0 = expired
let tokenExpiresAt = cachedAccessToken ? Date.now() + 8 * 60 * 60 * 1000 : 0;

async function getValidAccessToken(): Promise<string> {
  const now = Date.now();
  // Use cached token if still valid (5 min buffer)
  if (cachedAccessToken && tokenExpiresAt > now + 5 * 60 * 1000) {
    return cachedAccessToken;
  }
  if (!ANTHROPIC_REFRESH_TOKEN) return cachedAccessToken;

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: OAUTH_HEADERS,
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: OAUTH_CLIENT_ID,
      refresh_token: ANTHROPIC_REFRESH_TOKEN,
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);

  const data = await res.json() as { access_token: string; expires_in: number };
  cachedAccessToken = data.access_token;
  tokenExpiresAt = now + data.expires_in * 1000;
  return cachedAccessToken;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (ANTHROPIC_REFRESH_TOKEN || cachedAccessToken) {
    const token = await getValidAccessToken();
    return {
      'Authorization': `Bearer ${token}`,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14',
      'user-agent': 'claude-cli/2.1.2 (external, cli)',
      'x-app': 'cli',
    };
  }
  return {
    'x-api-key': ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
  };
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

async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 4096,
): Promise<string> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...await getAuthHeaders(),
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  if (data.content && data.content.length > 0 && data.content[0].type === 'text') {
    return data.content[0].text;
  }
  throw new Error('No text content in response');
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
      let code = await callClaude(CODE_GEN_SYSTEM_PROMPT, userPrompt, 8192);

      // Strip markdown code blocks if the model wrapped them
      const codeBlockRegex = /^```(?:openscad)?\n?([\s\S]*?)\n?```$/;
      const match = code.match(codeBlockRegex);
      if (match) {
        code = match[1].trim();
      }

      // Basic validation: must contain include and at least one geometric primitive
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

    if (!ANTHROPIC_API_KEY && !ANTHROPIC_REFRESH_TOKEN) {
      return new Response(
        JSON.stringify({ error: 'No API credentials configured (set ANTHROPIC_REFRESH_TOKEN or ANTHROPIC_API_KEY)' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Step 1: Decompose into parts + interface contracts
    const decompositionRaw = await callClaude(
      DECOMPOSITION_SYSTEM_PROMPT,
      prompt,
      4096,
    );

    let decomposition: DecompositionResult;
    try {
      // Try to extract JSON from the response (handle potential markdown wrapping)
      let jsonStr = decompositionRaw.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      decomposition = JSON.parse(jsonStr);
    } catch {
      return new Response(
        JSON.stringify({
          error: 'Failed to parse decomposition',
          raw: decompositionRaw,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Step 2: Generate code for each part (in parallel)
    const partResults = await Promise.all(
      decomposition.parts.map((part) =>
        generatePartCode(part, decomposition.interface_contracts, prompt)
      ),
    );

    // Step 3: Build combined assembly preview code
    let assemblyPreview = 'include <BOSL2/std.scad>\n\n';
    assemblyPreview += '// Assembly preview — all parts stacked\n';
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

    // Add module definitions
    for (const result of partResults) {
      if (result.code && !result.error) {
        // Wrap each part's code in a module for assembly preview
        // Strip the include line since we have it at the top
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
