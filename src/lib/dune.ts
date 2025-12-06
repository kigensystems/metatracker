import type { DuneGraduatedToken } from './types';

const DUNE_API_BASE = 'https://api.dune.com/api/v1';
const QUERY_ID = '4124453';

interface DuneResponse {
  execution_id: string;
  query_id: number;
  state: string;
  result: {
    rows: DuneGraduatedToken[];
    metadata: {
      column_names: string[];
      result_set_bytes: number;
      total_row_count: number;
    };
  };
}

export async function fetchGraduatedTokens(apiKey: string): Promise<DuneGraduatedToken[]> {
  const response = await fetch(`${DUNE_API_BASE}/query/${QUERY_ID}/results`, {
    headers: {
      'X-Dune-API-Key': apiKey,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Dune API error: ${response.status} - ${error}`);
  }

  const data: DuneResponse = await response.json();

  if (data.state !== 'QUERY_STATE_COMPLETED') {
    throw new Error(`Query not completed: ${data.state}`);
  }

  return data.result.rows;
}

export async function getLatestResults(apiKey: string): Promise<DuneGraduatedToken[]> {
  // This endpoint gets cached results without using execution credits
  const response = await fetch(`${DUNE_API_BASE}/query/${QUERY_ID}/results/csv`, {
    headers: {
      'X-Dune-API-Key': apiKey,
    },
  });

  if (!response.ok) {
    // Fall back to JSON results
    return fetchGraduatedTokens(apiKey);
  }

  const csvText = await response.text();
  return parseCSV(csvText);
}

function parseCSV(csv: string): DuneGraduatedToken[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  const rows: DuneGraduatedToken[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
    const row: Record<string, string> = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });

    rows.push({
      mint: row.mint || row.token_mint || row.token_address || '',
      graduated_at: row.graduated_at || row.graduation_time || row.timestamp || '',
      bonding_curve_address: row.bonding_curve_address,
      creator: row.creator || row.deployer,
    });
  }

  return rows.filter(r => r.mint);
}
