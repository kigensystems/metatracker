export interface SnapshotSourceMetadataLike {
  state?: string;
  rowCount: number;
  totalRowCount: number;
}

export interface SnapshotInputLike {
  date: string;
  tokens: readonly unknown[];
  sourceMetadata?: SnapshotSourceMetadataLike;
  allowHistorical?: boolean;
}

export interface ReplacementInput {
  incomingTokenCount: number;
  existingTokenCount: number;
  existingSnapshotTokenCount?: number;
  replaceExisting?: boolean;
  allowPartialOverwrite?: boolean;
  minExistingTokenRetentionRatio?: number;
}

export interface SnapshotMintLike {
  mint: string;
}

export function getSnapshotMergeStats(
  existing: readonly SnapshotMintLike[],
  incoming: readonly SnapshotMintLike[],
) {
  const existingMints = new Set(existing.map((token) => token.mint));
  const incomingMints = new Set(incoming.map((token) => token.mint));

  if (incomingMints.size !== incoming.length) {
    throw new Error('Refusing snapshot input with duplicate token mints.');
  }

  let preservedCount = 0;
  for (const mint of existingMints) {
    if (!incomingMints.has(mint)) preservedCount += 1;
  }

  return {
    incomingCount: incomingMints.size,
    preservedCount,
    finalCount: incomingMints.size + preservedCount,
  };
}

export function assertSourceExecutionNotOlder(incoming: string, existing?: string) {
  const incomingTime = Date.parse(incoming);
  if (!Number.isFinite(incomingTime)) {
    throw new Error(`Refusing source result with invalid execution timestamp (${incoming}).`);
  }

  if (!existing) return;

  const existingTime = Date.parse(existing);
  if (Number.isFinite(existingTime) && incomingTime < existingTime) {
    throw new Error(
      `Refusing older source result (${incoming}); existing snapshot uses ${existing}.`,
    );
  }
}

export function validateSnapshotInput(args: SnapshotInputLike, today: string) {
  if (args.tokens.length === 0) {
    throw new Error(`Refusing to store empty snapshot for ${args.date}.`);
  }

  if (args.sourceMetadata) {
    if (args.sourceMetadata.state && args.sourceMetadata.state !== 'QUERY_STATE_COMPLETED') {
      throw new Error(`Refusing to store incomplete Dune result (${args.sourceMetadata.state}).`);
    }

    if (args.sourceMetadata.rowCount < args.sourceMetadata.totalRowCount) {
      throw new Error(
        `Refusing to store partial Dune result (${args.sourceMetadata.rowCount}/${args.sourceMetadata.totalRowCount} rows).`,
      );
    }

    if (args.tokens.length < args.sourceMetadata.rowCount) {
      throw new Error(
        `Refusing to store malformed Dune result (${args.tokens.length}/${args.sourceMetadata.rowCount} usable token rows).`,
      );
    }
  }

  if (args.date !== today && !args.allowHistorical) {
    throw new Error(`Cannot overwrite historical data for ${args.date}. Only today (${today}) can be updated.`);
  }
}

export function evaluateSnapshotReplacement(input: ReplacementInput) {
  const existingSnapshotCount = input.existingSnapshotTokenCount ?? input.existingTokenCount;
  const hasGoodExistingSnapshot = input.existingTokenCount > 0 && existingSnapshotCount > 0;

  if (hasGoodExistingSnapshot && input.replaceExisting === false) {
    return { skip: true as const, reason: 'snapshot-exists' as const };
  }

  const minRetentionRatio = input.minExistingTokenRetentionRatio ?? 0.5;
  if (
    hasGoodExistingSnapshot
    && !input.allowPartialOverwrite
    && input.incomingTokenCount < input.existingTokenCount * minRetentionRatio
  ) {
    throw new Error(
      `Refusing to replace ${input.existingTokenCount} existing tokens with ${input.incomingTokenCount}; possible partial upstream response.`,
    );
  }

  return { skip: false as const };
}
